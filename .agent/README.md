# pi-gsd

> **Get Shit Done** — a pi skill pack and agent suite for structured, milestone-driven software delivery.

[![npm](https://img.shields.io/npm/v/pi-gsd)](https://www.npmjs.com/package/pi-gsd)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

`pi-gsd` turns any AI coding agent into a disciplined project manager. It provides a structured phase lifecycle (discuss → research → plan → execute → verify → validate), 57 skills, 18 specialist subagents, and 5 runtime hooks — all wired together so you ship features, not chaos.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Installation](#2-installation)
3. [Quick Start](#3-quick-start)
4. [Phase Lifecycle](#4-phase-lifecycle)
5. [Command Reference](#5-command-reference)
   - [Project Setup](#project-setup)
   - [Phase Lifecycle Commands](#phase-lifecycle-commands)
   - [Phase Management](#phase-management)
   - [Navigation & Status](#navigation--status)
   - [Autonomous & Accelerated](#autonomous--accelerated)
   - [Milestone Lifecycle](#milestone-lifecycle)
   - [Capture & Ideas](#capture--ideas)
   - [UI & Frontend](#ui--frontend)
   - [Workspaces](#workspaces)
   - [Shipping & Review](#shipping--review)
   - [Debugging & Diagnostics](#debugging--diagnostics)
   - [Configuration](#configuration)
   - [Discovery](#discovery)
6. [Model Profiles](#6-model-profiles)
7. [Agent Roster](#7-agent-roster)
8. [Hooks](#8-hooks)
9. [License](#9-license)

---

## 1. Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18 |
| AI harness | Claude Code, Gemini CLI, OpenCode, Codex, Cursor, Windsurf, or GitHub Copilot |
| Git | Any recent version (for atomic commits and PR workflows) |

---

## 2. Installation

Install via the `get-shit-done-cc` bootstrap installer — it scaffolds the correct harness directory (`~/.claude/`, `~/.gemini/`, etc.) and registers hooks automatically:

```bash
# Claude Code (global install)
npx get-shit-done-cc --claude --global

# Gemini CLI
npx get-shit-done-cc --gemini --global

# OpenCode
npx get-shit-done-cc --opencode --global

# Codex
npx get-shit-done-cc --codex --global

# All harnesses at once
npx get-shit-done-cc --all --global
```

After installation, `pi-gsd` skills are available immediately as `/gsd-<command>` in your AI session.

### Keeping GSD Up to Date

```bash
/gsd-update
```

---

## 3. Quick Start

### New project from scratch

```
/gsd-new-project
```

GSD will ask you questions about your project, run domain research, produce `REQUIREMENTS.md` and `ROADMAP.md`, then guide you phase by phase.

### Jump straight to first phase

```
/gsd-plan-phase 1
/gsd-execute-phase 1
/gsd-verify-work 1
```

### Let GSD drive everything autonomously

```
/gsd-autonomous
```

Runs discuss → plan → execute for every remaining phase without manual prompting.

### Don't know what to do next?

```
/gsd-next
```

Reads current state and routes you to the appropriate step.

### Just tell GSD what you want in plain English

```
/gsd-do add authentication to phase 3
```

GSD's smart dispatcher parses your intent and calls the right command.

---

## 4. Phase Lifecycle

Each phase moves through a defined sequence of steps. You can run each step individually or use `/gsd-autonomous` to run them all:

```
┌─────────────────────────────────────────────────────────────────┐
│  /gsd-discuss-phase <N>   ← gather context, surface assumptions │
│           ↓                                                      │
│  /gsd-research-phase <N>  ← domain research (optional)          │
│           ↓                                                      │
│  /gsd-plan-phase <N>      ← create PLAN.md, verify goal fit     │
│           ↓                                                      │
│  /gsd-execute-phase <N>   ← wave-based parallel execution        │
│           ↓                                                      │
│  /gsd-verify-work <N>     ← conversational UAT                  │
│           ↓                                                      │
│  /gsd-validate-phase <N>  ← Nyquist gap audit & sign-off        │
└─────────────────────────────────────────────────────────────────┘
```

### Key flags

| Command | Flag | Effect |
|---------|------|--------|
| `/gsd-discuss-phase` | `--auto` | Skip interactive questions; agent picks recommended defaults |
| `/gsd-execute-phase` | `--wave N` | Start from wave N (resume mid-execution) |
| `/gsd-execute-phase` | `--gaps-only` | Fill only previously identified gaps |
| `/gsd-execute-phase` | `--interactive` | Pause for confirmation at each wave |
| `/gsd-autonomous` | `--from N` | Start autonomous run from phase N |
| `/gsd-new-project` | `--auto` | Run research → requirements → roadmap non-interactively |

### Planning artifacts created per phase

| File | Created by | Purpose |
|------|-----------|---------|
| `.planning/PROJECT.md` | `gsd-new-project` | Project context and goals |
| `.planning/config.json` | `gsd-new-project` | Workflow preferences and model profile |
| `.planning/REQUIREMENTS.md` | `gsd-new-project` | Scoped feature requirements |
| `.planning/ROADMAP.md` | `gsd-new-project` | Phase structure and milestones |
| `.planning/STATE.md` | `gsd-new-project` | Project memory across sessions |
| `.planning/<N>/RESEARCH.md` | `gsd-research-phase` | Phase domain research |
| `.planning/<N>/PLAN.md` | `gsd-plan-phase` | Executable task breakdown |
| `.planning/<N>/VERIFICATION.md` | `gsd-verify-work` | UAT results |
| `.planning/codebase/` | `gsd-map-codebase` | Structural codebase analysis |

---

## 5. Command Reference

All commands use the `/gsd-<name>` dash-form prefix. This is the canonical prefix across all 8 supported harnesses.

### Project Setup

| Command | Description |
|---------|-------------|
| `/gsd-new-project` | Initialize a new project with deep context gathering and `PROJECT.md` |
| `/gsd-new-milestone` | Start a new milestone cycle — update `PROJECT.md` and route to requirements |
| `/gsd-map-codebase` | Analyze codebase with parallel mapper agents → `.planning/codebase/` documents |
| `/gsd-settings` | Configure GSD workflow toggles and model profile |

### Phase Lifecycle Commands

| Command | Description |
|---------|-------------|
| `/gsd-discuss-phase <N>` | Gather phase context through adaptive questioning before planning |
| `/gsd-research-phase <N>` | Research how to implement a phase (standalone; usually use `/gsd-plan-phase` instead) |
| `/gsd-plan-phase <N>` | Create detailed phase plan (`PLAN.md`) with verification loop |
| `/gsd-execute-phase <N>` | Execute all plans in a phase with wave-based parallelization |
| `/gsd-verify-work <N>` | Validate built features through conversational UAT |
| `/gsd-validate-phase <N>` | Retroactively audit and fill Nyquist validation gaps for a completed phase |

### Phase Management

| Command | Description |
|---------|-------------|
| `/gsd-add-phase` | Add a phase to the end of the current milestone in the roadmap |
| `/gsd-insert-phase` | Insert urgent work as a decimal phase (e.g. `72.1`) between existing phases |
| `/gsd-remove-phase` | Remove a future phase from the roadmap and renumber subsequent phases |
| `/gsd-discuss-phase <N>` | Also used to restructure phase scope before planning |
| `/gsd-list-phase-assumptions` | Surface the agent's assumptions about a phase approach before planning |

### Navigation & Status

| Command | Description |
|---------|-------------|
| `/gsd-manager` | Interactive command center for managing multiple phases from one terminal |
| `/gsd-progress` | Check project progress, show context, and route to next action |
| `/gsd-stats` | Display project statistics — phases, plans, requirements, git metrics, and timeline |
| `/gsd-next` | Automatically advance to the next logical step in the GSD workflow |
| `/gsd-resume-work` | Resume work from previous session with full context restoration |
| `/gsd-pause-work` | Create context handoff when pausing work mid-phase |

### Autonomous & Accelerated

| Command | Description |
|---------|-------------|
| `/gsd-autonomous` | Run all remaining phases autonomously — discuss → plan → execute per phase |
| `/gsd-do <text>` | Route freeform text to the right GSD command automatically |
| `/gsd-quick` | Execute a quick task with GSD guarantees (atomic commits, state tracking) but skip optional agents |
| `/gsd-fast` | Execute a trivial task inline — no subagents, no planning overhead |

### Milestone Lifecycle

| Command | Description |
|---------|-------------|
| `/gsd-complete-milestone` | Archive completed milestone and prepare for next version |
| `/gsd-audit-milestone` | Audit milestone completion against original intent before archiving |
| `/gsd-plan-milestone-gaps` | Create phases to close all gaps identified by milestone audit |
| `/gsd-milestone-summary` | Generate a comprehensive project summary from milestone artifacts for team onboarding and review |
| `/gsd-audit-uat` | Cross-phase audit of all outstanding UAT and verification items |
| `/gsd-cleanup` | Archive accumulated phase directories from completed milestones |

### Capture & Ideas

| Command | Description |
|---------|-------------|
| `/gsd-add-todo` | Capture an idea or task as a todo from current conversation context |
| `/gsd-check-todos` | List pending todos and select one to work on |
| `/gsd-add-backlog` | Add an idea to the backlog parking lot (`999.x` numbering) |
| `/gsd-review-backlog` | Review and promote backlog items to active milestone |
| `/gsd-note` | Zero-friction idea capture — append, list, or promote notes to todos |
| `/gsd-plant-seed` | Capture a forward-looking idea with trigger conditions — surfaces automatically at the right milestone |
| `/gsd-thread` | Manage persistent context threads for cross-session work |

### UI & Frontend

| Command | Description |
|---------|-------------|
| `/gsd-ui-phase` | Generate UI design contract (`UI-SPEC.md`) for frontend phases |
| `/gsd-ui-review` | Retroactive 6-pillar visual audit of implemented frontend code |
| `/gsd-add-tests` | Generate tests for a completed phase based on UAT criteria and implementation |

### Workspaces

| Command | Description |
|---------|-------------|
| `/gsd-new-workspace` | Create an isolated workspace with repo copies and independent `.planning/` |
| `/gsd-list-workspaces` | List active GSD workspaces and their status |
| `/gsd-remove-workspace` | Remove a GSD workspace and clean up worktrees |
| `/gsd-workstreams` | Manage parallel workstreams — list, create, switch, status, progress, complete, and resume |

### Shipping & Review

| Command | Description |
|---------|-------------|
| `/gsd-ship` | Create PR, run review, and prepare for merge after verification passes |
| `/gsd-pr-branch` | Create a clean PR branch by filtering out `.planning/` commits — ready for code review |
| `/gsd-review` | Request cross-AI peer review of phase plans from external AI CLIs |
| `/gsd-session-report` | Generate a session report with token usage estimates, work summary, and outcomes |

### Debugging & Diagnostics

| Command | Description |
|---------|-------------|
| `/gsd-debug` | Systematic debugging with persistent state across context resets |
| `/gsd-forensics` | Post-mortem investigation for failed GSD workflows — analyzes git history, artifacts, and state |
| `/gsd-health` | Diagnose planning directory health and optionally repair issues |
| `/gsd-reapply-patches` | Reapply local modifications after a GSD update |

### Configuration

| Command | Description |
|---------|-------------|
| `/gsd-settings` | Configure GSD workflow toggles and model profile |
| `/gsd-set-profile <profile>` | Switch model profile for GSD agents (`quality` / `balanced` / `budget` / `inherit`) |
| `/gsd-profile-user` | Generate developer behavioral profile and create agent-discoverable artifacts |

### Discovery

| Command | Description |
|---------|-------------|
| `/gsd-help` | Show available GSD commands and usage guide |
| `/gsd-update` | Update GSD to the latest version with changelog display |
| `/gsd-join-discord` | Join the GSD Discord community |

---

## 6. Model Profiles

GSD uses specialist subagents for planning, execution, verification, and more. A **model profile** controls which underlying model each agent uses, letting you balance quality against token spend.

Switch profiles at any time:

```bash
/gsd-set-profile balanced    # default
/gsd-set-profile quality     # maximum reasoning power
/gsd-set-profile budget      # minimize Opus usage
/gsd-set-profile inherit     # follow current session model
```

Or set permanently in `.planning/config.json`:

```json
{
  "model_profile": "balanced"
}
```

### Profile Definitions

| Agent | `quality` | `balanced` | `budget` | `inherit` |
|-------|-----------|------------|----------|-----------|
| `gsd-planner` | opus | opus | sonnet | inherit |
| `gsd-roadmapper` | opus | sonnet | sonnet | inherit |
| `gsd-executor` | opus | sonnet | sonnet | inherit |
| `gsd-phase-researcher` | opus | sonnet | haiku | inherit |
| `gsd-project-researcher` | opus | sonnet | haiku | inherit |
| `gsd-research-synthesizer` | sonnet | sonnet | haiku | inherit |
| `gsd-debugger` | opus | sonnet | sonnet | inherit |
| `gsd-codebase-mapper` | sonnet | haiku | haiku | inherit |
| `gsd-verifier` | sonnet | sonnet | haiku | inherit |
| `gsd-plan-checker` | sonnet | sonnet | haiku | inherit |
| `gsd-integration-checker` | sonnet | sonnet | haiku | inherit |
| `gsd-nyquist-auditor` | sonnet | sonnet | haiku | inherit |
| `gsd-ui-researcher` | opus | sonnet | haiku | inherit |
| `gsd-ui-checker` | sonnet | sonnet | haiku | inherit |
| `gsd-ui-auditor` | sonnet | sonnet | haiku | inherit |

### Profile Philosophy

**`quality`** — Maximum reasoning power. Opus for all decision-making agents, sonnet for read-only verification. Use for critical architecture work when quota is available.

**`balanced`** _(default)_ — Smart allocation. Opus only for planning (where architecture decisions happen); sonnet for execution, research, and verification. Best for normal day-to-day development.

**`budget`** — Minimal Opus usage. Sonnet for anything that writes code; haiku for research and verification. Use when conserving quota or running high-volume phases.

**`inherit`** — All agents resolve to the currently selected session model. Required when using non-Anthropic providers (OpenRouter, local models, etc.) to avoid unexpected costs.

### Per-Agent Overrides

Override specific agents without changing the full profile:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "opus",
    "gsd-planner": "haiku"
  }
}
```

Valid values: `opus`, `sonnet`, `haiku`, `inherit`, or any fully-qualified model ID (e.g. `"o3"`, `"openai/o3"`, `"google/gemini-2.5-pro"`).

---

## 7. Agent Roster

GSD spawns 18 specialist subagents internally. You do not call these directly — they are orchestrated by the skills above.

| Agent | Role |
|-------|------|
| `gsd-advisor-researcher` | Researches a single gray-area decision and returns a structured comparison table with rationale. Spawned by `discuss-phase` advisor mode. |
| `gsd-assumptions-analyzer` | Deeply analyzes the codebase for a phase and returns structured assumptions with evidence. Spawned by `discuss-phase` assumptions mode. |
| `gsd-codebase-mapper` | Explores the codebase and writes structured analysis documents to `.planning/codebase/`. Runs with parallel focus areas (tech, arch, quality, concerns). |
| `gsd-debugger` | Investigates bugs using the scientific method; manages debug sessions and checkpoints. Spawned by `/gsd-debug`. |
| `gsd-executor` | Executes `PLAN.md` with atomic commits, deviation handling, checkpoint protocols, and state management. Spawned by `execute-phase`. |
| `gsd-integration-checker` | Verifies cross-phase integration and end-to-end flows. Checks that phases connect properly and user workflows complete. |
| `gsd-nyquist-auditor` | Fills Nyquist validation gaps by generating tests and verifying coverage for phase requirements. |
| `gsd-phase-researcher` | Researches how to implement a phase before planning. Produces `RESEARCH.md` consumed by `gsd-planner`. |
| `gsd-plan-checker` | Verifies plans will achieve the phase goal before execution. Goal-backward analysis of plan quality. |
| `gsd-planner` | Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification. |
| `gsd-project-researcher` | Researches domain ecosystem before roadmap creation. Produces files in `.planning/research/`. |
| `gsd-research-synthesizer` | Synthesizes research outputs from parallel researcher agents into `SUMMARY.md`. |
| `gsd-roadmapper` | Creates project roadmaps with phase breakdown, requirement mapping, success-criteria derivation, and coverage validation. |
| `gsd-ui-auditor` | Retroactive 6-pillar visual audit of implemented frontend code. Produces scored `UI-REVIEW.md`. |
| `gsd-ui-checker` | Validates `UI-SPEC.md` design contracts against 6 quality dimensions. Produces BLOCK / FLAG / PASS verdicts. |
| `gsd-ui-researcher` | Produces `UI-SPEC.md` design contract for frontend phases. Detects design-system state; asks only unanswered questions. |
| `gsd-user-profiler` | Analyzes session messages across 8 behavioral dimensions to produce a scored developer profile with confidence levels and evidence. |
| `gsd-verifier` | Verifies phase goal achievement through goal-backward analysis — checks the codebase delivers what the phase promised, not just that tasks completed. Creates `VERIFICATION.md`. |

---

## 8. Hooks

GSD ships 5 runtime hooks that run automatically in the background during your AI session. They are installed as **OS hardlinks** — editing any one copy instantly updates all harness installations.

| Hook file | Trigger event | Purpose |
|-----------|--------------|---------|
| `gsd-statusline.js` | `StatusLine` (session) | Renders a context bar showing model, current task, and remaining context in the terminal statusline. Writes a bridge file at `/tmp/claude-ctx-{session}.json`. |
| `gsd-context-monitor.js` | `PostToolUse` / `AfterTool` | Reads the bridge file and injects an advisory `additionalContext` warning at 35% / 25% remaining context — prompting a save before context is exhausted. |
| `gsd-prompt-guard.js` | `PreToolUse` / `BeforeTool` | Scans content written to `.planning/` for 13 prompt-injection patterns. Advisory only — never blocks tool execution. |
| `gsd-check-update.js` | `SessionStart` | Spawns a background `npm view` version check and caches the result. Notifies you at session start if a GSD update is available. |
| `gsd-workflow-guard.js` | `PreToolUse` / `BeforeTool` | Detects direct file edits made outside a GSD workflow context. Advisory nudge to use `/gsd-fast` or `/gsd-quick` instead. |

### Harness hook coverage

| Harness | Hooks supported |
|---------|----------------|
| Claude Code (`.claude/`) | ✅ Full (all 5 hooks) |
| Gemini CLI (`.gemini/`) | ✅ Full (uses `AfterTool` / `BeforeTool` event names) |
| OpenCode (`.opencode/`) | ✅ Full |
| Agent / generic (`.agent/`) | ✅ Full |
| Codex (`.codex/`) | ⚠️ `SessionStart` only |
| Cursor (`.cursor/`) | ❌ No hook API |
| Windsurf (`.windsurf/`) | ❌ No hook API |
| GitHub Copilot (`.github/`) | ❌ No hook API |

### The hardlink model

All 5 hook files across all harness directories share the same OS inode. A fix applied to `.agent/hooks/gsd-context-monitor.js` is instantly visible in `.claude/hooks/`, `.gemini/hooks/`, and `.opencode/hooks/` — no sync step needed.

Verify at any time:

```bash
stat -c "%i %h %n" \
  .gsd/hooks/gsd-statusline.js \
  .agent/hooks/gsd-statusline.js \
  .claude/hooks/gsd-statusline.js \
  .gemini/hooks/gsd-statusline.js \
  .opencode/hooks/gsd-statusline.js
# All lines should print the same inode number
```

Re-establish hardlinks after a GSD update:

```bash
for hook in gsd-check-update.js gsd-context-monitor.js gsd-prompt-guard.js \
            gsd-statusline.js gsd-workflow-guard.js; do
  for harness in .agent .claude .gemini .opencode; do
    ln -fv ".gsd/hooks/$hook" "$harness/hooks/$hook"
  done
done
```

---

## 9. License

MIT © [get-shit-done-cc](https://github.com/get-shit-done-cc/get-shit-done)

---

*pi-gsd v1.30.0 · Node ≥ 18 · 57 skills · 18 agents · 5 hooks · 8 harnesses*
