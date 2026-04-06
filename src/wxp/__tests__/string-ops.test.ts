import { describe, it, expect } from "vitest";
import { executeStringOp, WxpStringOpError } from "../string-ops.js";
import { createVariableStore } from "../variables.js";
import type { StringOpNode } from "../schema.js";

describe("executeStringOp", () => {
  it("splits variable value by delimiter and stores newline-joined result", () => {
    const vars = createVariableStore();
    vars.set("input", "a,b,c");
    const node: StringOpNode = {
      type: "string-op",
      op: "split",
      var: "input",
      delimiter: ",",
      result: "parts",
    };
    executeStringOp(node, vars);
    expect(vars.get("parts")).toBe("a\nb\nc");
  });

  it("splits on multi-char delimiter", () => {
    const vars = createVariableStore();
    vars.set("input", "one::two::three");
    const node: StringOpNode = {
      type: "string-op",
      op: "split",
      var: "input",
      delimiter: "::",
      result: "out",
    };
    executeStringOp(node, vars);
    expect(vars.get("out")).toBe("one\ntwo\nthree");
  });

  it("single-element split stores the value unchanged (no newline)", () => {
    const vars = createVariableStore();
    vars.set("input", "hello");
    const node: StringOpNode = {
      type: "string-op",
      op: "split",
      var: "input",
      delimiter: ",",
      result: "out",
    };
    executeStringOp(node, vars);
    expect(vars.get("out")).toBe("hello");
  });

  it("throws WxpStringOpError when source variable is undefined", () => {
    const vars = createVariableStore();
    const node: StringOpNode = {
      type: "string-op",
      op: "split",
      var: "missing",
      delimiter: ",",
      result: "out",
    };
    expect(() => executeStringOp(node, vars)).toThrow(WxpStringOpError);
    expect(() => executeStringOp(node, vars)).toThrow(/missing/);
  });
});
