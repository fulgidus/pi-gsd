import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// Mock execFileSync before importing shell
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockReturnValue("mocked stdout\n"),
}));

import { executeShell, WxpShellError } from "../shell.js";
import { createVariableStore } from "../variables.js";
import type { WxpSecurityConfig, ShellNode } from "../schema.js";
import { execFileSync } from "node:child_process";

const cfg: WxpSecurityConfig = {
  trustedPaths: ["/trusted"],
  shellAllowlist: ["pi-gsd-tools", "git", "node", "cat", "ls", "echo", "find"],
  shellTimeoutMs: 30_000,
};

describe("executeShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (execFileSync as Mock).mockReturnValue("mocked stdout\n");
  });

  it("executes an allowlisted command and stores trimmed stdout", () => {
    const vars = createVariableStore();
    const node: ShellNode = { type: "shell", command: "git", args: ["status"], result: "out" };
    executeShell(node, vars, cfg);
    expect(vars.get("out")).toBe("mocked stdout");
  });

  it("throws WxpShellError for non-allowlisted command (no process spawned)", () => {
    const vars = createVariableStore();
    const node: ShellNode = { type: "shell", command: "bash", args: [], result: "out" };
    expect(() => executeShell(node, vars, cfg)).toThrow(WxpShellError);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("interpolates ${varname} in args", () => {
    const vars = createVariableStore();
    vars.set("phase", "3");
    const node: ShellNode = {
      type: "shell",
      command: "pi-gsd-tools",
      args: ["phase", "show", "${phase}"],
      result: "result",
    };
    executeShell(node, vars, cfg);
    expect(execFileSync).toHaveBeenCalledWith(
      "pi-gsd-tools",
      ["phase", "show", "3"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("throws WxpShellError when execFileSync throws", () => {
    (execFileSync as Mock).mockImplementationOnce(() => {
      throw Object.assign(new Error("exit code 1"), { stderr: "some error" });
    });
    const vars = createVariableStore();
    const node: ShellNode = { type: "shell", command: "git", args: [], result: "out" };
    expect(() => executeShell(node, vars, cfg)).toThrow(WxpShellError);
  });

  it("WxpShellError contains variable snapshot on failure", () => {
    const vars = createVariableStore();
    vars.set("key", "val");
    const node: ShellNode = { type: "shell", command: "bash", args: [], result: "out" };
    try {
      executeShell(node, vars, cfg);
    } catch (err) {
      expect(err).toBeInstanceOf(WxpShellError);
      expect((err as WxpShellError).variableSnapshot).toMatchObject({ key: "val" });
    }
  });
});
