# pi-gsd

> **Unofficial port of [Get Shit Done](https://github.com/gsd-build/get-shit-done) v1.30.0 for [pi](https://github.com/mariozechner/pi-coding-agent)**

[![npm version](https://img.shields.io/npm/v/pi-gsd.svg)](https://www.npmjs.com/package/pi-gsd)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![skills: 57](https://img.shields.io/badge/skills-57-orange.svg)](#skills)

GSD is a structured software-delivery framework for AI coding agents. It wraps any AI coding session with a six-step phase lifecycle, 57 slash commands, 18 specialized subagents, background hooks, and model profiles - all backed by a git-committed `.planning/` directory that survives context resets.

This package installs GSD into your project for pi (and optionally Claude Code, Gemini CLI, Cursor, Windsurf, OpenCode, Codex, and GitHub Copilot) automatically on `npm install`.

---

## Install

**Via pi (recommended):**

```sh
pi install npm:pi-gsd
```

**Via npm (global, for multi-harness projects):**

```sh
npm install -g pi-gsd
```

After install, run your first GSD command:

```
/gsd-new-project
```

---

## What You Get

| Artifact   | Count | Description                                                       |
| ---------- | ----: | ----------------------------------------------------------------- |
| Skills     |    57 | pi skill definitions (`/gsd-*`) loaded automatically              |
| CLI binary |     1 | `pi-gsd-tools` - state management, scaffolding, model routing     |
| Hooks      |     5 | Background hooks (context monitor, workflow guard, statusline, …) |

---

## The GSD Workflow

```
/gsd-new-project
  └─► /gsd-discuss-phase <N>
        └─► /gsd-plan-phase <N>
              └─► /gsd-execute-phase <N>
                    └─► /gsd-verify-work <N>
                          └─► /gsd-validate-phase <N>
                                └─► (next phase or /gsd-complete-milestone)
```

All project state lives in `.planning/` - committed to git, survives `/clear` and context resets.

---

## Skills

All 57 GSD commands are available as pi skills the moment you install the package:

```
/gsd-new-project          /gsd-new-milestone        /gsd-discuss-phase <N>
/gsd-plan-phase <N>       /gsd-execute-phase <N>    /gsd-verify-work <N>
/gsd-validate-phase <N>   /gsd-next                 /gsd-progress
/gsd-autonomous           /gsd-quick <task>          /gsd-fast <task>
/gsd-do <text>            /gsd-debug                /gsd-health
/gsd-stats                /gsd-help                 …and 40 more
```

Run `/gsd-help` for the full list with descriptions.

---

## CLI: `pi-gsd-tools`

The `pi-gsd-tools` binary is the runtime backbone called by GSD workflow files. It manages all `.planning/` state. You rarely need to call it directly, but it's available:

```sh
pi-gsd-tools state json                        # dump current STATE.md as JSON
pi-gsd-tools state update <field> <value>      # update a state field
pi-gsd-tools find-phase <N>                    # locate a phase directory
pi-gsd-tools roadmap analyze                   # analyse ROADMAP.md structure
pi-gsd-tools validate health --repair          # check and auto-repair .planning/
pi-gsd-tools stats json                        # project statistics
pi-gsd-tools progress json                     # progress summary
pi-gsd-tools commit "message" --files a b c    # commit with GSD tracking

# Output formatting (pi-native)
pi-gsd-tools state json --output toon          # pretty-print with toon renderer
pi-gsd-tools state json --pick phase           # extract a single field
```

Run `pi-gsd-tools --help` for the full command reference.

---

## Model Profiles

GSD routes subagents to different models based on your active profile:

| Profile    | Description                                           |
| ---------- | ----------------------------------------------------- |
| `quality`  | Maximum reasoning - Opus/Pro for all decision agents  |
| `balanced` | Default - Sonnet/Flash tier, good cost/quality ratio  |
| `budget`   | Cheapest available model per agent                    |
| `inherit`  | Use the session's currently selected model everywhere |

Switch profile: `/gsd-set-profile <profile>`

---

## Comparison with GSD v1.30.0

|                              Feature | gsd v1.30 | pi-gsd | Details                                                                                          |
| -----------------------------------: | :-------: | :----: | :----------------------------------------------------------------------------------------------- |
|             `.planning/` data format |     ✔️     |   ✔️    | 100% compatible - projects are portable across tools                                             |
|                          Workstreams |     ✔️     |   ✔️    | Full workstream isolation                                                                        |
|                     4 model profiles |     ✔️     |   ✔️    | quality / balanced / budget / inherit                                                            |
|                         18 subagents |     ✔️     |   ✔️    | Identical agent definitions                                                                      |
|                        57 GSD skills |     ✔️     |   ✔️    | All commands available via pi prompt dispatcher (replaces skill system)                          |
|        Different skills paths for pi |     ✔️     |   ⚡    | All 57 skills moved to `.pi/gsd/` to enable advanced pi-gsd-tools integration                    |
|                  pi harness (`.pi/`) |     ❌     |   ✔️    | New - GSD installs into pi's config dir                                                          |
|                Background hooks (pi) |     ❌     |   ✔️    | TypeScript extension (`gsd-hooks.ts`) installed via postinstall                                  |
|         Pi session history ingestion |     ❌     |   ✔️    | `/gsd-profile-user` reads pi JSONL sessions from `~/.pi/agent/sessions/`                         |
|           `/gsd-setup-pi` onboarding |     ❌     |   ✔️    | Setup skill for `bun install` where postinstall is skipped   (default untrusted behavior)        |
|     `gsd-tools` → `pi-gsd-tools` CLI |     ✔️     |   ⚡    | Same commands basic signatures as original (`gsd-tools`) but enhanced                            |
| `[-o\|--output] [toon\|json]` output |     ❌     |   ⚡    | Token-efficient toon renderer output (or json, if LLM absolutely needs it...)                    |
| `[-p\|--pick] {JSONPath}` extraction |     ❌     |   ⚡    | Field extraction from CLI output                                                                 |
|                    TypeScript source |     ❌     |   ⚡    | Full TS port of gsd-tools (~9k lines)                                                            |
|             Compile-time type safety |     ❌     |   ✔️    | Full TypeScript — only `FrontmatterObject` root type retains `any` (intentional, documented)      |
|             Runtime validation (Zod) |     ❌     |   ✔️    | Zod schemas for all `.planning/` types; `validate health` checks `config.json` (W005) + `STATE.md` (W011) |
|                   Smarter `--repair` |     ❌     |   ✔️    | Schema defaults fill missing `config.json` fields; W011 STATE.md issues trigger regeneration     |
|       Instant commands (no LLM cost) |     ❌     |   ✔️    | `/gsd-progress`, `/gsd-stats`, `/gsd-health`, `/gsd-help`, `/gsd-next` — zero LLM, editor pivot  |
|             `/gsd-next` auto-advance |     ❌     |   ✔️    | Deterministic phase routing, pre-fills editor with the correct next command                      |
|       Prompt-dispatch for all skills |     ❌     |   ✔️    | 54 pi prompt templates — clean autocomplete, arg hints, direct workflow dispatch                 |
|        `/gsd-plan-milestone` command |     ❌     |   ✔️    | Plan all phases at once — one mode question, scope pre-check, context-safe checkpointing        |
|     `/gsd-execute-milestone` command |     ❌     |   ✔️    | Execute all phases with scope guardian, UAT gates, recovery loop, worktree isolation            |
|    `/gsd-milestone` instant command |     ❌     |   ✔️    | Milestone dashboard — plan vs execute routing, pre-fills editor with correct next command       |

Legend: ✔️ done · ⚡ enhanced · ⚠️ in progress · 📃 planned · ❌ not available

---

## Data Format Compatibility

This package is a **faithful port** of GSD v1.30.0. The `.planning/` directory layout, all file formats (`STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `PLAN.md`, `SUMMARY.md`, `UAT.md`), frontmatter schemas, and `pi-gsd-tools` command signatures are **byte-compatible** with the original `get-shit-done-cc` package.

Projects started with the original GSD work without migration.

---

## Development

```sh
# Type-check
npm run typecheck

# Build CLI (TypeScript → dist/pi-gsd-tools.js)
npm run build

# Validate integrity
node scripts/validate-model-profiles.cjs
```

---

## License

MIT - this is an unofficial port. Original GSD by [Get Shit Done](https://github.com/gsd-build/get-shit-done).
