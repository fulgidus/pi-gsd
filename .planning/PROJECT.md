# pi-gsd

## What This Is

pi-gsd is a TypeScript port of the GSD (Get Shit Done) v1.30.0 planning framework for the pi coding agent. It ships as an npm package that installs a complete AI-native project-planning system — 57 slash-command skills, a `pi-gsd-tools` CLI, background hooks, and harness workflow files — directly into any pi project on `pi install npm:pi-gsd`.

The core loop: `new-project → discuss-phase → plan-phase → execute-phase → verify-work → validate-phase → next phase`.

## Core Value

Workflow files execute programmatically before the LLM ever sees them — zero shell round-trips, zero arbitrary command execution, fully typed from end to end.

## Current Milestone: v1.0 — WXP

**Goal:** Build the Workflow XML Preprocessor (WXP) engine, migrate the CLI to oclif, convert all workflow files to WXP, eliminate every `any`, and replace symlink-based harness distribution with a stable copy-on-first-run system.

**Target features:**
- WXP engine (parser, executor, conditions, string-ops, paste, security, Zod + XSD schemas)
- oclif CLI migration (typed commands replacing commander.js manual parsing)
- Workflow file conversion (execute-phase pilot, then all high-traffic workflows)
- Zero-`any` type audit across the full codebase
- Harness copy-on-first-run with version-aware update prompts

## Requirements

### Validated

<!-- Capabilities already shipping in v1.12.4 -->

- ✓ `pi-gsd-tools` CLI binary with state/roadmap/phase/milestone/verify/scaffold/commit commands - existing
- ✓ 57 GSD slash-command skills installed to pi automatically - existing
- ✓ `<gsd-include>` tag resolution (file injection, selectors: tag/heading/lines) - existing (v1.12)
- ✓ Pi skill and hook distribution via postinstall
- ✓ `.planning/` git-committed state directory (PROJECT, ROADMAP, STATE, REQUIREMENTS, phases/) - existing
- ✓ Zod runtime schemas for all `.planning/` structures - existing
- ✓ Model profiles (quality/balanced/budget/inherit) - existing
- ✓ Workstream management commands - existing
- ✓ Background hooks (context monitor, workflow guard, statusline) - existing
- ✓ `pi-gsd-tools generate-claude-md` for GEMINI.md/CLAUDE.md generation - existing

### Active

<!-- Current milestone scope — all are hypotheses until shipped -->

- [ ] WXP engine integrated into pi extension `context` event
- [ ] `<gsd-arguments>` tag: typed argument schema with two-pass parser (flags + positionals)
- [ ] `<gsd-execute>` / `<shell>` blocks: allowlisted command execution with timeout
- [ ] `<if>` / `<equals>` / `<starts-with>` conditional execution
- [ ] `<string-op op="split">` string manipulation
- [ ] `<gsd-paste>` variable injection into text
- [ ] Variable collision detection with owner-prefix disambiguation
- [ ] XSD 1.1 canonical schema at `src/schemas/wxp.xsd`
- [ ] Zod runtime schemas at `src/schemas/wxp.zod.ts` (all types inferred, zero `any`)
- [ ] Security module: trusted-path enforcement, shell allowlist, 30s timeout
- [ ] WXP failure mode: total crash, no partial injection, full state dump error notification
- [ ] Resolution loop: handles conditional includes, nested includes, done-marker tracking
- [ ] vitest unit + integration tests for all WXP modules
- [ ] oclif migration: all commands typed via oclif decorators, no manual `parseNamedArgs()`
- [ ] oclif command tree as specified (state, progress, phase, milestone, roadmap, wxp, …)
- [ ] Removal of commander.js dependency
- [ ] `execute-phase.md` converted to WXP (pilot workflow)
- [ ] All remaining high-traffic workflows converted (plan-phase, discuss-phase, new-project, new-milestone)
- [ ] All remaining workflows converted incrementally
- [ ] Zero `any` across `src/`, `.gsd/extensions/`, `src/wxp/`
- [ ] `FrontmatterObject` → proper recursive YAML value type
- [ ] Workflows, prompt-templates, etc. copy-on-first-run on `session_start` (missing files only, never overwrites)
- [ ] Version-aware update prompts (`y / n / pick / diff`)
- [ ] Removal of `ensureHarnessSymlink()` and all symlink logic
- [ ] `<gsd-version v="X.Y.Z" />` and `do-not-update` flag support in workflow files
- [ ] `pi-gsd-settings.json` schema: trustedPaths, untrustedPaths, shellAllowlist, shellBanlist, shellTimeoutMs

