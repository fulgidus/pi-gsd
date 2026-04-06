import { describe, it, expect } from "vitest";
import { evaluateCondition } from "../conditions.js";
import { createVariableStore } from "../variables.js";
import type { IfNode } from "../schema.js";

describe("evaluateCondition", () => {
  it("equals: returns true when variable matches", () => {
    const vars = createVariableStore();
    vars.set("mode", "silent");
    const node: IfNode = {
      type: "if",
      var: "mode",
      condition: { type: "equals", value: "silent" },
      children: [],
    };
    expect(evaluateCondition(node, vars)).toBe(true);
  });

  it("equals: returns false when variable does not match", () => {
    const vars = createVariableStore();
    vars.set("mode", "interactive");
    const node: IfNode = {
      type: "if",
      var: "mode",
      condition: { type: "equals", value: "silent" },
      children: [],
    };
    expect(evaluateCondition(node, vars)).toBe(false);
  });

  it("starts-with: returns true when value starts with prefix", () => {
    const vars = createVariableStore();
    vars.set("phase", "1.2");
    const node: IfNode = {
      type: "if",
      var: "phase",
      condition: { type: "starts-with", value: "1" },
      children: [],
    };
    expect(evaluateCondition(node, vars)).toBe(true);
  });

  it("starts-with: returns false when value does not start with prefix", () => {
    const vars = createVariableStore();
    vars.set("phase", "2.1");
    const node: IfNode = {
      type: "if",
      var: "phase",
      condition: { type: "starts-with", value: "1" },
      children: [],
    };
    expect(evaluateCondition(node, vars)).toBe(false);
  });

  it("returns false (not throws) when variable is undefined", () => {
    const vars = createVariableStore();
    const node: IfNode = {
      type: "if",
      var: "missing",
      condition: { type: "equals", value: "anything" },
      children: [],
    };
    expect(evaluateCondition(node, vars)).toBe(false);
  });

  it("equals empty string matches undefined variable (treated as '')", () => {
    const vars = createVariableStore();
    const node: IfNode = {
      type: "if",
      var: "missing",
      condition: { type: "equals", value: "" },
      children: [],
    };
    expect(evaluateCondition(node, vars)).toBe(true);
  });
});
