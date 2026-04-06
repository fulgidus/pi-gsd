import { extractCodeFenceRegions } from "./parser.js";
import type { VariableStore } from "./variables.js";

export class WxpPasteError extends Error {
  constructor(
    public readonly variableName: string,
    public readonly variableSnapshot: Record<string, string>,
  ) {
    super(
      `<gsd-paste name="${variableName}" /> references undefined variable '${variableName}'`,
    );
    this.name = "WxpPasteError";
  }
}

/**
 * Replace all <gsd-paste name="X" /> tags in content with the variable value.
 * - Tags inside code fences are NOT replaced (dead-zone skip, WXP-01).
 * - If any referenced variable is undefined, throws WxpPasteError immediately (WXP-06).
 *   No partial output is produced.
 */
export function applyPaste(content: string, vars: VariableStore): string {
  const deadZones = extractCodeFenceRegions(content);
  const pasteRegex = /<gsd-paste\s+name="([^"]+)"\s*\/>/g;

  // Collect all matches outside dead zones first (validate before mutating)
  const matches: Array<{ index: number; full: string; name: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = pasteRegex.exec(content)) !== null) {
    const inDead = deadZones.some(([s, e]) => m!.index >= s && m!.index < e);
    if (!inDead) {
      matches.push({ index: m.index, full: m[0], name: m[1] });
    }
  }

  // Validate all variables exist before replacing anything (WXP-06: no partial output)
  for (const match of matches) {
    if (vars.get(match.name) === undefined) {
      throw new WxpPasteError(match.name, vars.snapshot());
    }
  }

  // Apply replacements from right-to-left to preserve indices
  let result = content;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const value = vars.get(match.name) as string; // validated above
    result = result.slice(0, match.index) + value + result.slice(match.index + match.full.length);
  }

  return result;
}