### Out of Scope

- GUI/TUI for WXP debugging - use notifications; complexity not worth it for v1
- `<for-each>`, `<regex>`, `<json-parse>`, `<map>`, `<reduce>` WXP operations - deferred to v2+
- `<string-op>` operations beyond `split` - deferred to v2+
- Remote/URL file includes in `<gsd-include>` - strictly forbidden, security surface
- Plugin system for custom WXP tags - v2+
- `wait` / `async` attributes on `<shell>` - deferred to v1.1 per PRD
- OAuth login / SSO for any tooling surface - not applicable
- WXP support for `.planning/` files - security invariant, never process LLM-writable files

## Context

- **Existing codebase:** v1.12.4 is fully functional. `src/cli.ts` is ~9k lines with a lazy-loaded commander.js router. `src/lib/` has 16 domain modules. Harness files live in `.gsd/harnesses/pi/get-shit-done/` and are currently symlinked (fragile in worktrees and build scripts).
- **Pain point being solved:** Workflow files embed raw bash that the LLM must `run_bash()` to execute — wastes tokens (the LLM runs `pi-gsd-tools init execute-phase "16"`, parses JSON output, continues), is provider-dependent, and creates a shell execution surface. `<gsd-include>` (v1.12) solved file injection but not command execution.
- **Typing debt:** `FrontmatterObject = Record<string, any>` and scattered `eslint-disable-next-line @typescript-eslint/no-explicit-any` exist throughout. oclif's typed decorators eliminate this at the CLI layer; Zod-inferred types eliminate it in WXP.
- **Harness fragility:** Symlinks break in git worktrees and get nuked by some build scripts. Copy-on-first-run with version tracking is the stable alternative.
- **Test gap:** No automated test suite currently. vitest is added as part of Phase 1 (WXP foundation).

## Constraints

- **Compatibility:** All `.planning/` data format compatibility with original GSD v1.30.0 is a hard constraint — no breaking changes to the state/roadmap/requirements/phase structure
- **Security:** No piped input to shell commands. WXP tags only processed in trusted paths (package harness + project harness). `.planning/` files NEVER processed (LLM can write there). Allowlist is additive only.
- **Crash semantics:** WXP failure = total crash, no partial injection, no LLM fallback — all or nothing
- **Tech stack:** TypeScript, Node ≥18, tsup bundler, zod (already a dependency), vitest (new), oclif (new). No new runtime deps beyond these without explicit decision.
- **CLI interface:** oclif migration IS a breaking change on the CLI interface — acceptable since `pi-gsd-tools` is consumed by workflow XML (internal), not directly by end users
- **`<gsd-include>` continuity:** Existing `<gsd-include>` selectors and behavior must be preserved unchanged during WXP introduction

## Key Decisions

| Decision                                                     | Rationale                                                                                                                                                                               | Outcome   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| WXP runs in pi `context` event, after `<gsd-include>`        | Preprocessing before LLM sees messages; no new hook points needed                                                                                                                       | - Pending |
| Total-crash failure mode (no partial injection)              | Partial injection could mislead the LLM with half-computed data; better to block the call                                                                                               | - Pending |
| `.planning/` files are never WXP-processed                   | LLM writes there; processing those files = arbitrary code execution via prompt injection                                                                                                | - Pending |
| Shell allowlist is additive (can add, never remove defaults) | Prevents user config from expanding attack surface beyond known tools                                                                                                                   | - Pending |
| oclif replaces commander.js (breaking CLI change)            | commander.js has loose typing and manual arg parsing; oclif provides typed flags/args via decorators; `pi-gsd-tools` is consumed internally by workflow XML, so API break is acceptable | - Pending |
| Harness: copy-on-first-run, never overwrite existing         | Stable across worktrees; user-customisable; version-aware update prompts for deliberate upgrades                                                                                        | - Pending |
| `execute-phase.md` as WXP pilot workflow                     | Highest-value workflow (runs on every phase); validates the full pipeline end-to-end before converting others                                                                           | - Pending |
| XSD 1.1 + Zod dual validation                                | XSD for IDE support and documentation; Zod for runtime type safety and TypeScript inference                                                                                             | - Pending |
| vitest for all WXP tests                                     | Lightweight, TypeScript-native, no separate config needed; consistent with existing tsup build                                                                                          | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after initialization*
