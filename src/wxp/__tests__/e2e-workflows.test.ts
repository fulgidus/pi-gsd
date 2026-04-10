import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { extractWxpTags } from "../parser.js";

const WORKFLOWS_DIR = join(__dirname, "..", "..", "..", ".gsd", "harnesses", "pi", "get-shit-done", "workflows");
const PROMPTS_DIR = join(__dirname, "..", "..", "..", "prompts");

const VALID_INIT_WORKFLOWS = new Set([
  "execute-phase", "plan-phase", "new-project", "new-milestone",
  "quick", "resume", "verify-work", "phase-op", "todos",
  "milestone-op", "map-codebase", "progress", "manager",
  "new-workspace", "list-workspaces", "remove-workspace",
]);

const VALID_TOP_COMMANDS = new Set([
  "state", "init", "roadmap", "config-get", "config-set",
  "config-set-model-profile", "config-new-project", "config-ensure-section",
  "phase", "milestone", "validate", "verify", "audit-uat",
  "workstream", "scaffold", "commit", "frontmatter", "template",
  "progress", "stats", "todo", "summary-extract", "wxp",
  "resolve-model", "find-phase", "generate-slug", "current-timestamp",
  "list-todos", "verify-path-exists", "phases", "agent-skills",
  "history-digest", "state-snapshot", "requirements",
  "scan-sessions", "profile-sample", "profile-questionnaire",
  "write-profile", "generate-dev-preferences", "generate-claude-profile",
  "generate-claude-md", "generate-model-profiles-md",
  // added by prompt-audit enhancement (v2.0.22)
  "phase-plan-index", "verify",
]);

function getWorkflowFiles(): string[] {
  try {
    return readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".md") && !f.endsWith(".bak")).sort();
  } catch { return []; }
}

function getPromptFiles(): string[] {
  try {
    return readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md")).sort();
  } catch { return []; }
}

function extractShellCommands(content: string): Array<{ command: string; args: string[] }> {
  const tags = extractWxpTags(content);
  const shells: Array<{ command: string; args: string[] }> = [];

  function walk(children: ReturnType<typeof extractWxpTags>[0]["node"]["children"]): void {
    for (const child of children) {
      if (child.tag === "shell") {
        const command = child.attrs["command"] ?? "";
        const argsNode = child.children.find((c) => c.tag === "args");
        const args = argsNode
          ? argsNode.children.filter((c) => c.tag === "arg" && c.attrs["string"]).map((c) => c.attrs["string"])
          : [];
        shells.push({ command, args });
      }
      if (child.children.length > 0) walk(child.children);
    }
  }

  for (const tag of tags) {
    if (tag.node.tag === "gsd-execute") walk(tag.node.children);
  }
  return shells;
}

// ── Shell command validation ──────────────────────────────────────────────────

describe("WXP shell command validation", () => {
  const files = getWorkflowFiles();
  if (files.length === 0) { it.skip("no workflow files", () => {}); return; }

  for (const file of files) {
    const name = basename(file, ".md");
    const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    const shells = extractShellCommands(content);
    if (shells.length === 0) continue;

    it(`${name}: all shell commands use allowlisted executables with valid subcommands`, () => {
      for (const shell of shells) {
        // All shell commands must use allowlisted executables
        const ALLOWLISTED = new Set(["pi-gsd-tools", "git", "node", "cat", "ls", "echo", "find"]);
        expect(
          ALLOWLISTED.has(shell.command),
          `unknown executable '${shell.command}'`,
        ).toBe(true);

        // Only validate subcommands for pi-gsd-tools
        if (shell.command !== "pi-gsd-tools") continue;
        const topCmd = shell.args[0];
        if (!topCmd) continue;
        expect(VALID_TOP_COMMANDS.has(topCmd), `unknown command '${topCmd}'`).toBe(true);
        if (topCmd === "init" && shell.args[1]) {
          expect(VALID_INIT_WORKFLOWS.has(shell.args[1]), `unknown init workflow '${shell.args[1]}'`).toBe(true);
        }
      }
    });
  }
});

// ── Argument schema validation ────────────────────────────────────────────────

describe("WXP argument schema validation", () => {
  const files = getWorkflowFiles();
  if (files.length === 0) { it.skip("no workflow files", () => {}); return; }

  for (const file of files) {
    const name = basename(file, ".md");
    const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    const tags = extractWxpTags(content);
    const argsTag = tags.find((t) => t.node.tag === "gsd-arguments");
    if (!argsTag) continue;

    it(`${name}: <gsd-arguments> args have valid types`, () => {
      const argDefs = argsTag.node.children.filter((c) => c.tag === "arg");
      for (const arg of argDefs) {
        expect(arg.attrs["name"], "arg missing name").toBeTruthy();
        expect(
          ["string", "number", "boolean", "flag"].includes(arg.attrs["type"]),
          `arg '${arg.attrs["name"]}' has invalid type '${arg.attrs["type"]}'`,
        ).toBe(true);
        if (arg.attrs["type"] === "flag") {
          expect(arg.attrs["flag"], `flag '${arg.attrs["name"]}' missing flag= attribute`).toBeTruthy();
        }
      }
    });
  }
});

