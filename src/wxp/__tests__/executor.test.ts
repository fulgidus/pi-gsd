import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockReturnValue("exec-output\n"),
}));

import { executeBlock, WxpExecutionError } from "../executor.js";
import { createVariableStore } from "../variables.js";
import type { ExecuteBlock, WxpExecContext } from "../../schemas/wxp.zod.js";

const cfg: WxpExecContext = {
  config: {
    trustedPaths: [],
    untrustedPaths: [],
    shellAllowlist: ["git", "pi-gsd-tools", "node", "cat", "ls", "echo", "find"],
    shellBanlist: [],
    shellTimeoutMs: 30_000,
  },
  projectRoot: "/project",
  pkgRoot: "/pkg",
  onDisplay: () => {},
};

describe("executeBlock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes a shell child and stores result", () => {
    const vars = createVariableStore();
    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "shell",
        command: "git",
        args: [{ string: "status" }],
        outs: [{ type: "string", name: "out" }],
        suppressErrors: false,
      }],
    };
    executeBlock(block, vars, cfg);
    expect(vars.get("out")).toBe("exec-output");
  });

  it("evaluates if/condition/equals and executes then-branch when true", () => {
    const vars = createVariableStore();
    vars.set("auto-chain-active", "false");
    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "if",
        condition: {
          op: "equals",
          left: { name: "auto-chain-active" },
          right: { type: "boolean", value: "false" },
        },
        then: [{
          type: "shell",
          command: "git",
          args: [],
          outs: [{ type: "string", name: "branch" }],
          suppressErrors: false,
        }],
      }],
    };
    executeBlock(block, vars, cfg);
    expect(vars.get("branch")).toBe("exec-output");
  });

  it("skips then-branch when condition is false", () => {
    const vars = createVariableStore();
    vars.set("auto-chain-active", "true");
    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "if",
        condition: {
          op: "equals",
          left: { name: "auto-chain-active" },
          right: { type: "boolean", value: "false" },
        },
        then: [{
          type: "shell",
          command: "git",
          args: [],
          outs: [{ type: "string", name: "branch" }],
          suppressErrors: false,
        }],
      }],
    };
    executeBlock(block, vars, cfg);
    expect(vars.get("branch")).toBeUndefined();
  });

  it("wraps errors in WxpExecutionError", () => {
    const vars = createVariableStore();
    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "shell",
        command: "bash",
        args: [],
        outs: [],
        suppressErrors: false,
      }],
    };
    expect(() => executeBlock(block, vars, cfg)).toThrow(WxpExecutionError);
  });
});
