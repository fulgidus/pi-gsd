import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockReturnValue("exec-output\n"),
}));

import { executeBlock, WxpExecutionError } from "../executor.js";
import { createVariableStore } from "../variables.js";
import type { ExecuteBlock, WxpSecurityConfig } from "../schema.js";

const cfg: WxpSecurityConfig = {
  trustedPaths: ["/trusted"],
  shellAllowlist: ["git", "pi-gsd-tools", "node", "cat", "ls", "echo", "find"],
  shellTimeoutMs: 30_000,
};

describe("executeBlock", () => {
  it("executes a shell child and stores result", () => {
    const vars = createVariableStore();
    const block: ExecuteBlock = {
      type: "execute",
      children: [{ type: "shell", command: "git", args: ["status"], result: "out" }],
    };
    executeBlock(block, vars, cfg);
    expect(vars.get("out")).toBe("exec-output");
  });

  it("evaluates if-equals and executes children when true", () => {
    const vars = createVariableStore();
    vars.set("mode", "silent");
    const block: ExecuteBlock = {
      type: "execute",
      children: [
        {
          type: "if",
          var: "mode",
          condition: { type: "equals", value: "silent" },
          children: [
            { type: "shell", command: "git", args: [], result: "branch" },
          ],
        },
      ],
    };
    executeBlock(block, vars, cfg);
    expect(vars.get("branch")).toBe("exec-output");
  });

  it("skips if children when condition is false", () => {
    const vars = createVariableStore();
    vars.set("mode", "interactive");
    const block: ExecuteBlock = {
      type: "execute",
      children: [
        {
          type: "if",
          var: "mode",
          condition: { type: "equals", value: "silent" },
          children: [
            { type: "shell", command: "git", args: [], result: "branch" },
          ],
        },
      ],
    };
    executeBlock(block, vars, cfg);
    expect(vars.get("branch")).toBeUndefined();
  });

  it("wraps errors in WxpExecutionError", () => {
    const vars = createVariableStore();
    const block: ExecuteBlock = {
      type: "execute",
      children: [{ type: "shell", command: "bash", args: [], result: "out" }],
    };
    expect(() => executeBlock(block, vars, cfg)).toThrow(WxpExecutionError);
  });

  it("WxpExecutionError contains variable snapshot at time of failure", () => {
    const vars = createVariableStore();
    vars.set("before", "captured");
    const block: ExecuteBlock = {
      type: "execute",
      children: [{ type: "shell", command: "bash", args: [], result: "out" }],
    };
    try {
      executeBlock(block, vars, cfg);
    } catch (err) {
      expect((err as WxpExecutionError).variableSnapshot).toMatchObject({ before: "captured" });
    }
  });

  it("executes string-op child", () => {
    const vars = createVariableStore();
    vars.set("csv", "a,b,c");
    const block: ExecuteBlock = {
      type: "execute",
      children: [
        { type: "string-op", op: "split", var: "csv", delimiter: ",", result: "lines" },
      ],
    };
    executeBlock(block, vars, cfg);
    expect(vars.get("lines")).toBe("a\nb\nc");
  });
});
