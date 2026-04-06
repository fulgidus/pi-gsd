import { describe, it, expect } from "vitest";
import { checkTrustedPath, checkAllowlist, DEFAULT_SHELL_ALLOWLIST } from "../security.js";
import type { WxpSecurityConfig } from "../schema.js";
import path from "node:path";

const cfg: WxpSecurityConfig = {
  trustedPaths: ["/trusted/harness"],
  shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
  shellTimeoutMs: 30_000,
};

describe("checkTrustedPath", () => {
  it("returns ok=true for file inside trusted path", () => {
    const result = checkTrustedPath("/trusted/harness/workflows/foo.md", cfg);
    expect(result.ok).toBe(true);
  });

  it("returns ok=false for file outside trusted path", () => {
    const result = checkTrustedPath("/untrusted/foo.md", cfg);
    expect(result.ok).toBe(false);
  });

  it("hard blocks .planning/ regardless of trusted paths", () => {
    const cfgWithPlanning: WxpSecurityConfig = {
      ...cfg,
      trustedPaths: ["/project"],
    };
    const result = checkTrustedPath("/project/.planning/STATE.md", cfgWithPlanning);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain(".planning/");
  });

  it("hard blocks path ending with .planning", () => {
    const result = checkTrustedPath("/project/.planning", cfg);
    expect(result.ok).toBe(false);
  });

  it("returns ok=false with helpful reason message", () => {
    const result = checkTrustedPath("/other/file.md", cfg);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain("trusted");
  });
});

describe("checkAllowlist", () => {
  it("returns ok=true for pi-gsd-tools", () => {
    expect(checkAllowlist("pi-gsd-tools", cfg).ok).toBe(true);
  });

  it("returns ok=true for git", () => {
    expect(checkAllowlist("git", cfg).ok).toBe(true);
  });

  it("returns ok=true for all default allowlist entries", () => {
    for (const cmd of DEFAULT_SHELL_ALLOWLIST) {
      expect(checkAllowlist(cmd, cfg).ok).toBe(true);
    }
  });

  it("returns ok=false for bash (not allowlisted)", () => {
    const result = checkAllowlist("bash", cfg);
    expect(result.ok).toBe(false);
  });

  it("returns ok=false for sh", () => {
    expect(checkAllowlist("sh", cfg).ok).toBe(false);
  });

  it("strips path prefix and checks bare name", () => {
    expect(checkAllowlist("/usr/bin/git", cfg).ok).toBe(true);
    expect(checkAllowlist("/usr/bin/bash", cfg).ok).toBe(false);
  });

  it("returns reason listing allowed commands", () => {
    const result = checkAllowlist("curl", cfg);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain("Allowed:");
  });
});

describe("DEFAULT_SHELL_ALLOWLIST", () => {
  it("contains expected entries", () => {
    expect(DEFAULT_SHELL_ALLOWLIST).toContain("pi-gsd-tools");
    expect(DEFAULT_SHELL_ALLOWLIST).toContain("git");
    expect(DEFAULT_SHELL_ALLOWLIST).toContain("node");
    expect(DEFAULT_SHELL_ALLOWLIST).toContain("cat");
    expect(DEFAULT_SHELL_ALLOWLIST).toContain("ls");
    expect(DEFAULT_SHELL_ALLOWLIST).toContain("echo");
    expect(DEFAULT_SHELL_ALLOWLIST).toContain("find");
  });
});
