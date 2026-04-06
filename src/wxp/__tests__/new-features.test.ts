import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockReturnValue("ok\n"),
}));

import { createVariableStore } from "../variables.js";
import { executeBlock, WxpExecutionError } from "../executor.js";
import type { ExecuteBlock, WxpExecContext } from "../../schemas/wxp.zod.js";
import { evaluateConditionExpr } from "../conditions.js";
import { execFileSync } from "node:child_process";

const makeCtx = (onDisplay = vi.fn()): WxpExecContext => ({
  config: {
    trustedPaths: [],
    untrustedPaths: [],
    shellAllowlist: ["pi-gsd-tools", "git", "echo", "cat", "node", "ls", "find"],
    shellBanlist: [],
    shellTimeoutMs: 30_000,
  },
  projectRoot: "/project",
  pkgRoot: "/pkg",
  onDisplay,
});

describe("conditions — new operators", () => {
  it("not-equals: true when values differ", () => {
    const vars = createVariableStore();
    vars.set("status", "complete");
    expect(evaluateConditionExpr(
      { op: "not-equals", left: { name: "status" }, right: { type: "string", value: "pending" } },
      vars,
    )).toBe(true);
  });

  it("less-than (numeric): compares numbers correctly", () => {
    const vars = createVariableStore();
    vars.set("n", "3");
    expect(evaluateConditionExpr(
      { op: "less-than", left: { name: "n", type: "number" }, right: { type: "number", value: "5" } },
      vars,
    )).toBe(true);
    expect(evaluateConditionExpr(
      { op: "less-than", left: { name: "n", type: "number" }, right: { type: "number", value: "2" } },
      vars,
    )).toBe(false);
  });

  it("greater-than-or-equal: works with numeric coercion", () => {
    const vars = createVariableStore();
    vars.set("n", "5");
    expect(evaluateConditionExpr(
      { op: "greater-than-or-equal", left: { name: "n", type: "number" }, right: { type: "number", value: "5" } },
      vars,
    )).toBe(true);
  });

  it("contains: string substring check", () => {
    const vars = createVariableStore();
    vars.set("init", "@file:/tmp/out.json");
    expect(evaluateConditionExpr(
      { op: "contains", left: { name: "init" }, right: { type: "string", value: "@file:" } },
      vars,
    )).toBe(true);
  });

  it("<and>: all children must be true", () => {
    const vars = createVariableStore();
    vars.set("a", "1"); vars.set("b", "2");
    expect(evaluateConditionExpr({
      op: "and",
      children: [
        { op: "equals", left: { name: "a" }, right: { type: "string", value: "1" } },
        { op: "equals", left: { name: "b" }, right: { type: "string", value: "2" } },
      ],
    }, vars)).toBe(true);

    expect(evaluateConditionExpr({
      op: "and",
      children: [
        { op: "equals", left: { name: "a" }, right: { type: "string", value: "1" } },
        { op: "equals", left: { name: "b" }, right: { type: "string", value: "99" } },
      ],
    }, vars)).toBe(false);
  });

  it("<or>: any child true is sufficient", () => {
    const vars = createVariableStore();
    vars.set("x", "hello");
    expect(evaluateConditionExpr({
      op: "or",
      children: [
        { op: "equals", left: { name: "x" }, right: { type: "string", value: "nope" } },
        { op: "equals", left: { name: "x" }, right: { type: "string", value: "hello" } },
      ],
    }, vars)).toBe(true);
  });

  it("nested <and> inside <or>", () => {
    const vars = createVariableStore();
    vars.set("status", "pending"); vars.set("phase", "3");
    expect(evaluateConditionExpr({
      op: "or",
      children: [
        { op: "equals", left: { name: "status" }, right: { type: "string", value: "complete" } },
        {
          op: "and",
          children: [
            { op: "equals", left: { name: "status" }, right: { type: "string", value: "pending" } },
            { op: "greater-than-or-equal", left: { name: "phase", type: "number" }, right: { type: "number", value: "2" } },
          ],
        },
      ],
    }, vars)).toBe(true);
  });
});

describe("<display>", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("emits via onDisplay with {varname} interpolation", () => {
    const onDisplay = vi.fn();
    const ctx = makeCtx(onDisplay);
    const vars = createVariableStore();
    vars.set("phase", "3");
    vars.set("phase-name", "WXP Foundation");

    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "display",
        msg: "GSD ► PHASE {phase} — {phase-name}",
        level: "info",
      }],
    };

    executeBlock(block, vars, ctx);
    expect(onDisplay).toHaveBeenCalledWith("GSD ► PHASE 3 — WXP Foundation", "info");
  });

  it("resolves dot-notation {item.status} interpolation", () => {
    const onDisplay = vi.fn();
    const ctx = makeCtx(onDisplay);
    const vars = createVariableStore();
    vars.set("phase", JSON.stringify({ status: "complete", name: "Test" }));

    const block: ExecuteBlock = {
      type: "execute",
      children: [{ type: "display", msg: "Status: {phase.status}", level: "info" }],
    };

    executeBlock(block, vars, ctx);
    expect(onDisplay).toHaveBeenCalledWith("Status: complete", "info");
  });
});

