import fs from "node:fs";
import path from "node:path";
import { extractWxpTags, spliceContent, extractCodeFenceRegions, inDeadZone } from "./parser.js";
import { createVariableStore } from "./variables.js";
import { parseArguments } from "./arguments.js";
import { executeBlock } from "./executor.js";
import { applyPaste, WxpPasteError } from "./paste.js";
import { checkTrustedPath } from "./security.js";
import type {
  WxpSecurityConfig,
  WxpExecContext,
  DisplayLevel,
  DisplayCallback,
} from "../schemas/wxp.zod.js";

export { WxpExecutionError } from "./executor.js";
export { WxpShellError } from "./shell.js";
export { WxpPasteError } from "./paste.js";
export { WxpStringOpError } from "./string-ops.js";
export { WxpArgumentsError } from "./arguments.js";
export type { DisplayCallback, DisplayLevel, WxpExecContext };

const MAX_ITERATIONS = 50;
const NOOP_DISPLAY: DisplayCallback = () => {};

export class WxpProcessingError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly cause: Error,
    public readonly variableSnapshot: Record<string, string>,
    public readonly pendingOperations: string[],
    public readonly completedOperations: string[],
  ) {
    super(
      [
        `WXP Processing Error`,
        `File: ${filePath}`,
        `Error: ${cause.message}`,
        `Variable Namespace: ${JSON.stringify(variableSnapshot, null, 2)}`,
        `Pending Operations: [${pendingOperations.join(", ")}]`,
        `Completed Operations: [${completedOperations.join(", ")}]`,
      ].join("\n"),
    );
    this.name = "WxpProcessingError";
  }
}

export function processWxp(
  content: string,
  filePath: string,
  config: WxpSecurityConfig,
  projectRoot: string,
  pkgRoot: string,
  rawArguments = "",
  onDisplay: DisplayCallback = NOOP_DISPLAY,
): string {
  const pathCheck = checkTrustedPath(filePath, config, projectRoot, pkgRoot);
  if (!pathCheck.ok) {
    throw new WxpProcessingError(filePath, new Error(pathCheck.reason), {}, [], []);
  }
  return runLoop(content, filePath, config, projectRoot, pkgRoot, rawArguments, onDisplay);
}

export function processWxpTrustedContent(
  content: string,
  virtualFilePath: string,
  config: WxpSecurityConfig,
  projectRoot: string,
  pkgRoot: string,
  rawArguments = "",
  onDisplay: DisplayCallback = NOOP_DISPLAY,
): string {
  const trusted: WxpSecurityConfig = {
    ...config,
    trustedPaths: [
      ...config.trustedPaths,
      { position: "absolute", path: path.dirname(path.resolve(virtualFilePath)) },
    ],
  };
  return runLoop(content, virtualFilePath, trusted, projectRoot, pkgRoot, rawArguments, onDisplay);
}

function runLoop(
  content: string,
  filePath: string,
  config: WxpSecurityConfig,
  projectRoot: string,
  pkgRoot: string,
  rawArguments: string,
  onDisplay: DisplayCallback,
): string {
  const vars = createVariableStore();
  const done: string[] = [];
  let current = content;

  const ctx: WxpExecContext = { config, projectRoot, pkgRoot, onDisplay };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const tags   = extractWxpTags(current);
    const active = tags.filter((t) => t.node.tag !== "gsd-version");
    if (active.length === 0) break;

    const pending = active.map((t) => t.node.tag);

    try {
      let progress = false;

      // 1. <gsd-include>
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-include") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;

        const incPath = tag.node.attrs["path"];
        if (!incPath) continue;

        // Resolve: try project root first, fall back to package harness
        const subPath = incPath.replace(/^\.pi\/gsd\//, "");
        const candidates = [
          path.resolve(projectRoot, incPath),
          path.resolve(pkgRoot, ".gsd", "harnesses", "pi", "get-shit-done", subPath),
        ];
        const abs = candidates.find((c) => fs.existsSync(c));
        if (!abs) throw new Error(`Include not found: ${incPath} (tried project + package harness)`);

        const check = checkTrustedPath(abs, config, projectRoot, pkgRoot);
        if (!check.ok) throw new Error(`Include rejected: ${check.reason}`);

        const included = fs.readFileSync(abs, "utf8");
        const stem     = path.basename(abs, path.extname(abs));

        // INC-02: arg mappings from <gsd-arguments> child
        for (const child of tag.node.children) {
          if (child.tag !== "gsd-arguments") continue;
          for (const arg of child.children.filter((c) => c.tag === "arg")) {
            const from = arg.attrs["name"];
            const to   = arg.attrs["as"];
            if (from && to) {
              const val = vars.get(from);
              if (val !== undefined) vars.set(to, val, stem);
            }
          }
        }

        const appendArgs = "include-arguments" in tag.node.attrs ? `\n${rawArguments}` : "";
        current = spliceContent(current, tag.start, tag.end, included + appendArgs);
        done.push("gsd-include");
        progress = true;
        break;
      }
      if (progress) continue;

      // 2. <gsd-arguments>
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-arguments") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;

        parseArguments(tag.node, rawArguments, vars);
        current = spliceContent(current, tag.start, tag.end, "");
        done.push("gsd-arguments");
        progress = true;
        break;
      }
      if (progress) continue;

      // 3. <gsd-execute>
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-execute") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;

        executeBlock(tag.node, vars, ctx);
        current = spliceContent(current, tag.start, tag.end, "");
        done.push("gsd-execute");
        progress = true;
        break;
      }
      if (progress) continue;

      // 4. <gsd-paste>
      const after = applyPaste(current, vars);
      if (after !== current) { current = after; done.push("gsd-paste"); continue; }

      break; // no progress
    } catch (err) {
      if (err instanceof WxpProcessingError) throw err;
      const e = err instanceof Error ? err : new Error(String(err));
      throw new WxpProcessingError(filePath, e, vars.snapshot(), pending, done);
    }
  }

  return current;
}

export function readWorkflowVersionTag(
  content: string,
): { version: string; doNotUpdate: boolean } | null {
  const m = /<gsd-version\s+v="([^"]+)"(\s+do-not-update)?\s*\/>/.exec(content);
  if (!m) return null;
  return { version: m[1], doNotUpdate: Boolean(m[2]) };
}
