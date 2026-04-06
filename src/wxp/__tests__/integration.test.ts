import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import type { Mock } from "vitest";

// Mock child_process and fs.readFileSync for includes
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockReturnValue("shell-output\n"),
}));

import { processWxp, WxpProcessingError } from "../index.js";
import type { WxpSecurityConfig } from "../schema.js";
import { execFileSync } from "node:child_process";

const TRUSTED_DIR = "/trusted/harness/workflows";
const VIRTUAL_FILE = path.join(TRUSTED_DIR, "test.md");

const cfg: WxpSecurityConfig = {
  trustedPaths: [TRUSTED_DIR],
  shellAllowlist: ["pi-gsd-tools", "git", "node", "cat", "ls", "echo", "find"],
  shellTimeoutMs: 30_000,
};

describe("processWxp — integration (TST-02)", () => {
  beforeEach(() => {
    (execFileSync as Mock).mockReturnValue("shell-output\n");
  });

  // ── Fixture 1: basic shell output + paste ────────────────────────────────
  it("Fixture 1: shell output is captured and paste tag is replaced", () => {
    const content = [
      "# Workflow",
      "<gsd-execute>",
      '<shell command="pi-gsd-tools" result="state">state json --raw</shell>',
      "</gsd-execute>",
      "State: <gsd-paste name=\"state\" />",
    ].join("\n");

    const result = processWxp(content, VIRTUAL_FILE, cfg);
    expect(result).toContain("State: shell-output");
    expect(result).not.toMatch(/<gsd-paste/);
    expect(result).not.toMatch(/<gsd-execute>/);
  });

  // ── Fixture 2: code-fence skip ───────────────────────────────────────────
  it("Fixture 2: <gsd-paste> inside code fence is unchanged (WXP-01)", () => {
    const content = [
      "Example:",
      "```",
      '<gsd-paste name="x" />',
      "```",
      "End.",
    ].join("\n");

    // No variables defined — would throw if paste ran outside fence
    const result = processWxp(content, VIRTUAL_FILE, cfg);
    expect(result).toContain('<gsd-paste name="x" />');
  });

  // ── Fixture 3: conditional branch ────────────────────────────────────────
  it("Fixture 3: conditional branch executes shell when condition true", () => {
    const content = [
      "<gsd-arguments>",
      '<flag name="verbose" boolean />',
      "</gsd-arguments>",
      "<gsd-execute>",
      '  <if var="verbose"><equals value="true" />',
      '    <shell command="echo" result="msg">verbose mode</shell>',
      "  </if>",
      "</gsd-execute>",
      '<gsd-paste name="msg" />',
    ].join("\n");

    (execFileSync as Mock).mockReturnValue("verbose mode\n");
    const result = processWxp(content, VIRTUAL_FILE, cfg, "--verbose");
    expect(result).toContain("verbose mode");
  });

  // ── Fixture 5: variable collision resolution (INC-03) ───────────────────
  it("Fixture 5: variable collision from two sources gets owner-prefixed keys", async () => {
    // Simulate by setting same var from two owners directly
    // (full include test would require file mocking — tested via variables.test.ts)
    const { createVariableStore } = await import("../variables.js");
    const store = createVariableStore();
    store.set("result", "from-file-a", "file-a");
    store.set("result", "from-file-b", "file-b");

    expect(store.get("result")).toBeUndefined();
    expect(store.get("file-a:result")).toBe("from-file-a");
    expect(store.get("file-b:result")).toBe("from-file-b");
  });

  // ── Fixture 6: failure modes ─────────────────────────────────────────────
  it("Fixture 6a: untrusted path throws WxpProcessingError", () => {
    expect(() =>
      processWxp("content", "/untrusted/file.md", cfg),
    ).toThrow(WxpProcessingError);
  });

  it("Fixture 6b: .planning/ path throws WxpProcessingError (hard invariant)", () => {
    expect(() =>
      processWxp("content", "/project/.planning/STATE.md", cfg),
    ).toThrow(WxpProcessingError);
  });

  it("Fixture 6c: undefined paste variable throws WxpProcessingError", () => {
    const content = '<gsd-paste name="missing" />';
    expect(() => processWxp(content, VIRTUAL_FILE, cfg)).toThrow(WxpProcessingError);
  });

  it("Fixture 6d: non-allowlisted command throws WxpProcessingError", () => {
    const content = [
      "<gsd-execute>",
      '<shell command="bash" result="out">-c echo hi</shell>',
      "</gsd-execute>",
    ].join("\n");
    expect(() => processWxp(content, VIRTUAL_FILE, cfg)).toThrow(WxpProcessingError);
  });

  it("WxpProcessingError message contains variable namespace", () => {
    const content = '<gsd-paste name="missing" />';
    try {
      processWxp(content, VIRTUAL_FILE, cfg);
    } catch (err) {
      expect(err).toBeInstanceOf(WxpProcessingError);
      expect((err as WxpProcessingError).message).toContain("Variable Namespace");
    }
  });

  it("WxpProcessingError message contains pending operations", () => {
    const content = '<gsd-paste name="gone" />';
    try {
      processWxp(content, VIRTUAL_FILE, cfg);
    } catch (err) {
      expect((err as WxpProcessingError).message).toContain("Pending Operations");
    }
  });

  // ── Fixture 7: zero <gsd- tags in output (TST-03) ────────────────────────
  it("Fixture 7: output contains zero <gsd-* tags outside code fences (TST-03)", () => {
    const content = [
      "<gsd-execute>",
      '<shell command="echo" result="val">hello</shell>',
      "</gsd-execute>",
      '<gsd-paste name="val" />',
      "",
      "Example in fence (should NOT be stripped):",
      "```",
      '<gsd-paste name="val" />',
      "```",
    ].join("\n");

    (execFileSync as Mock).mockReturnValue("hello\n");
    const result = processWxp(content, VIRTUAL_FILE, cfg);

    // Strip code fence regions then check for remaining gsd- tags
    const withoutFences = result.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "FENCE_REMOVED");
    const gsdTagsOutsideFences = withoutFences.match(/<gsd-(?!-)[^>]*>/g);
    expect(gsdTagsOutsideFences).toBeNull();
  });

  it("gsd-version tags are informational and do not cause errors", () => {
    const content = '<gsd-version v="1.0.0" />\n# Hello';
    const result = processWxp(content, VIRTUAL_FILE, cfg);
    expect(result).toContain("# Hello");
  });
});
