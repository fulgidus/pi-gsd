import path from "node:path";
import type { WxpSecurityConfig } from "./schema.js";

export const DEFAULT_SHELL_ALLOWLIST: readonly string[] = [
  "pi-gsd-tools",
  "git",
  "node",
  "cat",
  "ls",
  "echo",
  "find",
] as const;

export type SecurityCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Returns ok=true only if filePath resolves to a trusted harness path.
 * Hard invariant: .planning/ is NEVER trusted, regardless of config.
 */
export function checkTrustedPath(
  filePath: string,
  config: WxpSecurityConfig,
): SecurityCheckResult {
  const resolved = path.resolve(filePath);

  // Hard invariant: .planning/ files are never processed by WXP
  const planningSegment = `${path.sep}.planning`;
  if (
    resolved.includes(`${planningSegment}${path.sep}`) ||
    resolved.endsWith(planningSegment)
  ) {
    return {
      ok: false,
      reason:
        ".planning/ files are never processed by WXP (hard security invariant — LLM writes there)",
    };
  }

  for (const trusted of config.trustedPaths) {
    const resolvedTrusted = path.resolve(trusted);
    if (resolved.startsWith(resolvedTrusted + path.sep) || resolved === resolvedTrusted) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    reason: `File '${filePath}' is not in a trusted WXP path. Trusted: ${config.trustedPaths.join(", ")}`,
  };
}

/**
 * Returns ok=true only if the bare command name is in the allowlist.
 */
export function checkAllowlist(
  command: string,
  config: WxpSecurityConfig,
): SecurityCheckResult {
  const bare = path.basename(command);
  if (config.shellAllowlist.includes(bare)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Command '${bare}' is not in the WXP shell allowlist. Allowed: ${config.shellAllowlist.join(", ")}`,
  };
}