// ── Prompt template validation ────────────────────────────────────────────────

describe("Prompt template YAML validation", () => {
  const files = getPromptFiles();
  if (files.length === 0) { it.skip("no prompt files", () => {}); return; }

  it("all descriptions are quoted (colons break unquoted YAML)", () => {
    for (const file of files) {
      const content = readFileSync(join(PROMPTS_DIR, file), "utf8");
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      expect(match, `${file}: missing frontmatter`).toBeTruthy();
      const descLine = match![1].split("\n").find((l) => l.startsWith("description:"));
      expect(descLine, `${file}: missing description`).toBeTruthy();
      const val = descLine!.slice("description:".length).trim();
      expect(
        val.startsWith('"') && val.endsWith('"'),
        `${file}: description must be quoted, got: ${val.slice(0, 50)}`,
      ).toBe(true);
    }
  });

  it("workflow includes with <gsd-arguments> have include-arguments flag", () => {
    for (const file of files) {
      const content = readFileSync(join(PROMPTS_DIR, file), "utf8");
      const includes = [...content.matchAll(/<gsd-include\s+path="([^"]+)"([^>]*)\/?>/g)];
      for (const inc of includes) {
        const incPath = inc[1];
        const attrs = inc[2];
        if (!incPath.includes("workflows/")) continue;
        const wfName = basename(incPath, ".md");
        try {
          const wfContent = readFileSync(join(WORKFLOWS_DIR, wfName + ".md"), "utf8");
          if (wfContent.includes("<gsd-arguments>")) {
            expect(
              attrs.includes("include-arguments"),
              `${file}: includes ${wfName}.md (has <gsd-arguments>) but missing include-arguments`,
            ).toBe(true);
          }
        } catch { /* workflow not found, skip */ }
      }
    }
  });

  it("all prompts that have a matching workflow file use <gsd-include>", () => {
    for (const file of files) {
      const promptName = basename(file, ".md"); // e.g. "gsd-plan-phase"
      const wfName = promptName.replace(/^gsd-/, "") + ".md"; // e.g. "plan-phase.md"
      let wfExists = false;
      try {
        readFileSync(join(WORKFLOWS_DIR, wfName), "utf8");
        wfExists = true;
      } catch { /* no matching workflow */ }
      if (!wfExists) continue;

      const content = readFileSync(join(PROMPTS_DIR, file), "utf8");
      expect(
        content.includes("<gsd-include"),
        `${file}: has matching workflow ${wfName} but does not use <gsd-include>`,
      ).toBe(true);
    }
  });
});

// ── WXP pre-injection coverage ───────────────────────────────────────────────

describe("WXP pre-injection coverage", () => {
  const files = getWorkflowFiles();
  if (files.length === 0) { it.skip("no workflow files", () => {}); return; }

  // Workflows that are intentionally simple / inline (no pre-injection needed)
  // Includes internal sub-workflows (called from parent prompts with context already provided)
  const INTENTIONALLY_SIMPLE = new Set(["fast", "note", "pr-branch", "update", "discovery-phase", "node-repair", "help"]);

  it("workflows with a <process> section have WXP pre-injection (gsd-execute or gsd-arguments)", () => {
    for (const file of files) {
      const name = basename(file, ".md");
      if (INTENTIONALLY_SIMPLE.has(name)) continue;
      const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      if (!content.includes("<process>")) continue; // skip non-process workflows
      const hasWxp = content.includes("<gsd-execute>") || content.includes("<gsd-arguments>");
      expect(hasWxp, `${file}: has <process> but no WXP pre-injection block`).toBe(true);
    }
  });
});

// ── Declared-flags completeness ───────────────────────────────────────────────

describe("WXP argument schema completeness", () => {
  const files = getWorkflowFiles();
  if (files.length === 0) { it.skip("no workflow files", () => {}); return; }

  it("plan-phase.md declares all documented flags", () => {
    const content = readFileSync(join(WORKFLOWS_DIR, "plan-phase.md"), "utf8");
    const expectedFlags = ["--auto", "--skip-research", "--gaps", "--skip-verify", "--reviews", "--text"];
    for (const flag of expectedFlags) {
      expect(content.includes(`flag="${flag}"`), `plan-phase.md missing flag declaration: ${flag}`).toBe(true);
    }
  });

  it("execute-phase.md declares all documented flags", () => {
    const content = readFileSync(join(WORKFLOWS_DIR, "execute-phase.md"), "utf8");
    const expectedFlags = ["--auto", "--no-transition", "--gaps-only", "--interactive"];
    for (const flag of expectedFlags) {
      expect(content.includes(`flag="${flag}"`), `execute-phase.md missing flag declaration: ${flag}`).toBe(true);
    }
  });
});
