import { WxpDocumentSchema } from "./schema.js";
import type {
  WxpDocument,
  WxpOperation,
  IncludeNode,
  IfNode,
  ShellNode,
  StringOpNode,
} from "./schema.js";

/**
 * Returns [start, end] pairs (byte offsets) of code-fence regions in content.
 * WXP tags inside these regions must be skipped (WXP-01).
 */
export function extractCodeFenceRegions(content: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  // Match ``` optionally followed by language specifier on same line, then content, then closing ```
  const fenceRegex = /^```[^\n]*\n[\s\S]*?^```/gm;
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(content)) !== null) {
    regions.push([m.index, m.index + m[0].length]);
  }
  return regions;
}

/** Returns true if `pos` falls within any dead zone. */
function inDeadZone(pos: number, regions: Array<[number, number]>): boolean {
  return regions.some(([s, e]) => pos >= s && pos < e);
}

/**
 * Parse raw markdown content into a WxpDocument AST.
 * Tags inside fenced code blocks are treated as opaque (WXP-01).
 */
export function parseWxpDocument(content: string, filePath: string): WxpDocument {
  const deadZones = extractCodeFenceRegions(content);
  const operations: WxpOperation[] = [];

  // ── <gsd-execute>...</gsd-execute> ────────────────────────────────────────
  const executeRegex = /<gsd-execute>([\s\S]*?)<\/gsd-execute>/g;
  let m: RegExpExecArray | null;
  while ((m = executeRegex.exec(content)) !== null) {
    if (inDeadZone(m.index, deadZones)) continue;
    operations.push({ type: "execute", children: parseExecuteChildren(m[1]) });
  }

  // ── <gsd-paste name="..." /> ──────────────────────────────────────────────
  const pasteRegex = /<gsd-paste\s+name="([^"]+)"\s*\/>/g;
  while ((m = pasteRegex.exec(content)) !== null) {
    if (inDeadZone(m.index, deadZones)) continue;
    operations.push({ type: "paste", name: m[1] });
  }

  // ── <gsd-arguments>...</gsd-arguments> ───────────────────────────────────
  const argsRegex = /<gsd-arguments>([\s\S]*?)<\/gsd-arguments>/g;
  while ((m = argsRegex.exec(content)) !== null) {
    if (inDeadZone(m.index, deadZones)) continue;
    operations.push(parseArgumentsBlock(m[1]));
  }

  // ── <gsd-include> tags (INC-01, INC-02) ──────────────────────────────────
  // Self-closing: <gsd-include path="..." /> or with-children: <gsd-include ...>...</gsd-include>
  const includeSelfClose = /<gsd-include\s([^>]*?)\/>/g;
  while ((m = includeSelfClose.exec(content)) !== null) {
    if (inDeadZone(m.index, deadZones)) continue;
    operations.push(parseIncludeTag(m[1], ""));
  }
  const includeWithChildren = /<gsd-include\s([^>]*?)>([\s\S]*?)<\/gsd-include>/g;
  while ((m = includeWithChildren.exec(content)) !== null) {
    if (inDeadZone(m.index, deadZones)) continue;
    operations.push(parseIncludeTag(m[1], m[2]));
  }

  // ── <gsd-version v="..." (do-not-update)? /> ─────────────────────────────
  const versionRegex = /<gsd-version\s+v="([^"]+)"(\s+do-not-update)?\s*\/>/g;
  while ((m = versionRegex.exec(content)) !== null) {
    if (inDeadZone(m.index, deadZones)) continue;
    operations.push({ type: "version", v: m[1], doNotUpdate: Boolean(m[2]) });
  }

  return WxpDocumentSchema.parse({ filePath, operations });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseExecuteChildren(inner: string): WxpOperation[] {
  const children: WxpOperation[] = [];
  let m: RegExpExecArray | null;

  // <shell command="..." result="...">args text</shell>
  const shellRegex =
    /<shell\s+command="([^"]+)"(?:\s+result="([^"]+)")?[^>]*>([\s\S]*?)<\/shell>/g;
  while ((m = shellRegex.exec(inner)) !== null) {
    const rawArgs = m[3]?.trim() ?? "";
    const args = rawArgs.length > 0 ? rawArgs.split(/\s+/) : [];
    const node: ShellNode = {
      type: "shell",
      command: m[1],
      result: m[2] ?? "result",
      args,
    };
    children.push(node);
  }

  // <if var="...">...</if>
  const ifRegex = /<if\s+var="([^"]+)">([\s\S]*?)<\/if>/g;
  while ((m = ifRegex.exec(inner)) !== null) {
    const ifVar = m[1];
    const ifInner = m[2];
    const equalsM = /<equals\s+value="([^"]+)"\s*\/>/.exec(ifInner);
    const startsM = /<starts-with\s+value="([^"]+)"\s*\/>/.exec(ifInner);
    const cond = equalsM
      ? ({ type: "equals" as const, value: equalsM[1] })
      : startsM
        ? ({ type: "starts-with" as const, value: startsM[1] })
        : null;
    if (!cond) continue;
    const node: IfNode = {
      type: "if",
      var: ifVar,
      condition: cond,
      children: parseExecuteChildren(ifInner),
    };
    children.push(node);
  }

  // <string-op op="split" var="..." delimiter="..." result="..." />
  const stringOpRegex =
    /<string-op\s+op="([^"]+)"\s+var="([^"]+)"\s+delimiter="([^"]+)"\s+result="([^"]+)"\s*\/>/g;
  while ((m = stringOpRegex.exec(inner)) !== null) {
    if (m[1] !== "split") continue; // only "split" supported in v1
    const node: StringOpNode = {
      type: "string-op",
      op: "split",
      var: m[2],
      delimiter: m[3],
      result: m[4],
    };
    children.push(node);
  }

  return children;
}

function parseArgumentsBlock(inner: string): WxpOperation {
  const positionals: Array<{ name: string; greedy: boolean }> = [];
  const flags: Array<{ name: string; boolean: boolean }> = [];
  let m: RegExpExecArray | null;

  const posRegex = /<positional\s+name="([^"]+)"(\s+greedy)?\s*\/>/g;
  while ((m = posRegex.exec(inner)) !== null) {
    positionals.push({ name: m[1], greedy: Boolean(m[2]) });
  }

  const flagRegex = /<flag\s+name="([^"]+)"(\s+boolean)?\s*\/>/g;
  while ((m = flagRegex.exec(inner)) !== null) {
    flags.push({ name: m[1], boolean: Boolean(m[2]) });
  }

  return { type: "arguments", positionals, flags };
}

function parseIncludeTag(attrs: string, children: string): IncludeNode {
  const pathM = /path="([^"]+)"/.exec(attrs);
  const inclArgs = /include-arguments/.test(attrs);
  const argMappings: Array<{ name: string; as: string }> = [];
  let m: RegExpExecArray | null;

  const argMapRegex = /<arg\s+name="([^"]+)"\s+as="([^"]+)"\s*\/>/g;
  while ((m = argMapRegex.exec(children)) !== null) {
    argMappings.push({ name: m[1], as: m[2] });
  }

  return {
    type: "include",
    path: pathM?.[1] ?? "",
    includeArguments: inclArgs,
    argMappings,
  };
}
