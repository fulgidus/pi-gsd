import fs from "node:fs";
import path from "node:path";
import { extractWxpTags, spliceContent, extractCodeFenceRegions, inDeadZone } from "./parser.js";
import { buildOperation } from "./ast.js";
import { createVariableStore } from "./variables.js";
import { parseArguments } from "./arguments.js";
import { executeBlock } from "./executor.js";
import { applyPaste, WxpPasteError } from "./paste.js";
import { checkTrustedPath } from "./security.js";
import type {
  WxpSecurityConfig,
  WxpOperation,
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

/**
 * Main WXP entry point.
 *
 * Resolution loop (PRD §3.5) — max 50 iterations:
 *   1. <gsd-include> tags → inline file content
 *   2. <gsd-arguments> blocks → parse rawArguments into vars
 *   3. <gsd-execute> blocks → run shells, conditions, loops, string-ops, display
 *   4. <gsd-paste> tags → replace with variable values
 *
 * Any failure → WxpProcessingError (no partial output, no LLM fallback).
 */
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

  return runResolutionLoop(content, filePath, config, projectRoot, pkgRoot, rawArguments, onDisplay);
}

/**
 * Process WXP tags in already-validated content (path check already done by caller).
 */
export function processWxpTrustedContent(
  content: string,
  virtualFilePath: string,
  config: WxpSecurityConfig,
  projectRoot: string,
  pkgRoot: string,
  rawArguments = "",
  onDisplay: DisplayCallback = NOOP_DISPLAY,
): string {
  const trustedConfig: WxpSecurityConfig = {
    ...config,
    trustedPaths: [
      ...config.trustedPaths,
      { position: "absolute", path: path.dirname(path.resolve(virtualFilePath)) },
    ],
  };
  return runResolutionLoop(
    content, virtualFilePath, trustedConfig, projectRoot, pkgRoot, rawArguments, onDisplay,
  );
}

// ─── Internal resolution loop ─────────────────────────────────────────────────

function runResolutionLoop(
  content: string,
  filePath: string,
  config: WxpSecurityConfig,
  projectRoot: string,
  pkgRoot: string,
  rawArguments: string,
  onDisplay: DisplayCallback,
): string {
  const vars = createVariableStore();
  const completedOps: string[] = [];
  let current = content;

  const ctx: WxpExecContext = { config, projectRoot, pkgRoot, onDisplay };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const tags = extractWxpTags(current);
    const activeTags = tags.filter((t) => t.node.tag !== "gsd-version");
    if (activeTags.length === 0) break;

    const pendingBefore = activeTags.map((t) => t.node.tag);

    try {
      let didWork = false;

      // ── 1. Process <gsd-include> ───────────────────────────────────────────
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-include") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;

        const incPath = tag.node.attrs["path"];
        if (!incPath) continue;

        const absPath = path.resolve(path.dirname(filePath), incPath);
        const check = checkTrustedPath(absPath, config, projectRoot, pkgRoot);
        if (!check.ok) throw new Error(`Include rejected: ${check.reason}`);

        const included = fs.readFileSync(absPath, "utf8");
        const stem = path.basename(absPath, path.extname(absPath));

        // INC-02: arg mappings
        for (const mapping of tag.node.children
          .flatMap((c) => (c.tag === "gsd-arguments" ? c.children : []))
          .filter((c) => c.tag === "arg" && c.attrs["name"] && c.attrs["as"])) {
          const val = vars.get(mapping.attrs["name"]);
          if (val !== undefined) vars.set(mapping.attrs["as"], val, stem);
        }

        const appendArgs = tag.node.attrs["include-arguments"] !== undefined
          ? `\n${rawArguments}`
          : "";

        current = spliceContent(current, tag.start, tag.end, included + appendArgs);
        completedOps.push("gsd-include");
        didWork = true;
        break;
      }
      if (didWork) continue;

      // ── 2. Process <gsd-arguments> ────────────────────────────────────────
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-arguments") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;

        const op = buildOperation(tag.node)[0];
        if (op?.type === "arguments") {
          parseArguments(op, rawArguments, vars);
          completedOps.push("gsd-arguments");
        }
        current = spliceContent(current, tag.start, tag.end, "");
        didWork = true;
        break;
      }
      if (didWork) continue;

      // ── 3. Process <gsd-execute> blocks ───────────────────────────────────
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-execute") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;

        const ops = tag.node.children.flatMap(buildOperation);
        executeBlock({ type: "execute", children: ops }, vars, ctx);
        completedOps.push("gsd-execute");
        current = spliceContent(current, tag.start, tag.end, "");
        didWork = true;
        break;
      }
      if (didWork) continue;

      // ── 4. Apply <gsd-paste> ──────────────────────────────────────────────
      const afterPaste = applyPaste(current, vars);
      if (afterPaste !== current) {
        current = afterPaste;
        completedOps.push("gsd-paste");
        continue;
      }

      break; // No progress
    } catch (err) {
      if (err instanceof WxpProcessingError) throw err;
      const e = err instanceof Error ? err : new Error(String(err));
      throw new WxpProcessingError(filePath, e, vars.snapshot(), pendingBefore, completedOps);
    }
  }

  return current;
}

/**
 * Read the <gsd-version> tag from workflow file content.
 * Used by harness copy-on-first-run for do-not-update detection.
 */
export function readWorkflowVersionTag(
  content: string,
): { version: string; doNotUpdate: boolean } | null {
  const m = /<gsd-version\s+v="([^"]+)"(\s+do-not-update)?\s*\/>/.exec(content);
  if (!m) return null;
  return { version: m[1], doNotUpdate: Boolean(m[2]) };
}
