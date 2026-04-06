import { describe, it, expect } from "vitest";
import { parseWxpDocument, extractCodeFenceRegions } from "../parser.js";

describe("extractCodeFenceRegions", () => {
  it("returns empty array for content with no fences", () => {
    expect(extractCodeFenceRegions("hello world")).toEqual([]);
  });

  it("identifies a single fenced region", () => {
    const content = "before\n```\ncode\n```\nafter";
    const regions = extractCodeFenceRegions(content);
    expect(regions).toHaveLength(1);
    const [start, end] = regions[0];
    expect(content.slice(start, end)).toContain("code");
  });

  it("identifies multiple fenced regions", () => {
    const content = "```\nfirst\n```\nmiddle\n```\nsecond\n```";
    const regions = extractCodeFenceRegions(content);
    expect(regions).toHaveLength(2);
  });

  it("region excludes content after closing fence", () => {
    const content = "```\ncode\n```\noutside";
    const regions = extractCodeFenceRegions(content);
    const [, end] = regions[0];
    expect(content.slice(end)).toContain("outside");
  });
});

describe("parseWxpDocument — code-fence skip (WXP-01)", () => {
  it("does NOT parse <gsd-paste> inside a code fence", () => {
    const content = "before\n```\n<gsd-paste name=\"x\" />\n```\nafter";
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const pasteOps = doc.operations.filter((op) => op.type === "paste");
    expect(pasteOps).toHaveLength(0);
  });

  it("DOES parse <gsd-paste> outside a code fence", () => {
    const content = "text\n<gsd-paste name=\"x\" />\nmore";
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const pasteOps = doc.operations.filter((op) => op.type === "paste");
    expect(pasteOps).toHaveLength(1);
    expect(pasteOps[0]).toMatchObject({ type: "paste", name: "x" });
  });

  it("parses paste outside fence even when fence contains look-alike tags", () => {
    const content = "```\n<gsd-paste name=\"a\" />\n```\n<gsd-paste name=\"b\" />";
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const pasteOps = doc.operations.filter((op) => op.type === "paste");
    expect(pasteOps).toHaveLength(1);
    expect(pasteOps[0]).toMatchObject({ name: "b" });
  });
});

describe("parseWxpDocument — gsd-execute", () => {
  it("parses a basic shell node inside gsd-execute", () => {
    const content = `<gsd-execute>\n<shell command="git" result="branch">rev-parse HEAD</shell>\n</gsd-execute>`;
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const execOps = doc.operations.filter((op) => op.type === "execute");
    expect(execOps).toHaveLength(1);
    if (execOps[0].type === "execute") {
      const shell = execOps[0].children.find((c) => c.type === "shell");
      expect(shell).toBeDefined();
      if (shell?.type === "shell") {
        expect(shell.command).toBe("git");
        expect(shell.result).toBe("branch");
      }
    }
  });
});

describe("parseWxpDocument — gsd-arguments", () => {
  it("parses positionals and flags", () => {
    const content = `<gsd-arguments>\n<positional name="phase" />\n<flag name="skip" boolean />\n</gsd-arguments>`;
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const argsOps = doc.operations.filter((op) => op.type === "arguments");
    expect(argsOps).toHaveLength(1);
    if (argsOps[0].type === "arguments") {
      expect(argsOps[0].positionals).toHaveLength(1);
      expect(argsOps[0].flags).toHaveLength(1);
    }
  });
});

describe("parseWxpDocument — gsd-include", () => {
  it("parses self-closing include", () => {
    const content = `<gsd-include path="other.md" />`;
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const incOps = doc.operations.filter((op) => op.type === "include");
    expect(incOps).toHaveLength(1);
    if (incOps[0].type === "include") {
      expect(incOps[0].path).toBe("other.md");
      expect(incOps[0].includeArguments).toBe(false);
    }
  });

  it("parses include with include-arguments flag", () => {
    const content = `<gsd-include path="other.md" include-arguments />`;
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const incOps = doc.operations.filter((op) => op.type === "include");
    if (incOps[0].type === "include") {
      expect(incOps[0].includeArguments).toBe(true);
    }
  });

  it("parses include with child arg mappings (INC-02)", () => {
    const content = `<gsd-include path="other.md">\n<gsd-arguments><arg name="x" as="y" /></gsd-arguments>\n</gsd-include>`;
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const incOps = doc.operations.filter((op) => op.type === "include");
    if (incOps[0].type === "include") {
      expect(incOps[0].argMappings).toHaveLength(1);
      expect(incOps[0].argMappings[0]).toMatchObject({ name: "x", as: "y" });
    }
  });
});

describe("parseWxpDocument — gsd-version", () => {
  it("parses version tag", () => {
    const content = `<gsd-version v="1.2.3" />`;
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const vOps = doc.operations.filter((op) => op.type === "version");
    expect(vOps).toHaveLength(1);
    if (vOps[0].type === "version") {
      expect(vOps[0].v).toBe("1.2.3");
      expect(vOps[0].doNotUpdate).toBe(false);
    }
  });

  it("parses version tag with do-not-update", () => {
    const content = `<gsd-version v="1.0.0" do-not-update />`;
    const doc = parseWxpDocument(content, "/trusted/file.md");
    const vOps = doc.operations.filter((op) => op.type === "version");
    if (vOps[0].type === "version") {
      expect(vOps[0].doNotUpdate).toBe(true);
    }
  });
});
