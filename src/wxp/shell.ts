import { execFileSync } from "node:child_process";
import { checkAllowlist } from "./security.js";
import type { WxpSecurityConfig, XmlNode } from "../schemas/wxp.zod.js";
import type { VariableStore } from "./variables.js";

export class WxpShellError extends Error {
	constructor(
		public readonly command: string,
		public readonly stderr: string,
		public readonly variableSnapshot: Record<string, string>,
		message: string,
	) {
		super(message);
		this.name = "WxpShellError";
	}
}

/** Resolve a single <arg> node to its string value. */
export function resolveArgNode(arg: XmlNode, vars: VariableStore): string {
	if (arg.attrs["string"] !== undefined) return arg.attrs["string"];
	if (arg.attrs["name"] !== undefined) {
		const raw = vars.resolve(arg.attrs["name"]) ?? "";
		const wrap = arg.attrs["wrap"];
		return wrap ? `${wrap}${raw}${wrap}` : raw;
	}
	if (arg.attrs["value"] !== undefined) return arg.attrs["value"];
	return "";
}

export function executeShell(
	node: XmlNode,
	vars: VariableStore,
	config: WxpSecurityConfig,
): void {
	const command = node.attrs["command"] ?? "";
	const check = checkAllowlist(command, config);
	if (!check.ok) {
		throw new WxpShellError(command, "", vars.snapshot(), check.reason);
	}

	const argsContainer = node.children.find((c) => c.tag === "args");
	const outsContainer = node.children.find((c) => c.tag === "outs");

	const resolvedArgs = argsContainer
		? argsContainer.children
				.filter((c) => c.tag === "arg")
				.map((a) => resolveArgNode(a, vars))
		: [];

	const suppressErrors = outsContainer
		? outsContainer.children.some((c) => c.tag === "suppress-errors")
		: false;

	const outVars = outsContainer
		? outsContainer.children
				.filter((c) => c.tag === "out" && c.attrs["name"])
				.map((c) => c.attrs["name"] as string)
		: [];

	// Special handling for pi-gsd-tools to ensure it can be found on Windows
	// where node_modules/.bin may not be in the system PATH
	let resolvedCommand = command;
	if (command === "pi-gsd-tools") {
		// Try to resolve to local node_modules/.bin/pi-gsd-tools
		// This works for both local and global installations
		try {
			const path = require("node:path");
			const process = require("node:process");
			const fs = require("node:fs");

			// Check if we're in a project with node_modules
			const localBinPath = path.join(
				process.cwd(),
				"node_modules",
				".bin",
				"pi-gsd-tools",
			);
			const localBinPathCmd = path.join(
				process.cwd(),
				"node_modules",
				".bin",
				"pi-gsd-tools.cmd",
			);

			// Prefer the .cmd wrapper on Windows, otherwise use the shell wrapper
			if (process.platform === "win32" && fs.existsSync(localBinPathCmd)) {
				resolvedCommand = localBinPathCmd;
			} else if (fs.existsSync(localBinPath)) {
				resolvedCommand = localBinPath;
			}
			// If not found locally, fall back to using npx which will find it in node_modules
			// or globally if installed globally
		} catch {
			// If any error in resolution, fall back to original command
			// which will rely on system PATH or npx
		}
	}

	let stdout = "";
	try {
		stdout = execFileSync(resolvedCommand, resolvedArgs, {
			encoding: "utf8",
			timeout: config.shellTimeoutMs,
			windowsHide: true,
			shell: true,
		}).trim();
	} catch (err) {
		if (suppressErrors) {
			for (const name of outVars) vars.set(name, "", undefined);
			return;
		}
		const e = err as { stderr?: string; message?: string };
		const stderr = (e.stderr ?? e.message ?? String(err)).trim();
		throw new WxpShellError(
			command,
			stderr,
			vars.snapshot(),
			`Shell '${command} ${resolvedArgs.join(" ")}' failed: ${stderr}`,
		);
	}

	if (outVars.length > 0) vars.set(outVars[0], stdout, undefined);
}