describe("<json-parse>", () => {
  it("extracts a top-level key from a JSON object", () => {
    const vars = createVariableStore();
    vars.set("data", JSON.stringify({ phase_number: "3", phase_name: "WXP" }));

    const block: ExecuteBlock = {
      type: "execute",
      children: [{ type: "json-parse", src: "data", path: "$.phase_number", out: "phase" }],
    };

    executeBlock(block, vars, makeCtx());
    expect(vars.get("phase")).toBe("3");
  });

  it("extracts an array and stores it for <for-each>", () => {
    const vars = createVariableStore();
    vars.set("progress", JSON.stringify({
      phases: [
        { number: "1", status: "complete" },
        { number: "2", status: "pending" },
      ],
    }));

    const block: ExecuteBlock = {
      type: "execute",
      children: [{ type: "json-parse", src: "progress", path: "$.phases", out: "phases" }],
    };

    executeBlock(block, vars, makeCtx());
    const arr = vars.getArray("phases");
    expect(arr).toHaveLength(2);
    expect(JSON.parse(arr![0]).number).toBe("1");
  });

  it("throws on undefined source variable", () => {
    const vars = createVariableStore();
    const block: ExecuteBlock = {
      type: "execute",
      children: [{ type: "json-parse", src: "missing", out: "out" }],
    };
    expect(() => executeBlock(block, vars, makeCtx())).toThrow(WxpExecutionError);
  });
});

describe("<for-each>", () => {
  it("iterates array and runs body for each item", () => {
    const onDisplay = vi.fn();
    const ctx = makeCtx(onDisplay);
    const vars = createVariableStore();
    vars.setArray("items", [
      JSON.stringify({ name: "Alpha" }),
      JSON.stringify({ name: "Beta" }),
    ]);

    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "for-each",
        var: "items",
        item: "item",
        children: [{ type: "display", msg: "Item: {item.name}", level: "info" }],
      }],
    };

    executeBlock(block, vars, ctx);
    expect(onDisplay).toHaveBeenCalledTimes(2);
    expect(onDisplay).toHaveBeenNthCalledWith(1, "Item: Alpha", "info");
    expect(onDisplay).toHaveBeenNthCalledWith(2, "Item: Beta", "info");
  });

  it("<where> filters items before iteration", () => {
    const onDisplay = vi.fn();
    const ctx = makeCtx(onDisplay);
    const vars = createVariableStore();
    vars.setArray("phases", [
      JSON.stringify({ number: "1", status: "complete" }),
      JSON.stringify({ number: "2", status: "pending" }),
      JSON.stringify({ number: "3", status: "pending" }),
    ]);

    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "for-each",
        var: "phases",
        item: "phase",
        where: { op: "not-equals", left: { name: "phase.status" }, right: { type: "string", value: "complete" } },
        children: [{ type: "display", msg: "{phase.number}", level: "info" }],
      }],
    };

    executeBlock(block, vars, ctx);
    expect(onDisplay).toHaveBeenCalledTimes(2);
    expect(onDisplay).toHaveBeenNthCalledWith(1, "2", "info");
    expect(onDisplay).toHaveBeenNthCalledWith(2, "3", "info");
  });

  it("<sort-by> sorts numerically before iterating", () => {
    const onDisplay = vi.fn();
    const ctx = makeCtx(onDisplay);
    const vars = createVariableStore();
    vars.setArray("phases", [
      JSON.stringify({ number: "3" }),
      JSON.stringify({ number: "1" }),
      JSON.stringify({ number: "2" }),
    ]);

    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "for-each",
        var: "phases",
        item: "phase",
        sortBy: { key: "number", type: "number", order: "asc" },
        children: [{ type: "display", msg: "{phase.number}", level: "info" }],
      }],
    };

    executeBlock(block, vars, ctx);
    expect(onDisplay).toHaveBeenNthCalledWith(1, "1", "info");
    expect(onDisplay).toHaveBeenNthCalledWith(2, "2", "info");
    expect(onDisplay).toHaveBeenNthCalledWith(3, "3", "info");
  });

  it("missing array variable is silently skipped (not an error)", () => {
    const vars = createVariableStore();
    const block: ExecuteBlock = {
      type: "execute",
      children: [{
        type: "for-each",
        var: "nonexistent",
        item: "x",
        children: [],
      }],
    };
    expect(() => executeBlock(block, vars, makeCtx())).not.toThrow();
  });
});

describe("variables — dot notation and arrays", () => {
  it("resolve('item.prop') accesses JSON property", () => {
    const vars = createVariableStore();
    vars.set("item", JSON.stringify({ status: "complete", number: "5" }));
    expect(vars.resolve("item.status")).toBe("complete");
    expect(vars.resolve("item.number")).toBe("5");
  });

  it("setArray/getArray stores and retrieves array variables", () => {
    const vars = createVariableStore();
    vars.setArray("arr", ["a", "b", "c"]);
    expect(vars.getArray("arr")).toEqual(["a", "b", "c"]);
  });

  it("getArray falls back to parsing JSON scalar", () => {
    const vars = createVariableStore();
    vars.set("data", JSON.stringify(["x", "y"]));
    expect(vars.getArray("data")).toEqual(["x", "y"]);
  });
});
