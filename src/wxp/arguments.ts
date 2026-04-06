import type { ArgumentsNode } from "./schema.js";
import type { VariableStore } from "./variables.js";

/**
 * Two-pass $ARGUMENTS parser (WXP-02).
 *
 * Pass 1: Extract all --flag and --flag value pairs (flags can appear anywhere).
 *         Remove consumed tokens from the list.
 * Pass 2: Assign remaining tokens to positionals left-to-right.
 *         The last positional defined with greedy=true consumes all remaining tokens joined by space.
 *
 * All parsed values are stored in vars under each argument's name.
 */
export function parseArguments(
  node: ArgumentsNode,
  rawArguments: string,
  vars: VariableStore,
): void {
  const tokens = rawArguments.trim().split(/\s+/).filter(Boolean);
  const consumed = new Set<number>();

  // ── Pass 1: flags ─────────────────────────────────────────────────────────
  for (const flagDef of node.flags) {
    const flagToken = `--${flagDef.name}`;
    const flagIndex = tokens.indexOf(flagToken);

    if (flagIndex === -1) {
      // Flag not present: store default
      vars.set(flagDef.name, flagDef.boolean ? "false" : "", undefined);
      continue;
    }

    consumed.add(flagIndex);

    if (flagDef.boolean) {
      vars.set(flagDef.name, "true", undefined);
    } else {
      const valueIndex = flagIndex + 1;
      if (valueIndex < tokens.length && !tokens[valueIndex].startsWith("--")) {
        vars.set(flagDef.name, tokens[valueIndex], undefined);
        consumed.add(valueIndex);
      } else {
        vars.set(flagDef.name, "", undefined);
      }
    }
  }

  // ── Pass 2: positionals ───────────────────────────────────────────────────
  const remaining = tokens.filter((_, i) => !consumed.has(i));

  node.positionals.forEach((pos, idx) => {
    const isLast = idx === node.positionals.length - 1;
    if (isLast && pos.greedy) {
      // Greedy-last: consume all remaining tokens
      vars.set(pos.name, remaining.slice(idx).join(" "), undefined);
    } else {
      vars.set(pos.name, remaining[idx] ?? "", undefined);
    }
  });
}
