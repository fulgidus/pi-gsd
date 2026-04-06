import { describe, it, expect } from "vitest";
import { applyPaste, WxpPasteError } from "../paste.js";
import { createVariableStore } from "../variables.js";

describe("applyPaste (WXP-06)", () => {
  it("replaces a paste tag with the variable value", () => {
    const vars = createVariableStore();
    vars.set("greeting", "Hello World");
    const result = applyPaste('Say: <gsd-paste name="greeting" />', vars);
    expect(result).toBe("Say: Hello World");
  });

  it("replaces multiple paste tags", () => {
    const vars = createVariableStore();
    vars.set("a", "foo");
    vars.set("b", "bar");
    const result = applyPaste('<gsd-paste name="a" /> and <gsd-paste name="b" />', vars);
    expect(result).toBe("foo and bar");
  });

  it("throws WxpPasteError immediately on undefined variable (no partial output)", () => {
    const vars = createVariableStore();
    vars.set("defined", "ok");
    const content = '<gsd-paste name="defined" /> <gsd-paste name="missing" />';
    expect(() => applyPaste(content, vars)).toThrow(WxpPasteError);
  });

  it("WxpPasteError contains the variable name and snapshot", () => {
    const vars = createVariableStore();
    vars.set("existing", "val");
    try {
      applyPaste('<gsd-paste name="nope" />', vars);
    } catch (err) {
      expect(err).toBeInstanceOf(WxpPasteError);
      expect((err as WxpPasteError).variableName).toBe("nope");
      expect((err as WxpPasteError).variableSnapshot).toMatchObject({ existing: "val" });
    }
  });

  it("does NOT replace paste tag inside a code fence (dead-zone skip)", () => {
    const vars = createVariableStore();
    vars.set("x", "REPLACED");
    const content = "```\n<gsd-paste name=\"x\" />\n```\nafter";
    const result = applyPaste(content, vars);
    expect(result).toContain('<gsd-paste name="x" />');
    expect(result).not.toContain("REPLACED");
  });

  it("replaces paste tag outside fence but not inside fence", () => {
    const vars = createVariableStore();
    vars.set("val", "VALUE");
    const content = "```\n<gsd-paste name=\"val\" />\n```\n<gsd-paste name=\"val\" />";
    const result = applyPaste(content, vars);
    // Inside fence: unchanged
    expect(result).toContain('<gsd-paste name="val" />');
    // Outside fence: replaced
    const outsidePart = result.split("```\n").pop() ?? "";
    expect(outsidePart).toBe("VALUE");
  });

  it("returns content unchanged when there are no paste tags", () => {
    const vars = createVariableStore();
    const content = "No tags here";
    expect(applyPaste(content, vars)).toBe(content);
  });
});
