import { describe, it, expect } from "vitest";
import { checkTrustedPath, checkAllowlist, DEFAULT_SHELL_ALLOWLIST } from "../security.js";
import type { WxpSecurityConfig } from "../../schemas/wxp.zod.js";

const PROJECT_ROOT = "/project";
const PKG_ROOT = "/pkg";

const cfg: WxpSecurityConfig = {
  trustedPaths: [
    { position: "pkg", path: "gsd" },
    { position: "project", path: ".pi/gsd" },
  ],
  untrustedPaths: [],
  shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
  shellBanlist: [],
  shellTimeoutMs: 30_000,
};

describe("checkTrustedPath", () => {
  it("returns ok=true for file inside pkg harness", () => {
    const result = checkTrustedPath(
      "/pkg/gsd/workflows/execute-phase.md",
      cfg, PROJECT_ROOT, PKG_ROOT,
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok=true for file inside project harness", () => {
    const result = checkTrustedPath(
      "/project/.pi/gsd/workflows/plan-phase.md",
      cfg, PROJECT_ROOT, PKG_ROOT,
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok=false for file outside trusted paths", () => {
    const result = checkTrustedPath("/untrusted/file.md", cfg, PROJECT_ROOT, PKG_ROOT);
    expect(result.ok).toBe(false);
  });

  it("hard blocks .planning/ regardless of trusted paths", () => {
    const cfgWithPlanning: WxpSecurityConfig = {
      ...cfg,
      trustedPaths: [{ position: "absolute", path: "/project" }],
    };
    const result = checkTrustedPath(
      "/project/.planning/STATE.md",
      cfgWithPlanning, PROJECT_ROOT, PKG_ROOT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(".planning/");
  });

  it("untrustedPaths override trustedPaths", () => {
    const cfgWithUntrusted: WxpSecurityConfig = {
      ...cfg,
      untrustedPaths: [{ position: "project", path: ".pi/gsd/dangerous" }],
    };
    const result = checkTrustedPath(
      "/project/.pi/gsd/dangerous/file.md",
      cfgWithUntrusted, PROJECT_ROOT, PKG_ROOT,
    );
    expect(result.ok).toBe(false);
  });
});

describe("checkAllowlist", () => {
  it("returns ok=true for all default allowlist entries", () => {
    for (const cmd of DEFAULT_SHELL_ALLOWLIST) {
      expect(checkAllowlist(cmd, cfg).ok).toBe(true);
    }
  });

  it("returns ok=false for bash", () => {
    expect(checkAllowlist("bash", cfg).ok).toBe(false);
  });

  it("strips path prefix before checking", () => {
    expect(checkAllowlist("/usr/bin/git", cfg).ok).toBe(true);
    expect(checkAllowlist("/usr/bin/bash", cfg).ok).toBe(false);
  });

  it("banlist overrides allowlist", () => {
    const cfgWithBan: WxpSecurityConfig = { ...cfg, shellBanlist: ["git"] };
    expect(checkAllowlist("git", cfgWithBan).ok).toBe(false);
  });
});
