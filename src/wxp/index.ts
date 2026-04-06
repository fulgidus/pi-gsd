import fs from "node:fs";
import path from "node:path";
import { parseWxpDocument } from "./parser.js";
import { createVariableStore } from "./variables.js";
import { parseArguments } from "./arguments.js";
import { executeBlock } from "./executor.js";
import { applyPaste } from "./paste.js";
import { checkTrustedPath } from "./security.js";
import type { WxpSecurityConfig, WxpOperation } from "./schema.js";

export { WxpExecutionError } from "./executor.js";
export { WxpShellError } from "./shell.js";
export { WxpPasteError } from "./paste.js";
export { WxpStringOpError } from "./string-ops.js";

const MAX_ITERATIONS = 50;

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
 * Processes raw markdown content from a trusted harness file.
 * Resolution loop order (WXP-08): include → arguments → execute → paste → repeat.
 * 50-iteration safety cap.
 *
 * Any failure throws WxpProcessingError — no partial output, no LLM fallback (WXP-09).
 */
export function processWxp(
  content: string,
  filePath: string,
  config: WxpSecurityConfig,
  rawArguments = "",
): string {
  // WXP-10: verify file is in a trusted path
  const pathCheck = checkTrustedPath(filePath, config);
  if (!pathCheck.ok) {
    const err = new Error(pathCheck.reason);
    throw new WxpProcessingError(filePath, err, {}, [], []);
  }

  const vars = createVariableStore();
  const completedOps: string[] = [];
  let current = content;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const doc = parseWxpDocument(current, filePath);
    const activeOps = doc.operations.filter((op) => op.type !== "version");

    if (activeOps.length === 0) break;

    const pendingBefore = activeOps.map((op) => op.type);

    try {
      // ── 1. Process includes ─────────────────────────────────────────────
      for (const op of doc.operations) {
        if (op.type !== "include") continue;

        const includePath = path.resolve(path.dirname(filePath), op.path);
        const includeCheck = checkTrustedPath(includePath, config);
        if (!includeCheck.ok) throw new Error(`Include rejected: ${includeCheck.reason}`);

        const includeContent = fs.readFileSync(includePath, "utf8");
        const appendArgs = op.includeArguments ? `\n${rawArguments}` : "";
        const stem = path.basename(includePath, path.extname(includePath));

        // INC-02: map caller variables into included file's namespace
        for (const mapping of op.argMappings) {
          const callerValue = vars.get(mapping.name);
          if (callerValue !== undefined) vars.set(mapping.as, callerValue, stem);
        }

        // Replace the tag in content — handle both self-closing and with-children forms
        const selfCloseRe = new RegExp(
          `<gsd-include\\s[^>]*path="${escapeRegex(op.path)}"[^>]*\\/>`,
          "m",
        );
        const withChildRe = new RegExp(
          `<gsd-include\\s[^>]*path="${escapeRegex(op.path)}"[^>]*>[\\s\\S]*?<\\/gsd-include>`,
          "m",
        );
        if (selfCloseRe.test(current)) {
          current = current.replace(selfCloseRe, includeContent + appendArgs);
        } else {
          current = current.replace(withChildRe, includeContent + appendArgs);
        }

        completedOps.push("include");
      }

      // ── 2. Process arguments ────────────────────────────────────────────
      for (const op of doc.operations) {
        if (op.type !== "arguments") continue;
        parseArguments(op, rawArguments, vars);
        completedOps.push("arguments");
        current = current.replace(/<gsd-arguments>[\s\S]*?<\/gsd-arguments>/m, "");
      }

      // ── 3. Process execute blocks ───────────────────────────────────────
      for (const op of doc.operations) {
        if (op.type !== "execute") continue;
        executeBlock(op, vars, config);
        completedOps.push("execute");
        current = current.replace(/<gsd-execute>[\s\S]*?<\/gsd-execute>/m, "");
      }

      // ── 4. Apply paste replacements ─────────────────────────────────────
      current = applyPaste(current, vars);
    } catch (err) {
      if (err instanceof WxpProcessingError) throw err;
      const e = err instanceof Error ? err : new Error(String(err));
      throw new WxpProcessingError(filePath, e, vars.snapshot(), pendingBefore, completedOps);
    }

    // Count remaining active ops after this iteration
    const docAfter = parseWxpDocument(current, filePath);
    const pendingAfter = docAfter.operations.filter(
      (op: WxpOperation) => op.type !== "version",
    ).length;

    if (pendingAfter === 0) break;

    if (pendingAfter >= pendingBefore.length) {
      const stuckErr = new Error(
        `Resolution loop made no progress at iteration ${iteration + 1}. ` +
          `Still pending: [${pendingBefore.join(", ")}]. ` +
          `Increase file complexity analysis or check for unsupported tag nesting.`,
      );
      throw new WxpProcessingError(
        filePath,
        stuckErr,
        vars.snapshot(),
        pendingBefore,
        completedOps,
      );
    }
  }

  return current;
}

/**
 * Process WXP tags in already-trusted content (path check skipped).
 * Use only when the caller has already validated the content source.
 */
export function processWxpTrustedContent(
  content: string,
  virtualFilePath: string,
  config: WxpSecurityConfig,
  rawArguments = "",
): string {
  // Build config with virtualFilePath's directory as trusted (bypass path check)
  const trustedConfig: WxpSecurityConfig = {
    ...config,
    trustedPaths: [...config.trustedPaths, path.dirname(path.resolve(virtualFilePath))],
  };
  return processWxp(content, virtualFilePath, trustedConfig, rawArguments);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
