import { describe, it, expect } from "vitest";
import { parseArguments } from "../arguments.js";
import { createVariableStore } from "../variables.js";
import type { ArgumentsNode } from "../schema.js";

describe("parseArguments — two-pass algorithm (WXP-02)", () => {
  it("parses a single positional", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [{ name: "phase", greedy: false }],
      flags: [],
    };
    parseArguments(node, "3", vars);
    expect(vars.get("phase")).toBe("3");
  });

  it("parses flags before positionals (flags can appear anywhere)", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [{ name: "phase", greedy: false }],
      flags: [{ name: "skip-research", boolean: true }],
    };
    parseArguments(node, "1 --skip-research", vars);
    expect(vars.get("phase")).toBe("1");
    expect(vars.get("skip-research")).toBe("true");
  });

  it("greedy last positional consumes all remaining tokens", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [
        { name: "phase", greedy: false },
        { name: "rest", greedy: true },
      ],
      flags: [{ name: "skip-research", boolean: true }],
    };
    parseArguments(node, "1 --skip-research foo bar", vars);
    expect(vars.get("phase")).toBe("1");
    expect(vars.get("rest")).toBe("foo bar");
    expect(vars.get("skip-research")).toBe("true");
  });

  it("flag with value consumes the next token", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [{ name: "phase", greedy: false }],
      flags: [{ name: "profile", boolean: false }],
    };
    parseArguments(node, "2 --profile quality", vars);
    expect(vars.get("phase")).toBe("2");
    expect(vars.get("profile")).toBe("quality");
  });

  it("absent boolean flag defaults to 'false'", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [],
      flags: [{ name: "dry-run", boolean: true }],
    };
    parseArguments(node, "", vars);
    expect(vars.get("dry-run")).toBe("false");
  });

  it("absent string flag defaults to empty string", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [],
      flags: [{ name: "output", boolean: false }],
    };
    parseArguments(node, "", vars);
    expect(vars.get("output")).toBe("");
  });

  it("missing positional defaults to empty string", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [{ name: "phase", greedy: false }],
      flags: [],
    };
    parseArguments(node, "", vars);
    expect(vars.get("phase")).toBe("");
  });

  it("flag in middle of positionals is correctly consumed", () => {
    const vars = createVariableStore();
    const node: ArgumentsNode = {
      type: "arguments",
      positionals: [
        { name: "a", greedy: false },
        { name: "b", greedy: false },
      ],
      flags: [{ name: "verbose", boolean: true }],
    };
    parseArguments(node, "first --verbose second", vars);
    expect(vars.get("a")).toBe("first");
    expect(vars.get("b")).toBe("second");
    expect(vars.get("verbose")).toBe("true");
  });
});
