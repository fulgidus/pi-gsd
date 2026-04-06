import { execFileSync } from "node:child_process";
import { checkAllowlist } from "./security.js";
import type { ShellNode, WxpSecurityConfig } from "./schema.js";
import type { VariableStore } from "./variables.js";

export class WxpShellError extends Error {
  constructor(
    public readonly node: ShellNode,
    public readonly stderr: string,
    public readonly variableSnapshot: Record<string, string>,
    message: string,
  ) {
    super(message);
    this.name = "WxpShellError";
  }
}

/**
 * Execute a <shell> node using execFileSync (not execSync — no shell injection possible).
 * Validates the command against the allowlist before spawning any process.
 * Stores trimmed stdout in vars under node.result.
 * Throws WxpShellError on allowlist violation, non-zero exit, or timeout.
 */
export function executeShell(
  node: ShellNode,
  vars: VariableStore,
  config: WxpSecurityConfig,
): void {
  const check = checkAllowlist(node.command, config);
  if (!check.ok) {
    throw new WxpShellError(node, "", vars.snapshot(), check.reason);
  }

  // Interpolate ${varname} references in args
  const resolvedArgs = node.args.map((arg) =>
    arg.replace(/\$\{([^}]+)\}/g, (_, varName: string) => vars.get(varName) ?? ""),
  );

  let stdout = "";
  try {
    stdout = execFileSync(node.command, resolvedArgs, {
      encoding: "utf8",
      timeout: config.shellTimeoutMs,
      windowsHide: true,
    }).trim();
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const stderr = (e.stderr ?? e.message ?? String(err)).trim();
    throw new WxpShellError(
      node,
      stderr,
      vars.snapshot(),
      `Shell command '${node.command} ${resolvedArgs.join(" ")}' failed: ${stderr}`,
    );
  }

  vars.set(node.result, stdout, undefined);
}
