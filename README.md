# pi-gsd

> **A reverse-engineered, fully-documented snapshot of [Get Shit Done](https://github.com/get-shit-done-cc/get-shit-done) v1.30.0 across all 8 AI harnesses.**

[![version: 1.30.0](https://img.shields.io/badge/gsd-v1.30.0-blue.svg)](https://github.com/get-shit-done-cc/get-shit-done)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![harnesses: 8](https://img.shields.io/badge/harnesses-8-green.svg)](#harness-directory-map)
[![hooks: 5](https://img.shields.io/badge/hooks-5-orange.svg)](HOOKS_ARCHITECTURE.md)

This repository holds a snapshot of GSD as installed across eight AI coding harnesses — Claude Code, Gemini CLI, OpenCode, Codex, Cursor, Windsurf, GitHub Copilot, and the generic `.agent` harness — captured on 2026-04-03. It exists to document and audit cross-harness consistency, expose every intentional and accidental divergence, and serve as a reference for contributors and tooling authors.

---

## Table of Contents

1. [What Is GSD?](#1-what-is-gsd)
2. [What Is This Repo?](#2-what-is-this-repo)
3. [Harness Directory Map](#3-harness-directory-map)
4. [Cross-Harness Consistency Model](#4-cross-harness-consistency-model)
5. [Command Prefix Reference](#5-command-prefix-reference)
6. [Hook System](#6-hook-system)
7. [Directory Structure Deep-Dive](#7-directory-structure-deep-dive)
8. [Audit & Validation Scripts](#8-audit--validation-scripts)
9. [Known Divergences](#9-known-divergences)
10. [Reference Documents](#10-reference-documents)
11. [License](#11-license)

---

## 1. What Is GSD?

**Get Shit Done** (`get-shit-done-cc`) is a structured software-delivery framework for AI coding agents. It wraps any AI coding session with a six-step phase lifecycle:

```
discuss ──► research ──► plan ──► execute ──► verify ──► validate
```

Key characteristics:

- **57+ slash commands** — `/gsd-new-project`, `/gsd-plan-phase <N>`, `/gsd-execute-phase <N>`, and more
- **18 specialized subagents** — planner, executor, verifier, debugger, codebase-mapper, and others
- **5 background hooks** — context monitor, prompt guard, workflow guard, update checker, statusline
- **4 model profiles** — `quality`, `balanced` (default), `budget`, `inherit`
- **Works across 8 harnesses** — single canonical command set regardless of which AI tool you use
- **Zero runtime dependencies** — all hooks and tooling run on Node.js built-ins only

For full usage documentation, see [`.agent/README.md`](.agent/README.md), which is the canonical per-install README.

---

## 2. What Is This Repo?

This repository (`pi-gsd`) is **not** the GSD npm package. It is a post-install snapshot:

| What | Detail |
|------|--------|
| **Source** | `npx get-shit-done-cc` installed into each of the 8 harness directories |
| **Version** | `1.30.0` (all harnesses) |
| **Captured** | 2026-04-03 (`.agent` + `.opencode` at 09:57 UTC; others at 08:46 UTC) |
| **Purpose** | Cross-harness audit, documentation, and drift analysis |
| **Upstream** | [github.com/get-shit-done-cc/get-shit-done](https://github.com/get-shit-done-cc/get-shit-done) |

### What is and isn't here

**Included:**
- All workflow `.md` files for every harness
- All compiled binary modules (`gsd-tools.cjs` and all `lib/*.cjs`)
- All hook files (hardlinked — see [§6](#6-hook-system))
- All agent definition files (`agents/gsd-*.md`)
- All skill definitions (`skills/gsd-*/SKILL.md`)
- All reference docs (`references/*.md`)
- Audit and validation scripts (`scripts/`)
- Cross-harness analysis reports (`HARNESS_DIFF.md`, `COMMAND_PREFIX_MAP.md`, `HOOKS_ARCHITECTURE.md`)

**Not included:**
- The upstream GSD npm package source
- Node.js `node_modules/` (there are none — GSD is dependency-free)
- User-specific `.planning/` project state files
- Session history or profile data

---

## 3. Harness Directory Map

Each top-level dotted directory is a complete GSD install for one AI coding tool:

| Directory | AI Tool | Hooks | Skills | Agents | Command prefix |
|-----------|---------|:-----:|:------:|:------:|----------------|
| **`.agent/`** | Generic / catch-all harness | ✅ 5 | ✅ 57 | ✅ 18 | `/gsd-<cmd>` |
| **`.claude/`** | [Claude Code](https://claude.ai/code) | ✅ 5 | ❌ | ✅ 18 | `/gsd-<cmd>` |
| **`.codex/`** | [OpenAI Codex](https://openai.com/codex) | ❌ | ✅ 57 | ✅ 18 | `/gsd-<cmd>` |
| **`.cursor/`** | [Cursor](https://cursor.sh) | ❌ | ✅ 57 | ✅ 18 | `/gsd-<cmd>` |
| **`.gemini/`** | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ 5 | ❌ | ✅ 18 | `/gsd-<cmd>` |
| **`.github/`** | [GitHub Copilot](https://github.com/features/copilot) | ❌ | ✅ 57 | ❌ | `/gsd-<cmd>` |
| **`.opencode/`** | [OpenCode](https://opencode.ai) | ✅ 5 | ✅ 57 | ✅ 18 | `/gsd-<cmd>` |
| **`.windsurf/`** | [Windsurf](https://codeium.com/windsurf) | ❌ | ✅ 57 | ✅ 18 | `/gsd-<cmd>` |

### Additional directories

| Directory | Purpose |
|-----------|---------|
| **`.gsd/`** | Canonical hook source (`hooks/`) + compiled binary copies (`bin/`); used as the hardlink anchor for all hook files |
| **`.pi/`** | pi package manager metadata |
| **`.pi-lens/`** | pi lens configuration |
| **`scripts/`** | Audit and validation scripts for cross-harness integrity checks |

> **Note on `.claude/` and `.gemini/` skills:** These two harnesses intentionally omit all 57 `skills/gsd-*/SKILL.md` files. Claude Code and Gemini CLI expose GSD capabilities through their native workflow/command mechanism rather than SKILL-based dispatch.

> **Note on `.github/` agents:** GitHub Copilot does not support agent definitions, so the `agents/` directory is absent from `.github/`.

---

## 4. Cross-Harness Consistency Model

GSD maintains a **two-tier consistency model**:

### Tier 1 — Must be byte-identical across all harnesses

These 10 binary modules contain shared logic with no harness-specific variation:

`frontmatter.cjs` · `milestone.cjs` · `model-profiles.cjs` · `roadmap.cjs` · `security.cjs` · `state.cjs` · `template.cjs` · `uat.cjs` · `init.cjs` · (core library logic)

All 10 pass the byte-identity check in this snapshot. ✅

### Tier 2 — Harness-specific (intentionally different)

These 8 modules contain per-harness substitutions:

| Module | What varies |
|--------|-------------|
| `commands.cjs` | Command prefix in generated scaffold content |
| `config.cjs` | Command prefix in documentation strings |
| `core.cjs` | JSDoc type annotations (`.agent` only); runtime branching flags |
| `phase.cjs` | Command prefix in ROADMAP phase entries |
| `profile-output.cjs` | Branding (Claude.md vs GEMINI.md vs .cursor/rules/); profiling question text |
| `profile-pipeline.cjs` | Session history search path (`.agent/projects` vs `~/.claude/projects`) |
| `verify.cjs` | Command prefix in error messages |
| `workstream.cjs` | Command prefix in error messages |

### Hook files — hardlinked (single inode)

All 5 hook files in `.agent/hooks/`, `.claude/hooks/`, `.gemini/hooks/`, `.opencode/hooks/`, and `.gsd/hooks/` share a single OS inode. They are not copies. See [§6](#6-hook-system) and [`HOOKS_ARCHITECTURE.md`](HOOKS_ARCHITECTURE.md) for details.

---

## 5. Command Prefix Reference

All user-facing GSD commands use the **`/gsd-<name>`** slash-hyphen prefix across every harness:

```
/gsd-new-project          /gsd-plan-phase <N>       /gsd-execute-phase <N>
/gsd-discuss-phase <N>    /gsd-verify-work <N>       /gsd-validate-phase <N>
/gsd-next                 /gsd-progress              /gsd-autonomous
/gsd-do <text>            /gsd-quick <task>          /gsd-help
```

The `/gsd:<cmd>` colon-form (e.g. `/gsd:discuss-phase`) appears **only** inside Claude Code and Gemini CLI workflow `.md` files as an internal harness dispatch mechanism — it is never emitted into generated files or error messages. Full details and the complete command inventory are in:

📄 **[COMMAND_PREFIX_MAP.md](COMMAND_PREFIX_MAP.md)**

---

## 6. Hook System

GSD ships 5 background hooks that run automatically on harness events:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `gsd-statusline.js` | `StatusLine` | Terminal context bar showing model + active task |
| `gsd-context-monitor.js` | `PostToolUse` / `AfterTool` | Advisory warnings at 35% / 25% remaining context |
| `gsd-prompt-guard.js` | `PreToolUse` / `BeforeTool` | Scans `.planning/` writes for 13 prompt-injection patterns |
| `gsd-check-update.js` | `SessionStart` | Background npm version check; cached result |
| `gsd-workflow-guard.js` | `PreToolUse` / `BeforeTool` | Nudge to use `/gsd-fast` for ad-hoc edits |

### Harness hook coverage

| Harness | Hooks |
|---------|-------|
| `.claude/`, `.gemini/`, `.opencode/`, `.agent/` | ✅ All 5 (hardlinked) |
| `.codex/` | ❌ No hook API |
| `.cursor/`, `.windsurf/`, `.github/` | ❌ No hook API |

### The hardlink model

All five hook files in `.agent/hooks/`, `.claude/hooks/`, `.gemini/hooks/`, `.opencode/hooks/`, and `.gsd/hooks/` share a **single inode** on disk. Editing any one of them instantly edits all of them — no sync step, no drift.

```bash
# Verify: all lines should show the same inode number
stat -c "%i %h %n" \
  .gsd/hooks/gsd-statusline.js \
  .agent/hooks/gsd-statusline.js \
  .claude/hooks/gsd-statusline.js \
  .gemini/hooks/gsd-statusline.js \
  .opencode/hooks/gsd-statusline.js
```

Full architecture, install pipeline, runtime self-detection, contributor rules, and re-link commands are documented in:

📄 **[HOOKS_ARCHITECTURE.md](HOOKS_ARCHITECTURE.md)**

---

## 7. Directory Structure Deep-Dive

### Each harness directory layout

```
.<harness>/
├── get-shit-done/
│   ├── VERSION                     ← "1.30.0"
│   ├── bin/
│   │   ├── gsd-tools.cjs           ← CLI entry point (all commands)
│   │   └── lib/
│   │       ├── commands.cjs        ← harness-specific (command prefix)
│   │       ├── config.cjs          ← harness-specific (command prefix in docs)
│   │       ├── core.cjs            ← harness-specific (+ JSDoc in .agent only)
│   │       ├── frontmatter.cjs     ← IDENTICAL across all 8 harnesses
│   │       ├── init.cjs            ← IDENTICAL across all 8 harnesses
│   │       ├── milestone.cjs       ← IDENTICAL across all 8 harnesses
│   │       ├── model-profiles.cjs  ← shared model routing data
│   │       ├── phase.cjs           ← harness-specific (command prefix)
│   │       ├── profile-output.cjs  ← harness-specific (branding)
│   │       ├── profile-pipeline.cjs← harness-specific (session paths)
│   │       ├── roadmap.cjs         ← IDENTICAL across all 8 harnesses
│   │       ├── security.cjs        ← IDENTICAL across all 8 harnesses
│   │       ├── state.cjs           ← IDENTICAL across all 8 harnesses
│   │       ├── template.cjs        ← IDENTICAL across all 8 harnesses
│   │       ├── uat.cjs             ← IDENTICAL across all 8 harnesses
│   │       ├── verify.cjs          ← harness-specific (command prefix)
│   │       └── workstream.cjs      ← harness-specific (command prefix)
│   ├── workflows/
│   │   └── *.md                    ← 53 workflow files (harness path + prefix substituted)
│   ├── agents/
│   │   └── gsd-*.md                ← 18 agent definitions (absent from .github/)
│   ├── skills/
│   │   └── gsd-*/SKILL.md          ← 57 skill definitions (absent from .claude/, .gemini/)
│   └── references/
│       └── *.md                    ← model-profiles, checkpoints, verification-patterns, etc.
├── hooks/                          ← present in .agent/, .claude/, .gemini/, .opencode/ only
│   ├── gsd-check-update.js         ← hardlinked (same inode as .gsd/hooks/)
│   ├── gsd-context-monitor.js      ← hardlinked
│   ├── gsd-prompt-guard.js         ← hardlinked
│   ├── gsd-statusline.js           ← hardlinked
│   └── gsd-workflow-guard.js       ← hardlinked
├── settings.json                   ← hook registration (.agent, .claude, .gemini); {} for .opencode
├── package.json                    ← present in .agent/ only (pi package manifest)
├── gsd-file-manifest.json          ← SHA-256 content hashes for all installed files
└── README.md                       ← present in .agent/ only (canonical usage docs)
```

### `.gsd/` canonical hook source

```
.gsd/
├── hooks/
│   ├── gsd-check-update.js         ← canonical hardlink anchor
│   ├── gsd-context-monitor.js
│   ├── gsd-prompt-guard.js
│   ├── gsd-statusline.js
│   └── gsd-workflow-guard.js
├── bin/
│   ├── agent/                      ← binary copies keyed by harness
│   ├── claude/
│   ├── codex/
│   ├── cursor/
│   ├── gemini/
│   ├── github/
│   ├── opencode/
│   └── windsurf/
└── JS_MODULE_ARCHITECTURE.md       ← full module dependency graph + data flows
```

### `scripts/` audit tooling

```
scripts/
├── audit-harness-sync.cjs          ← cross-harness file hash comparison
├── validate-harness-sync.cjs       ← full 5-check integrity suite (CJS, workflows, filesets, VERSION, manifests)
├── validate-model-profiles.cjs     ← confirms model-profiles.md is in sync with model-profiles.cjs
└── model-profiles-maintenance.md   ← instructions for updating model profile docs
```

---

## 8. Audit & Validation Scripts

Run from the repo root (`/home/fulgidus/Documents/pi-gsd`):

```bash
# Full cross-harness integrity suite (5 checks)
node scripts/validate-harness-sync.cjs

# Cross-harness file hash comparison
node scripts/audit-harness-sync.cjs

# Confirm model-profiles.md matches model-profiles.cjs source across all 8 harnesses
node scripts/validate-model-profiles.cjs
```

### Latest audit results (2026-04-03)

| Check | Result |
|-------|--------|
| CJS binary identity (10 strict files) | ✅ All identical |
| VERSION consistency | ✅ All at v1.30.0 |
| model-profiles.md sync | ✅ All 8 harnesses in sync |
| File-set completeness | ⚠️ `.opencode` missing 57 skills on disk |
| Manifest integrity | ⚠️ 6 harnesses have stale manifests (older install era) |
| Workflow diffs | ℹ️ 349 diffs — all are expected path/prefix substitutions |
| Hook hardlinks | ✅ 5 hooks × 5 harnesses share single inode |

Full diff analysis is in: 📄 **[HARNESS_DIFF.md](HARNESS_DIFF.md)**

---

## 9. Known Divergences

These differences between harnesses are **intentional by design**:

### 9a. Command prefix in workflow files

| Prefix style | Harnesses |
|-------------|-----------|
| `/gsd-<name>` | `.agent`, `.cursor`, `.github`, `.opencode`, `.windsurf` |
| `/gsd:<name>` | `.claude`, `.gemini` (internal workflow dispatch only) |

The colon-form `/gsd:<name>` is a Claude Code / Gemini CLI internal mechanism. It **must not** appear in generated artefacts (CONTEXT.md scaffolds, error messages). See [`COMMAND_PREFIX_MAP.md`](COMMAND_PREFIX_MAP.md).

### 9b. Skills directory absent from `.claude/` and `.gemini/`

Claude Code and Gemini CLI use their native workflow/command pattern for capability dispatch. The 57 `skills/gsd-*/SKILL.md` files are not needed and are intentionally excluded.

### 9c. Agents directory absent from `.github/`

GitHub Copilot has no agent definition API. All 18 `agents/gsd-*.md` files are intentionally excluded from `.github/`.

### 9d. Hook files absent from `.codex/`, `.cursor/`, `.windsurf/`, `.github/`

These four harnesses have no hook execution API. Hooks only run in harnesses that support `PostToolUse`/`SessionStart`-style events.

### 9e. `profile-output.cjs` branding per harness

Each harness's binary correctly names its own profile target file (e.g. `CLAUDE.md` for Claude Code, `.cursor/rules/` for Cursor). This is an intentional per-harness substitution.

### 9f. `profile-pipeline.cjs` session history path

`.agent` and `.opencode` use a local `.agent/projects` path for session history. `.claude`, `.codex`, `.gemini` use `~/.claude/projects`. `.cursor` uses a Cursor-specific session path.

### 9g. `gsd-tools.cjs` two versions

`.agent` and `.opencode` have a newer build of the entry binary (installed 09:57 UTC); the other 6 harnesses have the older build (08:46 UTC). Functionality is equivalent at v1.30.0.

---

## 10. Reference Documents

| Document | What it covers |
|----------|---------------|
| 📄 [`COMMAND_PREFIX_MAP.md`](COMMAND_PREFIX_MAP.md) | Complete command inventory, prefix semantics per harness, divergences found and fixed |
| 📄 [`HOOKS_ARCHITECTURE.md`](HOOKS_ARCHITECTURE.md) | Hardlink model, hook inventory, install pipeline (3 stages), runtime self-detection, contributor rules, verification commands |
| 📄 [`HARNESS_DIFF.md`](HARNESS_DIFF.md) | Full cross-harness diff analysis: binary modules, workflow divergences, validation script results, action items |
| 📄 [`.agent/README.md`](.agent/README.md) | Full GSD usage documentation: installation, quick start, phase lifecycle, all 57 commands, model profiles, agent roster, hook system |
| 📄 [`.gsd/JS_MODULE_ARCHITECTURE.md`](.gsd/JS_MODULE_ARCHITECTURE.md) | Module dependency graph, per-module function references, key data flows, file system layout, config schema, frontmatter schemas |
| 📄 [`scripts/model-profiles-maintenance.md`](scripts/model-profiles-maintenance.md) | Procedure for updating model profiles across all harnesses |

---

## 11. License

MIT © [get-shit-done-cc](https://github.com/get-shit-done-cc/get-shit-done)

---

*GSD v1.30.0 snapshot · Captured 2026-04-03 · 8 harnesses · 57 commands · 18 agents · 5 hooks*
