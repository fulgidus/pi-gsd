import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn().mockReturnValue("mocked-output\n"),
}));

import { executeShell, WxpShellError } from "../shell.js";
import { createVariableStore } from "../variables.js";
import type { WxpSecurityConfig, XmlNode } from "../../schemas/wxp.zod.js";
import { execFileSync } from "node:child_process";
import { x } from "./helpers.js";

const cfg: WxpSecurityConfig = {
	trustedPaths: [],
	untrustedPaths: [],
	shellAllowlist: ["pi-gsd-tools", "git", "node", "cat", "ls", "echo", "find"],
	shellBanlist: [],
	shellTimeoutMs: 30_000,
};

function shellNode(
	command: string,
	args: XmlNode[],
	outs: XmlNode[],
	suppress = false,
) {
	return x("shell", { command }, [
		x("args", {}, args),
		x("outs", {}, suppress ? [...outs, x("suppress-errors")] : outs),
	]);
}

describe("executeShell", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(execFileSync as Mock).mockReturnValue("mocked-output\n");
	});

	it("executes allowlisted command and stores stdout in out variable", () => {
		const vars = createVariableStore();
		executeShell(
			shellNode(
				"pi-gsd-tools",
				[x("arg", { string: "state" }), x("arg", { string: "json" })],
				[x("out", { type: "string", name: "state" })],
			),
			vars,
			cfg,
		);
		expect(vars.get("state")).toBe("mocked-output");
	});

	it("throws WxpShellError for non-allowlisted command (no process spawned)", () => {
		const vars = createVariableStore();
		expect(() => executeShell(shellNode("bash", [], []), vars, cfg)).toThrow(
			WxpShellError,
		);
		expect(execFileSync).not.toHaveBeenCalled();
	});

	it("resolves variable args with wrap", () => {
		const vars = createVariableStore();
		vars.set("phase", "16");
		executeShell(
			shellNode(
				"pi-gsd-tools",
				[
					x("arg", { string: "init" }),
					x("arg", { string: "execute-phase" }),
					x("arg", { name: "phase", wrap: '"' }),
				],
				[x("out", { type: "string", name: "init" })],
			),
			vars,
			cfg,
		);
		expect(execFileSync).toHaveBeenCalledWith(
			"pi-gsd-tools",
			["init", "execute-phase", '"16"'],
			expect.objectContaining({ timeout: 30_000 }),
		);
	});

	it("suppress-errors: stores empty string on failure instead of throwing", () => {
		(execFileSync as Mock).mockImplementationOnce(() => {
			throw Object.assign(new Error("exit 1"), { stderr: "error" });
		});
		const vars = createVariableStore();
		expect(() =>
			executeShell(
				shellNode(
					"pi-gsd-tools",
					[x("arg", { string: "agent-skills" })],
					[x("out", { type: "string", name: "skills" })],
					true,
				),
				vars,
				cfg,
			),
		).not.toThrow();
		expect(vars.get("skills")).toBe("");
	});

	it("executes pi-gsd-tools with correct arguments", () => {
		const vars = createVariableStore();
		executeShell(
			shellNode(
				"pi-gsd-tools",
				[
					x("arg", { string: "state" }),
					x("arg", { string: "json" }),
					x("arg", { string: "--raw" }),
				],
				[x("out", { type: "string", name: "output" })],
			),
			vars,
			cfg,
		);
		expect(execFileSync).toHaveBeenCalledWith(
			"pi-gsd-tools",
			["state", "json", "--raw"],
			expect.objectContaining({
				encoding: "utf8",
				timeout: 30_000,
				shell: true,
			}),
		);
	});
});
