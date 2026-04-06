import { describe, it, expect } from "vitest";
import { createVariableStore } from "../variables.js";

describe("VariableStore", () => {
  it("sets and gets a variable", () => {
    const store = createVariableStore();
    store.set("x", "hello");
    expect(store.get("x")).toBe("hello");
  });

  it("returns undefined for missing variable", () => {
    const store = createVariableStore();
    expect(store.get("missing")).toBeUndefined();
  });

  it("has() returns true for existing variable", () => {
    const store = createVariableStore();
    store.set("a", "1");
    expect(store.has("a")).toBe(true);
    expect(store.has("b")).toBe(false);
  });

  it("snapshot() returns all key-value pairs", () => {
    const store = createVariableStore();
    store.set("a", "1", "file1");
    store.set("b", "2", "file2");
    const snap = store.snapshot();
    expect(snap["a"]).toBe("1");
    expect(snap["b"]).toBe("2");
  });

  it("collision detection: same name from different owners gets prefixed", () => {
    const store = createVariableStore();
    store.set("result", "first", "execute-phase");
    store.set("result", "second", "plan-phase");
    // Original "result" key should be gone; prefixed keys should exist
    expect(store.get("result")).toBeUndefined();
    expect(store.get("execute-phase:result")).toBe("first");
    expect(store.get("plan-phase:result")).toBe("second");
  });

  it("no collision when owner is the same", () => {
    const store = createVariableStore();
    store.set("x", "v1", "file");
    store.set("x", "v2", "file");
    // Same owner: overwrite, no prefix
    expect(store.get("x")).toBe("v2");
  });

  it("no collision when no owner provided", () => {
    const store = createVariableStore();
    store.set("x", "v1");
    store.set("x", "v2");
    expect(store.get("x")).toBe("v2");
  });

  it("entries() iterates over all stored variables", () => {
    const store = createVariableStore();
    store.set("a", "1");
    store.set("b", "2");
    const keys = [...store.entries()].map(([k]) => k);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
  });
});
