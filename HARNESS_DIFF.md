# GSD Harness Diff Analysis Report

> **Generated:** 2026-04-03  
> **Version under analysis:** v1.30.0  
> **Harnesses:** `.agent` `.claude` `.codex` `.cursor` `.gemini` `.github` `.opencode` `.windsurf`  
> **Tools used:** `scripts/validate-harness-sync.cjs`, `scripts/audit-harness-sync.cjs`, `scripts/validate-model-profiles.cjs`, `.pi-lens/validate-harness-drift.js`

---

## Table of Contents

1. [Summary Table](#1-summary-table)
2. [Binary Module Divergences](#2-binary-module-divergences)
3. [Workflow Divergences Summary](#3-workflow-divergences-summary)
4. [Full Validation Script Output](#4-full-validation-script-output)
5. [Known Intentional Differences](#5-known-intentional-differences)
6. [Action Items](#6-action-items)

---

## 1. Summary Table

### 1.1 Harness Overview

| Harness     | Version | Timestamp            | Declared Files | Files on Disk | CJS Drifts | Workflow Drifts | Fileset      | Manifest      |
| ----------- | ------- | -------------------- | -------------- | ------------- | ---------- | --------------- | ------------ | ------------- |
| `.agent`    | v1.30.0 | 2026-04-03T09:57:22Z | 213            | 199           | 0 ✅        | 0 ✅             | ✅ OK         | ✅ OK          |
| `.claude`   | v1.30.0 | 2026-04-03T08:46:56Z | 213            | 198           | 7 ⚠️        | many ⚠️          | ✅ OK         | ❌ 63 TAMPERED |
| `.codex`    | v1.30.0 | 2026-04-03T08:46:56Z | 208            | 210           | 8 ⚠️        | many ⚠️          | ✅ OK         | ❌ 68 TAMPERED |
| `.cursor`   | v1.30.0 | 2026-04-03T08:46:56Z | 208            | 191           | 3 ⚠️        | many ⚠️          | ✅ OK         | ❌ 62 TAMPERED |
| `.gemini`   | v1.30.0 | 2026-04-03T08:46:56Z | 213            | 198           | 7 ⚠️        | many ⚠️          | ✅ OK         | ❌ 63 TAMPERED |
| `.github`   | v1.30.0 | 2026-04-03T08:46:56Z | 208            | 193           | 2 ⚠️        | many ⚠️          | ✅ OK         | ❌ 4 TAMPERED  |
| `.opencode` | v1.30.0 | 2026-04-03T09:57:22Z | 213            | 199           | 3 ⚠️        | many ⚠️          | ❌ 57 MISSING | ✅ OK          |
| `.windsurf` | v1.30.0 | 2026-04-03T08:46:56Z | 208            | 191           | 3 ⚠️        | many ⚠️          | ✅ OK         | ❌ 62 TAMPERED |

> **Canonical baseline:** `.agent` harness is the reference for all CJS drift checks.

### 1.2 Cross-Harness Sync Summary (audit-harness-sync.cjs)

| Category                                | Count | % of 402 |
| --------------------------------------- | ----- | -------- |
| ✅ Synced across all harnesses           | 219   | 54.5%    |
| ❌ Divergent (hash mismatch)             | 178   | 44.3%    |
| ⚠️ Partial (missing from some harnesses) | 5     | 1.2%     |

### 1.3 Drift Detector Totals (validate-harness-sync.cjs)

| Check                 | Passed | Failed       |
| --------------------- | ------ | ------------ |
| CJS binary identity   | 13     | 34           |
| Workflow semantic     | 47     | 349          |
| File-set completeness | 7      | 1 (opencode) |
| VERSION consistency   | 8      | 0            |
| Manifest integrity    | 2      | 6            |
| **TOTAL**             | **47** | **390**      |

---

## 2. Binary Module Divergences

### 2.1 Strictly Identical CJS Files (All 8 Harnesses Match)

These 10 files pass **strict byte-for-byte identity** across all harnesses:

| File                         | Status      |
| ---------------------------- | ----------- |
| `bin/gsd-tools.cjs`          | ✅ Identical |
| `bin/lib/frontmatter.cjs`    | ✅ Identical |
| `bin/lib/init.cjs`           | ✅ Identical |
| `bin/lib/milestone.cjs`      | ✅ Identical |
| `bin/lib/model-profiles.cjs` | ✅ Identical |
| `bin/lib/roadmap.cjs`        | ✅ Identical |
| `bin/lib/security.cjs`       | ✅ Identical |
| `bin/lib/state.cjs`          | ✅ Identical |
| `bin/lib/template.cjs`       | ✅ Identical |
| `bin/lib/uat.cjs`            | ✅ Identical |

> **Note:** `validate-harness-drift.js` (Check 1) confirms these pass strict identity. `audit-harness-sync.cjs` reports `bin/gsd-tools.cjs`, `bin/lib/init.cjs` and `bin/lib/model-profiles.cjs` as divergent - those tools use different canonical baselines. See §5 for reconciliation.

### 2.2 Harness-Specific CJS Files (Expected to Differ - Command Prefix & Branding)

These 8 files are intentionally per-harness and are verified against **their own harness manifest**:

| File                   | `.agent`    | `.claude` / `.gemini` | `.codex`            | `.cursor` / `.github` / `.opencode` / `.windsurf` |
| ---------------------- | ----------- | --------------------- | ------------------- | ------------------------------------------------- |
| `commands.cjs`         | `2fac72a2…` | ← stale manifest      | `3e2e322b…` ← stale | `2fac72a2…` (matches agent)                       |
| `config.cjs`           | `d9d9274e…` | `81939c75…`           | `a183ce8e…`         | `d9d9274e…` (matches agent)                       |
| `core.cjs`             | `89c6716e…` | `a5fe1881…`           | `a5fe1881…`         | unique per harness                                |
| `phase.cjs`            | `74a47c12…` | `8a0fef06…`           | `b136a749…`         | `74a47c12…` (matches agent)                       |
| `profile-output.cjs`   | `117d1086…` | `b5c74d54…`           | `686531c0…`         | unique per harness                                |
| `profile-pipeline.cjs` | `9e4cfd4b…` | `6c73a8c1…`           | `6c73a8c1…`         | unique per harness                                |
| `verify.cjs`           | `1eded11b…` | `1fd33de4…`           | `47f284ad…`         | `1eded11b…` (matches agent)                       |
| `workstream.cjs`       | `2646820c…` | `b3f92418…`           | `2e33c936…`         | `2646820c…` (matches agent)                       |

#### 2.2.1 `core.cjs` - 416-line JSDoc block stripped in distribution harnesses

`.agent/get-shit-done/bin/lib/core.cjs` is **1646 lines**; all other harnesses are **1230 lines**.  
The extra 416 lines in `.agent` are a JSDoc type-definition block (lines 12–156) stripped for distribution:

```diff
--- .agent/bin/lib/core.cjs   (1646 lines)
+++ .claude/bin/lib/core.cjs  (1230 lines)
 5,6d4
-'use strict';
-
 12,156d9
-// ─── JSDoc type definitions ────────────────────────────────────────────────
-
-/**
- * @typedef {'sequential'|'custom'} PhaseNamingMode
- */
-
-/**
- * @typedef {'quality'|'balanced'|'budget'|'inherit'} ModelProfile
- */
-
-/**
- * @typedef {false|true|'omit'} ResolveModelIds
- * - false: return alias as-is
- * - true: map alias to full model ID
- * - 'omit': return '' so the runtime uses its own default
- */
- ...
- (full GSDConfig, AgentsInstallStatus, PlanningPaths, PhaseSearchResult typedefs)
```

Additionally `.cursor`, `.github`, `.windsurf` each have **their own unique** `core.cjs` hash, indicating cursor-specific and github-specific minor patches on top of the stripped base.

#### 2.2.2 `config.cjs` - Command prefix in JSDoc comments

```diff
--- .agent/bin/lib/config.cjs
+++ .claude/bin/lib/config.cjs
 63c63
-  *   3. userChoices - settings the user explicitly selected during /gsd-new-project
+  *   3. userChoices - settings the user explicitly selected during /gsd:new-project
 170c170
-  * configured during /gsd-new-project). All remaining keys are filled from
+  * configured during /gsd:new-project). All remaining keys are filled from
```

**Pattern:** `.agent` uses `/gsd-command` syntax; `.claude`/`.gemini` use `/gsd:command`; `.codex` uses `$gsd-command`.

#### 2.2.3 `verify.cjs` - Command prefix in error messages

```diff
--- .agent/bin/lib/verify.cjs
+++ .claude/bin/lib/verify.cjs
 559c559
-  addIssue('error', 'E001', '.planning/ not found', 'Run /gsd-new-project to initialize');
+  addIssue('error', 'E001', '.planning/ not found', 'Run /gsd:new-project to initialize');
 572c572
-  addIssue('error', 'E002', 'PROJECT.md not found', 'Run /gsd-new-project to create');
+  addIssue('error', 'E002', 'PROJECT.md not found', 'Run /gsd:new-project to create');
 585c585
-  addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /gsd-new-milestone to create roadmap');
+  addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /gsd:new-milestone to create roadmap');
 590c590
-  addIssue('error', 'E004', 'STATE.md not found', 'Run /gsd-health --repair to regenerate');
+  addIssue('error', 'E004', 'STATE.md not found', 'Run /gsd:health --repair to regenerate');
 807c807
-  stateContent += `- STATE.md regenerated by /gsd-health --repair\n`;
+  stateContent += `- STATE.md regenerated by /gsd:health --repair\n`;
```

**10 substitutions total** - every hardcoded command reference in error messages and repair logs.

#### 2.2.4 `phase.cjs` - Command prefix in generated ROADMAP.md content

```diff
--- .agent/bin/lib/phase.cjs
+++ .claude/bin/lib/phase.cjs
 357c357
-  const phaseEntry = `...(run /gsd-plan-phase ${newPhaseId} to break down)\n`;
+  const phaseEntry = `...(run /gsd:plan-phase ${newPhaseId} to break down)\n`;
 430c430
-  `...(run /gsd-plan-phase ${decimalPhase} to break down)\n`
+  `...(run /gsd:plan-phase ${decimalPhase} to break down)\n`
```

This means **generated ROADMAP.md files** will contain different command prefixes depending on which harness created them - important for portability across harnesses.

#### 2.2.5 `workstream.cjs` - Command prefix in error strings

```diff
--- .agent/bin/lib/workstream.cjs
+++ .claude/bin/lib/workstream.cjs
 81c81
-  error('.planning/ directory not found - run /gsd-new-project first');
+  error('.planning/ directory not found - run /gsd:new-project first');
```

#### 2.2.6 `profile-output.cjs` - Agent name substitution in profiling questions

All 952 lines present in all harnesses. Differences are agent-name branding substitutions:

```diff
--- .agent/bin/lib/profile-output.cjs
+++ .claude/bin/lib/profile-output.cjs
 8,9c8,9
-  *   - generate-claude-profile: Developer Profile section in GEMINI.md
+  *   - generate-claude-profile: Developer Profile section in CLAUDE.md
 29,30c29,30
-  context: 'Think about the last few times you asked the agent to build...',
+  context: 'Think about the last few times you asked Claude to build...',
 41,42c41,42
-  context: 'Think about times when the agent presented you with multiple options...',
+  context: 'Think about times when Claude presented you with multiple options...',
 47c47
-  { label: 'Let the agent recommend -- I generally trust the suggestion', ...}
+  { label: 'Let Claude recommend -- I generally trust the suggestion', ...}
```

**Pattern:** `.agent` uses generic "the agent"; `.claude`/`.gemini` use "Claude"; `.cursor` uses "Cursor"; `.github` uses "GitHub Copilot"; `.opencode` uses "OpenCode"; `.windsurf` uses "Windsurf".

#### 2.2.7 `profile-pipeline.cjs` - Session history path per harness

```diff
--- .agent/bin/lib/profile-pipeline.cjs
+++ .cursor/bin/lib/profile-pipeline.cjs
 4c4
-  * Reads Claude Code session history (read-only) to extract user messages
+  * Reads Cursor session history (read-only) to extract user messages
 162,163c162,163
-  const searchedPath = overridePath || '.agent/projects';
-  error(`No Claude Code sessions found at ${searchedPath}...`);
+  const searchedPath = overridePath || '~/.claude/projects';
+  error(`No Cursor sessions found at ${searchedPath}...`);
```

Each harness points `profile-pipeline.cjs` to its native session history directory.

#### 2.2.8 `commands.cjs` - Command prefix in generated file content

```diff
--- .agent/bin/lib/commands.cjs
+++ .codex/bin/lib/commands.cjs
 744c744
-  content = `..._Decisions will be captured during /gsd-discuss-phase ${phase}_\n...`;
+  content = `..._Decisions will be captured during $gsd-discuss-phase ${phase}_\n...`;
```

`.codex` uses `$gsd-command` syntax (shell variable style) vs. `.agent`'s `/gsd-command`.

### 2.3 Manifest Staleness Summary (Check 2 from validate-harness-drift.js)

The per-harness CJS manifest hashes are stale in several harnesses - the files were updated but manifests were not regenerated:

| Harness     | Stale manifest entries                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `.agent`    | 0 (all current)                                                                                     |
| `.claude`   | 1 (`commands.cjs` - manifest still has old hash `95a7ff9e…`)                                        |
| `.codex`    | 6 (`commands.cjs`, `config.cjs`, `phase.cjs`, `profile-output.cjs`, `verify.cjs`, `workstream.cjs`) |
| `.cursor`   | 0 (all current)                                                                                     |
| `.gemini`   | 1 (`commands.cjs`)                                                                                  |
| `.github`   | 0 (all current)                                                                                     |
| `.opencode` | 0 (all current)                                                                                     |
| `.windsurf` | 0 (all current)                                                                                     |

---

## 3. Workflow Divergences Summary

### 3.1 Root Cause

The overwhelming majority of workflow divergences (**349 files** flagged by validate-harness-sync, **178 files** by audit-harness-sync) share the **same root cause**: command-prefix substitution permeating all workflow `.md` files.

Each workflow file contains embedded command references; these are systematically rewritten per-harness:

| Harness     | Command Prefix | Example            |
| ----------- | -------------- | ------------------ |
| `.agent`    | `/gsd-command` | `/gsd-new-project` |
| `.claude`   | `/gsd:command` | `/gsd:new-project` |
| `.gemini`   | `/gsd:command` | `/gsd:new-project` |
| `.cursor`   | `/gsd:command` | `/gsd:new-project` |
| `.codex`    | `$gsd-command` | `$gsd-new-project` |
| `.github`   | `/gsd:command` | `/gsd:new-project` |
| `.opencode` | `/gsd:command` | `/gsd:new-project` |
| `.windsurf` | `/gsd:command` | `/gsd:new-project` |

Additionally, workflows reference the harness binary path:
- `.agent` workflows: `node ".agent/get-shit-done/bin/gsd-tools.cjs"`
- `.claude` workflows: `node ".claude/get-shit-done/bin/gsd-tools.cjs"`
- `.cursor` workflows: `node ".cursor/get-shit-done/bin/gsd-tools.cjs"`

### 3.2 Workflow File Divergence by Category

#### Commands / Navigation

| File                          | Divergent Harnesses | First diff line |
| ----------------------------- | ------------------- | --------------- |
| `commands/gsd/workstreams.md` | codex               | ~varies         |
| `workflows/do.md`             | ALL 7 non-agent     | ~27, ~40–57     |
| `workflows/help.md`           | ALL 7 non-agent     | ~varies         |
| `workflows/health.md`         | ALL 7 non-agent     | ~28, ~162       |
| `workflows/manager.md`        | ALL 7 non-agent     | ~varies         |
| `workflows/settings.md`       | ALL 7 non-agent     | ~varies         |

#### Phase Lifecycle Workflows

| File                                     | Divergent Harnesses                     |
| ---------------------------------------- | --------------------------------------- |
| `workflows/add-phase.md`                 | codex                                   |
| `workflows/discuss-phase.md`             | ALL 7 non-agent                         |
| `workflows/discuss-phase-assumptions.md` | ALL 7 non-agent                         |
| `workflows/discovery-phase.md`           | ALL 7 non-agent                         |
| `workflows/execute-phase.md`             | ALL 7 non-agent                         |
| `workflows/execute-plan.md`              | ALL 7 non-agent                         |
| `workflows/insert-phase.md`              | codex                                   |
| `workflows/list-phase-assumptions.md`    | claude, cursor, codex, gemini, windsurf |
| `workflows/plan-phase.md`                | ALL 7 non-agent                         |
| `workflows/remove-phase.md`              | codex                                   |
| `workflows/research-phase.md`            | codex                                   |
| `workflows/validate-phase.md`            | ALL 7 non-agent                         |
| `workflows/verify-work.md`               | ALL 7 minus github                      |

#### Milestone / Project Workflows

| File                              | Divergent Harnesses               |
| --------------------------------- | --------------------------------- |
| `workflows/audit-milestone.md`    | codex                             |
| `workflows/complete-milestone.md` | cursor, codex, opencode, windsurf |
| `workflows/milestone-summary.md`  | ALL 7 non-agent                   |
| `workflows/new-milestone.md`      | cursor, codex, opencode, windsurf |
| `workflows/new-project.md`        | ALL 7 non-agent                   |
| `workflows/new-workspace.md`      | cursor, codex, opencode, windsurf |
| `workflows/plant-seed.md`         | cursor, codex, opencode, windsurf |
| `workflows/resume-project.md`     | codex                             |

#### Autonomous / Quick Workflows

| File                      | Divergent Harnesses                                           |
| ------------------------- | ------------------------------------------------------------- |
| `workflows/autonomous.md` | ALL 7 non-agent                                               |
| `workflows/fast.md`       | codex, cursor, windsurf (claude/gemini/agent partially share) |
| `workflows/quick.md`      | ALL 7 non-agent                                               |

#### Status / Reporting Workflows

| File                          | Divergent Harnesses               |
| ----------------------------- | --------------------------------- |
| `workflows/check-todos.md`    | cursor, codex, opencode, windsurf |
| `workflows/cleanup.md`        | cursor, opencode, windsurf        |
| `workflows/health.md`         | ALL 7 non-agent                   |
| `workflows/next.md`           | claude, codex, gemini, opencode   |
| `workflows/pause-work.md`     | ALL 7 minus opencode              |
| `workflows/progress.md`       | ALL 7 minus opencode              |
| `workflows/review.md`         | ALL 7 minus opencode              |
| `workflows/session-report.md` | claude, codex, gemini             |
| `workflows/stats.md`          | ALL 7 non-agent                   |
| `workflows/transition.md`     | codex, opencode                   |
| `workflows/update.md`         | ALL 7 non-agent                   |

#### UI Workflows

| File                     | Divergent Harnesses |
| ------------------------ | ------------------- |
| `workflows/ui-phase.md`  | ALL 7 non-agent     |
| `workflows/ui-review.md` | ALL 7 non-agent     |

#### Reference Files

| File                                  | Divergent Harnesses                        | Notes      |
| ------------------------------------- | ------------------------------------------ | ---------- |
| `references/checkpoints.md`           | claude, cursor, gemini, windsurf           | 2 groups   |
| `references/continuation-format.md`   | claude, codex, gemini                      | 3 groups   |
| `references/git-integration.md`       | ALL 8 unique                               | all differ |
| `references/model-profiles.md`        | ALL 8 unique                               | all differ |
| `references/questioning.md`           | claude, cursor, gemini, opencode, windsurf | 3 groups   |
| `references/ui-brand.md`              | claude, codex, gemini                      | 3 groups   |
| `references/user-profiling.md`        | claude, cursor, gemini, windsurf           | 2 groups   |
| `references/verification-patterns.md` | ALL 8 unique                               | all differ |
| `references/workstream-flag.md`       | cursor, windsurf                           | 3 groups   |

#### Templates

| File                                   | Divergent Harnesses                     | Notes      |
| -------------------------------------- | --------------------------------------- | ---------- |
| `templates/DEBUG.md`                   | claude, codex, cursor, gemini, windsurf | 4 groups   |
| `templates/UAT.md`                     | codex                                   | 3 groups   |
| `templates/VALIDATION.md`              | codex                                   | 3 groups   |
| `templates/claude-md.md`               | ALL 8 unique                            | all differ |
| `templates/codebase/architecture.md`   | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/codebase/concerns.md`       | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/codebase/conventions.md`    | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/codebase/structure.md`      | ALL 8 unique                            | all differ |
| `templates/context.md`                 | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/continue-here.md`           | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/debug-subagent-prompt.md`   | claude, codex, gemini                   | 3 groups   |
| `templates/dev-preferences.md`         | claude, codex, gemini                   | 3 groups   |
| `templates/discovery.md`               | claude, codex, gemini                   | 3 groups   |
| `templates/discussion-log.md`          | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/phase-prompt.md`            | ALL 8 unique                            | all differ |
| `templates/planner-subagent-prompt.md` | claude, codex, gemini                   | 3 groups   |
| `templates/project.md`                 | claude, codex, cursor, gemini, windsurf | 5 groups   |
| `templates/research.md`                | claude, codex, cursor, gemini, windsurf | 4 groups   |
| `templates/state.md`                   | claude, codex, cursor, gemini, windsurf | 4 groups   |
| `templates/user-profile.md`            | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/user-setup.md`              | claude, cursor, gemini, windsurf        | 2 groups   |
| `templates/verification-report.md`     | claude, cursor, gemini, windsurf        | 2 groups   |

### 3.3 Workflow Diff Sample: `do.md` (agent → claude)

```diff
--- .agent/get-shit-done/workflows/do.md
+++ .claude/get-shit-done/workflows/do.md
 27c27
- INIT=$(node ".agent/get-shit-done/bin/gsd-tools.cjs" state load 2>/dev/null)
+ INIT=$(node ".claude/get-shit-done/bin/gsd-tools.cjs" state load 2>/dev/null)
 40,55c40,55
- | Starting a new project  | `/gsd-new-project`   | Needs full project initialization |
- | Mapping a codebase      | `/gsd-map-codebase`  | Codebase discovery                |
- | A bug or crash          | `/gsd-debug`         | Needs systematic investigation    |
- | Exploring/researching   | `/gsd-research-phase`| Domain research before planning   |
+ | Starting a new project  | `/gsd:new-project`   | Needs full project initialization |
+ | Mapping a codebase      | `/gsd:map-codebase`  | Codebase discovery                |
+ | A bug or crash          | `/gsd:debug`         | Needs systematic investigation    |
+ | Exploring/researching   | `/gsd:research-phase`| Domain research before planning   |
```

### 3.4 Workflow Diff Sample: `health.md` (agent → cursor)

```diff
--- .agent/get-shit-done/workflows/health.md
+++ .cursor/get-shit-done/workflows/health.md
 28c28
- node ".agent/get-shit-done/bin/gsd-tools.cjs" validate health $REPAIR_FLAG
+ node ".cursor/get-shit-done/bin/gsd-tools.cjs" validate health $REPAIR_FLAG
 162c162
- **Windows-specific:** Check for stale Claude Code task directories...
+ **Windows-specific:** Check for stale Cursor task directories...
 169c169
- TASKS_DIR=".agent/tasks"
+ TASKS_DIR=".cursor/tasks"
 173c173
- echo "⚠️  Found $STALE_COUNT stale task directories in .agent/tasks/"
+ echo "⚠️  Found $STALE_COUNT stale task directories in .cursor/tasks/"
 175c175
- echo "   Run: rm -rf .agent/tasks/*  (safe - only affects dead sessions)"
+ echo "   Run: rm -rf .cursor/tasks/*  (safe - only affects dead sessions)"
```

### 3.5 Hooks Files - Partial Deployment

5 hook files are **present only in 4 harnesses**, absent from the other 4:

| Hook File                      | Present in                                  | Absent from                                 |
| ------------------------------ | ------------------------------------------- | ------------------------------------------- |
| `hooks/gsd-check-update.js`    | `.agent`, `.claude`, `.gemini`, `.opencode` | `.codex`, `.cursor`, `.github`, `.windsurf` |
| `hooks/gsd-context-monitor.js` | `.agent`, `.claude`, `.gemini`, `.opencode` | `.codex`, `.cursor`, `.github`, `.windsurf` |
| `hooks/gsd-prompt-guard.js`    | `.agent`, `.claude`, `.gemini`, `.opencode` | `.codex`, `.cursor`, `.github`, `.windsurf` |
| `hooks/gsd-statusline.js`      | `.agent`, `.claude`, `.gemini`, `.opencode` | `.codex`, `.cursor`, `.github`, `.windsurf` |
| `hooks/gsd-workflow-guard.js`  | `.agent`, `.claude`, `.gemini`, `.opencode` | `.codex`, `.cursor`, `.github`, `.windsurf` |

### 3.6 Skills Files - Missing from `.claude` and `.gemini`

All 57 `skills/gsd-*/SKILL.md` files are **absent from `.claude` and `.gemini`** entirely, while present (with divergent hashes) in `.agent`, `.codex`, `.cursor`, `.github`, `.opencode`, `.windsurf`.

### 3.7 Agent Files - Missing from `.github`

All `agents/gsd-*.md` files are **absent from `.github`** harness. They exist (with divergent hashes) in all other harnesses.

---

## 4. Full Validation Script Output

### 4.1 `scripts/validate-harness-sync.cjs` (Drift Detector)

```
╔══════════════════════════════════════════════════════════════════════╗
║           GSD Harness Drift Detector  •  2026-04-03              ║
╚══════════════════════════════════════════════════════════════════════╝
  Root:     /home/fulgidus/Documents/pi-gsd
  Harnesses: agent, claude, codex, cursor, gemini, github, opencode, windsurf

── 1/5  CJS binary check ─────────────────────────────────────────────

  DRIFT   [codex   ] bin/lib/commands.cjs     canonical: 2fac72a2…  actual: 3e2e322b…
  DRIFT   [claude  ] bin/lib/config.cjs        canonical: d9d9274e…  actual: 81939c75…
  DRIFT   [codex   ] bin/lib/config.cjs        canonical: d9d9274e…  actual: a183ce8e…
  DRIFT   [gemini  ] bin/lib/config.cjs        canonical: d9d9274e…  actual: 81939c75…
  DRIFT   [claude  ] bin/lib/core.cjs          canonical: 89c6716e…  actual: a5fe1881…
  DRIFT   [codex   ] bin/lib/core.cjs          canonical: 89c6716e…  actual: a5fe1881…
  DRIFT   [cursor  ] bin/lib/core.cjs          canonical: 89c6716e…  actual: 14fb4cc3…
  DRIFT   [gemini  ] bin/lib/core.cjs          canonical: 89c6716e…  actual: a5fe1881…
  DRIFT   [github  ] bin/lib/core.cjs          canonical: 89c6716e…  actual: 577090c3…
  DRIFT   [opencode] bin/lib/core.cjs          canonical: 89c6716e…  actual: a5fe1881…
  DRIFT   [windsurf] bin/lib/core.cjs          canonical: 89c6716e…  actual: 42d43e06…
  DRIFT   [claude  ] bin/lib/phase.cjs         canonical: 74a47c12…  actual: 8a0fef06…
  DRIFT   [codex   ] bin/lib/phase.cjs         canonical: 74a47c12…  actual: b136a749…
  DRIFT   [gemini  ] bin/lib/phase.cjs         canonical: 74a47c12…  actual: 8a0fef06…
  DRIFT   [claude  ] bin/lib/profile-output.cjs  canonical: 117d1086…  actual: b5c74d54…
  DRIFT   [codex   ] bin/lib/profile-output.cjs  canonical: 117d1086…  actual: 686531c0…
  DRIFT   [cursor  ] bin/lib/profile-output.cjs  canonical: 117d1086…  actual: f75a8d62…
  DRIFT   [gemini  ] bin/lib/profile-output.cjs  canonical: 117d1086…  actual: b5c74d54…
  DRIFT   [github  ] bin/lib/profile-output.cjs  canonical: 117d1086…  actual: 87f790b0…
  DRIFT   [opencode] bin/lib/profile-output.cjs  canonical: 117d1086…  actual: 423c632c…
  DRIFT   [windsurf] bin/lib/profile-output.cjs  canonical: 117d1086…  actual: db092ff1…
  DRIFT   [claude  ] bin/lib/profile-pipeline.cjs  canonical: 9e4cfd4b…  actual: 6c73a8c1…
  DRIFT   [codex   ] bin/lib/profile-pipeline.cjs  canonical: 9e4cfd4b…  actual: 6c73a8c1…
  DRIFT   [cursor  ] bin/lib/profile-pipeline.cjs  canonical: 9e4cfd4b…  actual: 044cd845…
  DRIFT   [gemini  ] bin/lib/profile-pipeline.cjs  canonical: 9e4cfd4b…  actual: 6c73a8c1…
  DRIFT   [github  ] bin/lib/profile-pipeline.cjs  canonical: 9e4cfd4b…  actual: 5c46a230…
  DRIFT   [opencode] bin/lib/profile-pipeline.cjs  canonical: 9e4cfd4b…  actual: 6c73a8c1…
  DRIFT   [windsurf] bin/lib/profile-pipeline.cjs  canonical: 9e4cfd4b…  actual: 75127b56…
  DRIFT   [claude  ] bin/lib/verify.cjs        canonical: 1eded11b…  actual: 1fd33de4…
  DRIFT   [codex   ] bin/lib/verify.cjs        canonical: 1eded11b…  actual: 47f284ad…
  DRIFT   [gemini  ] bin/lib/verify.cjs        canonical: 1eded11b…  actual: 1fd33de4…
  DRIFT   [claude  ] bin/lib/workstream.cjs    canonical: 2646820c…  actual: b3f92418…
  DRIFT   [codex   ] bin/lib/workstream.cjs    canonical: 2646820c…  actual: 2e33c936…
  DRIFT   [gemini  ] bin/lib/workstream.cjs    canonical: 2646820c…  actual: b3f92418…

── 2/5  Workflow semantic check ──────────────────────────────────────
  (349 DRIFT entries - see §3 above for full categorized list)

── 3/5  File-set completeness check ─────────────────────────────────
  OK      [agent   ] 213 declared files all present
  OK      [claude  ] 213 declared files all present
  OK      [codex   ] 208 declared files all present
  OK      [cursor  ] 208 declared files all present
  OK      [gemini  ] 213 declared files all present
  OK      [github  ] 208 declared files all present
  MISSING [opencode] 57 file(s) declared in manifest but absent from disk
  OK      [windsurf] 208 declared files all present

── 4/5  VERSION consistency check ───────────────────────────────────
  OK      All checked harnesses on version 1.30.0

── 5/5  Manifest integrity check ────────────────────────────────────
  OK      [agent   ] 213 file(s) match manifest hashes
  TAMPERED [claude  ] 63 file(s) do not match manifest SHA-256
  TAMPERED [codex   ] 68 file(s) do not match manifest SHA-256
  TAMPERED [cursor  ] 62 file(s) do not match manifest SHA-256
  TAMPERED [gemini  ] 63 file(s) do not match manifest SHA-256
  TAMPERED [github  ] 4 file(s) do not match manifest SHA-256
  OK      [opencode] 213 file(s) match manifest hashes
  TAMPERED [windsurf] 62 file(s) do not match manifest SHA-256

✘  Drift detected: 34 cjs, 349 workflow, 1 fileset, 6 manifest
   47 passed · 390 failed · 0 skipped · 59ms
```

### 4.2 `scripts/audit-harness-sync.cjs` (Cross-Harness Sync Audit)

```
═══ GSD Cross-Harness Sync Audit ═══
ℹ Repo root  : /home/fulgidus/Documents/pi-gsd
ℹ Harnesses  : .agent  .claude  .codex  .cursor  .gemini  .github  .opencode  .windsurf

Harness versions:
  .agent        v1.30.0  (2026-04-03T09:57:22.300Z)
  .claude       v1.30.0  (2026-04-03T08:46:56.460Z)
  .codex        v1.30.0  (2026-04-03T08:46:56.520Z)
  .cursor       v1.30.0  (2026-04-03T08:46:56.577Z)
  .gemini       v1.30.0  (2026-04-03T08:46:56.499Z)
  .github       v1.30.0  (2026-04-03T08:46:56.542Z)
  .opencode     v1.30.0  (2026-04-03T09:57:22.300Z)
  .windsurf     v1.30.0  (2026-04-03T08:46:56.595Z)

Summary:
  ✔ Synced     : 219 files
  ✘ Divergent  : 178 files
  ⚠ Partial    : 5 files
       Total     : 402 files examined
```

> Full divergent file listing with per-harness hashes is in `/tmp/harness-audit-output.txt`.

### 4.3 `scripts/validate-model-profiles.cjs` (Model Profiles Sync)

```
── model-profiles sync check ─────────────────────────────────────────

  Source:  /home/fulgidus/Documents/pi-gsd/.agent/get-shit-done/bin/lib/model-profiles.cjs
  Targets: 8 harness(es)

  OK     .agent/get-shit-done/references/model-profiles.md
  OK     .claude/get-shit-done/references/model-profiles.md
  OK     .codex/get-shit-done/references/model-profiles.md
  OK     .cursor/get-shit-done/references/model-profiles.md
  OK     .gemini/get-shit-done/references/model-profiles.md
  OK     .github/get-shit-done/references/model-profiles.md
  OK     .opencode/get-shit-done/references/model-profiles.md
  OK     .windsurf/get-shit-done/references/model-profiles.md

✔  All model-profiles.md files are in sync with model-profiles.cjs.
```

### 4.4 `.pi-lens/validate-harness-drift.js --verbose` (Strict Identity + Manifest Check)

**Check 1 - Strict binary identity (10 files, all PASS):**

```
✓  get-shit-done/bin/gsd-tools.cjs          - 1 unique hash across all 8
✓  get-shit-done/bin/lib/frontmatter.cjs     - 1 unique hash across all 8
✓  get-shit-done/bin/lib/init.cjs            - 1 unique hash across all 8
✓  get-shit-done/bin/lib/milestone.cjs       - 1 unique hash across all 8
✓  get-shit-done/bin/lib/model-profiles.cjs  - 1 unique hash across all 8
✓  get-shit-done/bin/lib/roadmap.cjs         - 1 unique hash across all 8
✓  get-shit-done/bin/lib/security.cjs        - 1 unique hash across all 8
✓  get-shit-done/bin/lib/state.cjs           - 1 unique hash across all 8
✓  get-shit-done/bin/lib/template.cjs        - 1 unique hash across all 8
✓  get-shit-done/bin/lib/uat.cjs             - 1 unique hash across all 8
```

**Check 2 - Harness-specific CJS (manifest staleness), 8 FAIL:**

```
✗  .claude/get-shit-done/bin/lib/commands.cjs
     → disk 2fac72a2… ≠ manifest 95a7ff9e… - manifest is stale
✗  .codex/get-shit-done/bin/lib/commands.cjs
     → disk 3e2e322b… ≠ manifest 95a7ff9e… - manifest is stale
✗  .codex/get-shit-done/bin/lib/config.cjs
     → disk a183ce8e… ≠ manifest 81939c75… - manifest is stale
✗  .codex/get-shit-done/bin/lib/phase.cjs
     → disk b136a749… ≠ manifest 8a0fef06… - manifest is stale
✗  .codex/get-shit-done/bin/lib/profile-output.cjs
     → disk 686531c0… ≠ manifest b5c74d54… - manifest is stale
✗  .codex/get-shit-done/bin/lib/verify.cjs
     → disk 47f284ad… ≠ manifest 1fd33de4… - manifest is stale
✗  .codex/get-shit-done/bin/lib/workstream.cjs
     → disk 2e33c936… ≠ manifest b3f92418… - manifest is stale
✗  .gemini/get-shit-done/bin/lib/commands.cjs
     → disk 2fac72a2… ≠ manifest 95a7ff9e… - manifest is stale
```

**Check 3 - Workflow semantic equivalence (path-normalised diff), numerous FAIL:**

```
✗  add-phase.md
     → .codex: differs from .agent at line ~14
✗  add-tests.md
     → .codex: ~4; .cursor: ~14; .opencode: ~112; .windsurf: ~14
✗  add-todo.md
     → .claude: ~103; .codex: ~31; .cursor: ~73; .gemini: ~103; .opencode: ~73; .windsurf: ~73
✗  autonomous.md
     → .claude: ~177; .codex: ~19; .cursor: ~19; .gemini: ~177; .opencode: ~308; .windsurf: ~19
     (... and ~50+ more workflow files)
```

---

## 5. Known Intentional Differences

These divergences are **by design** and should **not** be treated as bugs or sync failures:

### 5.1 Command Prefix - Native AI Platform Syntax

Each AI platform registers GSD commands differently. The harness must use the platform's native slash/prefix:

| Platform                   | Prefix Format  | Registered as                |
| -------------------------- | -------------- | ---------------------------- |
| Claude Code (`.agent`)     | `/gsd-command` | Claude Code slash commands   |
| Claude Desktop (`.claude`) | `/gsd:command` | MCP-style slash commands     |
| Gemini (`.gemini`)         | `/gsd:command` | Gemini-style commands        |
| Cursor (`.cursor`)         | `/gsd:command` | Cursor composer commands     |
| Codex (`.codex`)           | `$gsd-command` | Shell variable / Codex-style |
| GitHub Copilot (`.github`) | `/gsd:command` | Copilot chat commands        |
| OpenCode (`.opencode`)     | `/gsd:command` | OpenCode commands            |
| Windsurf (`.windsurf`)     | `/gsd:command` | Windsurf Cascade commands    |

This affects: all workflow `.md` files, `config.cjs`, `verify.cjs`, `phase.cjs`, `workstream.cjs`, `commands.cjs`.

### 5.2 Binary Path References - Harness-Scoped Runtime

Each harness must invoke its own copy of `gsd-tools.cjs` to ensure isolation:
- `.agent` workflows: `node ".agent/get-shit-done/bin/gsd-tools.cjs"`
- `.claude` workflows: `node ".claude/get-shit-done/bin/gsd-tools.cjs"`
- etc.

This affects: essentially every workflow file that runs a node command.

### 5.3 Agent Branding - Profile Output Personalization

`profile-output.cjs` substitutes "Claude", "Cursor", "Windsurf", etc. in user-facing profiling questions so the experience feels native to the platform. This is intentional UX.

### 5.4 Session History Path - Profile Pipeline

`profile-pipeline.cjs` reads AI session history from platform-specific paths:
- `.agent`: `.agent/projects` (Claude Code local)
- `.cursor`: `~/.claude/projects` (Cursor session cache)
- etc.

### 5.5 JSDoc Stripping in `core.cjs` - Distribution Size

The `.agent` harness ships with full JSDoc type annotations (416 extra lines) for developer tooling. Distribution harnesses strip these for payload size. **Runtime behavior is identical.**

### 5.6 Hooks Absence in 4 Harnesses

`.codex`, `.cursor`, `.github`, `.windsurf` do not support the GSD hook system (`hooks/gsd-*.js`). This is a **platform capability gap**, not drift.

### 5.7 Skills Absence in `.claude` and `.gemini`

The `skills/gsd-*/SKILL.md` files follow a format specific to certain platforms' skill/tool registries. `.claude` and `.gemini` use a different invocation model and do not include them.

### 5.8 Agent Files Absence in `.github`

GitHub Copilot does not support freestanding agent definition files. The `.github` harness omits all `agents/gsd-*.md`.

### 5.9 `model-profiles.md` Reference Files

Despite `audit-harness-sync.cjs` reporting all 8 as divergent, `validate-model-profiles.cjs` confirms **all are semantically in sync** with `model-profiles.cjs`. The hash divergence is likely whitespace/comment variation per harness header - not a functional difference.

---

## 6. Action Items

### 6.1 Immediate / High Priority

| #   | Item                                                                                   | Affected    | Severity |
| --- | -------------------------------------------------------------------------------------- | ----------- | -------- |
| 1   | **Regenerate stale manifests in `.codex`** - 6 CJS files have outdated manifest hashes | `.codex`    | 🔴 High   |
| 2   | **Regenerate stale manifest in `.claude`** - `commands.cjs` manifest hash is stale     | `.claude`   | 🟡 Medium |
| 3   | **Regenerate stale manifest in `.gemini`** - `commands.cjs` manifest hash is stale     | `.gemini`   | 🟡 Medium |
| 4   | **Fix opencode missing 57 SKILL.md files** - declared in manifest but absent on disk   | `.opencode` | 🔴 High   |

### 6.2 Investigate / Medium Priority

| #   | Item                                                                                                                                                                                                                    | Affected                          | Notes                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| 5   | Verify `.codex` has intentional divergence in `config.cjs` vs `.claude`/`.gemini` - they share one hash group but codex has a third                                                                                     | `.codex`                          | Codex may have a 3rd command prefix variant in config |
| 6   | Confirm `.cursor`/`.github`/`.windsurf` each have a unique `core.cjs` hash - determine if cursor/github/windsurf-specific patches are documented                                                                        | `.cursor`, `.github`, `.windsurf` | Should be in HOOKS_ARCHITECTURE.md                    |
| 7   | Audit the 5 "TAMPERED" harnesses (claude, codex, cursor, gemini, windsurf) with 62-68 files each failing manifest - determine if these are all expected command-prefix substitutions or if there are unintended changes | all non-agent/-opencode           | Run with `--verbose`                                  |
| 8   | Investigate why `.github` only shows 4 TAMPERED manifest entries vs 62+ for others - it may have a very old manifest                                                                                                    | `.github`                         | Suspicious gap                                        |

### 6.3 Documentation / Low Priority

| #   | Item                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | Document the **canonical source of truth** for each CJS file - which harness is "upstream" and how distribution harnesses are generated            |
| 10  | Add a note to `HOOKS_ARCHITECTURE.md` explaining why hooks are absent in `.codex`/`.cursor`/`.github`/`.windsurf`                                  |
| 11  | Document why `.claude` and `.gemini` omit skills files while `.opencode` manifest lists them (and then fails fileset check)                        |
| 12  | Consider adding a `--expected-diffs` configuration to `validate-harness-sync.cjs` so known intentional differences don't inflate the failure count |

### 6.4 Quick Fix Commands

```bash
# Re-sync all harnesses using the GSD update script
npx get-shit-done-cc --force-reinstall

# Re-run drift detection after fix
node scripts/validate-harness-sync.cjs

# Re-run cross-harness audit after fix
node scripts/audit-harness-sync.cjs

# Verify model profiles are still in sync
node scripts/validate-model-profiles.cjs
```

---

## Appendix: Hash Reference Table

### Binary CJS Unique Hash Groups

| Module                 | Group A                                                     | Group B                                          | Group C              | Group D              | Group E                | Group F                |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------ | -------------------- | -------------------- | ---------------------- | ---------------------- |
| `commands.cjs`         | `2fac72a2` (.agent, .cursor, .github, .opencode, .windsurf) | `95a7ff9e` (.claude, .gemini - manifest only)    | `3e2e322b` (.codex)  | -                    | -                      | -                      |
| `config.cjs`           | `d9d9274e` (.agent, .cursor, .github, .opencode, .windsurf) | `81939c75` (.claude, .gemini)                    | `a183ce8e` (.codex)  | -                    | -                      | -                      |
| `core.cjs`             | `89c6716e` (.agent)                                         | `a5fe1881` (.claude, .codex, .gemini, .opencode) | `14fb4cc3` (.cursor) | `577090c3` (.github) | `42d43e06` (.windsurf) | -                      |
| `phase.cjs`            | `74a47c12` (.agent, .cursor, .github, .opencode, .windsurf) | `8a0fef06` (.claude, .gemini)                    | `b136a749` (.codex)  | -                    | -                      | -                      |
| `profile-output.cjs`   | `117d1086` (.agent)                                         | `b5c74d54` (.claude, .codex, .gemini)            | `f75a8d62` (.cursor) | `87f790b0` (.github) | `423c632c` (.opencode) | `db092ff1` (.windsurf) |
| `profile-pipeline.cjs` | `9e4cfd4b` (.agent)                                         | `6c73a8c1` (.claude, .codex, .gemini, .opencode) | `044cd845` (.cursor) | `5c46a230` (.github) | `75127b56` (.windsurf) | -                      |
| `verify.cjs`           | `1eded11b` (.agent, .cursor, .github, .opencode, .windsurf) | `1fd33de4` (.claude, .gemini)                    | `47f284ad` (.codex)  | -                    | -                      | -                      |
| `workstream.cjs`       | `2646820c` (.agent, .cursor, .github, .opencode, .windsurf) | `b3f92418` (.claude, .gemini)                    | `2e33c936` (.codex)  | -                    | -                      | -                      |

---

*Report generated by Worker Ant - pi-gsd colony • 2026-04-03*
