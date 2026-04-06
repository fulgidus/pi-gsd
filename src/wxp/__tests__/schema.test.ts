import { describe, it, expect } from "vitest";
import {
  WxpDocumentSchema,
  WxpVariableSchema,
  WxpSecurityConfigSchema,
  ShellNodeSchema,
  PasteNodeSchema,
  StringOpNodeSchema,
  ArgumentsNodeSchema,
  IncludeNodeSchema,
  VersionTagSchema,
} from "../schema.js";

describe("WXP Schemas", () => {
  it("ShellNodeSchema parses valid node", () => {
    const node = ShellNodeSchema.parse({
      type: "shell",
      command: "pi-gsd-tools",
      result: "output",
    });
    expect(node.args).toEqual([]);
  });

  it("PasteNodeSchema parses valid node", () => {
    const node = PasteNodeSchema.parse({ type: "paste", name: "myVar" });
    expect(node.name).toBe("myVar");
  });

  it("StringOpNodeSchema parses split node", () => {
    const node = StringOpNodeSchema.parse({
      type: "string-op",
      op: "split",
      var: "src",
      delimiter: ",",
      result: "parts",
    });
    expect(node.op).toBe("split");
  });

  it("ArgumentsNodeSchema defaults positionals and flags to []", () => {
    const node = ArgumentsNodeSchema.parse({ type: "arguments" });
    expect(node.positionals).toEqual([]);
    expect(node.flags).toEqual([]);
  });

  it("IncludeNodeSchema defaults includeArguments to false", () => {
    const node = IncludeNodeSchema.parse({ type: "include", path: "foo.md" });
    expect(node.includeArguments).toBe(false);
    expect(node.argMappings).toEqual([]);
  });

  it("VersionTagSchema defaults doNotUpdate to false", () => {
    const node = VersionTagSchema.parse({ type: "version", v: "1.0.0" });
    expect(node.doNotUpdate).toBe(false);
  });

  it("WxpVariableSchema parses with and without owner", () => {
    const withOwner = WxpVariableSchema.parse({ name: "x", value: "1", owner: "file" });
    const noOwner = WxpVariableSchema.parse({ name: "y", value: "2" });
    expect(withOwner.owner).toBe("file");
    expect(noOwner.owner).toBeUndefined();
  });

  it("WxpSecurityConfigSchema defaults shellTimeoutMs to 30000", () => {
    const cfg = WxpSecurityConfigSchema.parse({
      trustedPaths: ["/trusted"],
      shellAllowlist: ["git"],
    });
    expect(cfg.shellTimeoutMs).toBe(30_000);
  });

  it("WxpDocumentSchema parses document with empty operations", () => {
    const doc = WxpDocumentSchema.parse({ filePath: "/foo.md", operations: [] });
    expect(doc.operations).toEqual([]);
  });

  it("ShellNodeSchema rejects missing result field", () => {
    expect(() =>
      ShellNodeSchema.parse({ type: "shell", command: "git" }),
    ).toThrow();
  });
});
