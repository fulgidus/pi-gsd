import { describe, it, expect } from "vitest";
import {
  ArgSchema,
  OutSchema,
  ShellNodeSchema,
  StringOpNodeSchema,
  ArgumentsNodeSchema,
  PasteNodeSchema,
  VersionTagSchema,
  IncludeNodeSchema,
  WxpVariableSchema,
  WxpSecurityConfigSchema,
} from "../../schemas/wxp.zod.js";

describe("ArgSchema", () => {
  it("parses a literal arg", () => {
    const arg = ArgSchema.parse({ string: "execute-phase" });
    expect(arg.string).toBe("execute-phase");
  });

  it("parses a variable-ref arg", () => {
    const arg = ArgSchema.parse({ name: "phase", wrap: '"' });
    expect(arg.name).toBe("phase");
    expect(arg.wrap).toBe('"');
  });

  it("parses a typed literal arg", () => {
    const arg = ArgSchema.parse({ type: "string", value: "@file:" });
    expect(arg.type).toBe("string");
    expect(arg.value).toBe("@file:");
  });

  it("parses a gsd-arguments flag arg", () => {
    const arg = ArgSchema.parse({ name: "auto", type: "flag", flag: "--auto", optional: true });
    expect(arg.type).toBe("flag");
    expect(arg.flag).toBe("--auto");
    expect(arg.optional).toBe(true);
  });

  it("rejects invalid type value", () => {
    expect(() => ArgSchema.parse({ name: "x", type: "invalid" })).toThrow();
  });
});

describe("OutSchema", () => {
  it("parses a valid out element", () => {
    const out = OutSchema.parse({ type: "string", name: "init" });
    expect(out.type).toBe("string");
    expect(out.name).toBe("init");
  });

  it("requires type and name", () => {
    expect(() => OutSchema.parse({ name: "x" })).toThrow();
    expect(() => OutSchema.parse({ type: "string" })).toThrow();
  });
});

describe("ShellNodeSchema", () => {
  it("parses a shell node with args and outs", () => {
    const node = ShellNodeSchema.parse({
      type: "shell",
      command: "pi-gsd-tools",
      args: [{ string: "init" }, { string: "execute-phase" }, { name: "phase", wrap: '"' }],
      outs: [{ type: "string", name: "init" }],
      suppressErrors: false,
    });
    expect(node.command).toBe("pi-gsd-tools");
    expect(node.args).toHaveLength(3);
    expect(node.outs).toHaveLength(1);
  });

  it("defaults args and outs to empty arrays", () => {
    const node = ShellNodeSchema.parse({ type: "shell", command: "git" });
    expect(node.args).toEqual([]);
    expect(node.outs).toEqual([]);
    expect(node.suppressErrors).toBe(false);
  });
});

describe("StringOpNodeSchema", () => {
  it("parses a split string-op", () => {
    const node = StringOpNodeSchema.parse({
      type: "string-op",
      op: "split",
      args: [{ name: "init" }, { type: "string", value: "@file:" }],
      outs: [{ type: "string", name: "init-file" }],
    });
    expect(node.op).toBe("split");
  });
});

describe("ArgumentsNodeSchema", () => {
  it("parses a full gsd-arguments block", () => {
    const node = ArgumentsNodeSchema.parse({
      type: "arguments",
      settings: { keepExtraArgs: false, strictArgs: false, delimiters: [] },
      args: [
        { name: "phase", type: "number" },
        { name: "auto", type: "flag", flag: "--auto", optional: true },
        { name: "user-text", type: "string", optional: true },
      ],
    });
    expect(node.args).toHaveLength(3);
    expect(node.args[1].type).toBe("flag");
  });
});

describe("WxpSecurityConfigSchema", () => {
  it("parses with structured trustedPaths", () => {
    const cfg = WxpSecurityConfigSchema.parse({
      trustedPaths: [
        { position: "pkg", path: "gsd" },
        { position: "project", path: ".pi/gsd" },
      ],
      shellAllowlist: ["pi-gsd-tools", "git"],
    });
    expect(cfg.trustedPaths).toHaveLength(2);
    expect(cfg.shellTimeoutMs).toBe(30_000);
  });
});
