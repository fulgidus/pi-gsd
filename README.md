# pi-gsd

> **Unofficial port of [Get Shit Done](https://github.com/gsd-build/get-shit-done) v1.30.0 for [pi](https://github.com/mariozechner/pi-coding-agent)**

[![npm version](https://img.shields.io/npm/v/pi-gsd.svg)](https://www.npmjs.com/package/pi-gsd)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![skills: 57](https://img.shields.io/badge/skills-57-orange.svg)](#skills)

GSD is a structured software-delivery framework for AI coding agents. It wraps any AI coding session with a six-step phase lifecycle, 57 slash commands, 18 specialized subagents, background hooks, and model profiles — all backed by a git-committed `.planning/` directory that survives context resets.

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
| CLI binary |     1 | `gsd-tools` — state management, scaffolding, model routing        |
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

All project state lives in `.planning/` — committed to git, survives `/clear` and context resets.

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

## CLI: `gsd-tools`

The `gsd-tools` binary is the runtime backbone called by GSD workflow files. It manages all `.planning/` state. You rarely need to call it directly, but it's available:

```sh
gsd-tools state json                        # dump current STATE.md as JSON
gsd-tools state update <field> <value>      # update a state field
gsd-tools find-phase <N>                    # locate a phase directory
gsd-tools roadmap analyze                   # analyse ROADMAP.md structure
gsd-tools validate health --repair          # check and auto-repair .planning/
gsd-tools stats json                        # project statistics
gsd-tools progress json                     # progress summary
gsd-tools commit "message" --files a b c    # commit with GSD tracking

# Output formatting (pi-native)
gsd-tools state json --output toon          # pretty-print with toon renderer
gsd-tools state json --pick phase           # extract a single field
```

Run `gsd-tools --help` for the full command reference.

---

## Model Profiles

GSD routes subagents to different models based on your active profile:

| Profile    | Description                                           |
| ---------- | ----------------------------------------------------- |
| `quality`  | Maximum reasoning — Opus/Pro for all decision agents  |
| `balanced` | Default — Sonnet/Flash tier, good cost/quality ratio  |
| `budget`   | Cheapest available model per agent                    |
| `inherit`  | Use the session's currently selected model everywhere |

Switch profile: `/gsd-set-profile <profile>`

---

## Comparison with GSD v1.30.0

| Feature | gsd v1.30 | pi-gsd | Details |
| ---: | :---: | :---: | :--- |
| `.planning/` data format | ✔️ | ✔️ | 100% compatible — projects are portable across tools |
| `gsd-tools` CLI | ✔️ | ✔️ | Full TypeScript port, same command signatures |
| 57 GSD skills | ✔️ | ✔️ | All commands available via pi skill system |
| 18 subagents | ✔️ | ✔️ | Identical agent definitions |
| 4 model profiles | ✔️ | ✔️ | quality / balanced / budget / inherit |
| Workstreams | ✔️ | ✔️ | Full workstream isolation |
| Multi-harness install | ✔️ | ✔️ | 8 harnesses via postinstall |
| pi harness (`.pi/`) | ❌ | ✔️ | New — GSD installs into pi's config dir |
| Background hooks (Claude/Gemini) | ✔️ | ✔️ | All 5 hooks, hardlinked |
| Background hooks (pi) | ❌ | ✔️ | TypeScript extension (`gsd-hooks.ts`) installed via postinstall |
| Correct skill paths for pi | ✔️ | ✔️ | All 57 skills use `.pi/get-shit-done/` paths |
| Pi harness config entry | ❌ | ✔️ | `HARNESS_CONFIG` pi entry — generates `AGENTS.md` via `/gsd-profile-user` |
| `-o toon` output | ❌ | ✔️ | Token-efficient toon renderer output |
| `--pick` JSONPath extraction | ❌ | ✔️ | Field extraction from CLI output |
| TypeScript source | ❌ | ✔️ | Full TS port of gsd-tools (9 k lines) |
| Compile-time type safety | ❌ | ✔️ | Fully typed — `Record<string, any>` replaced with Zod-inferred types |
| Runtime validation (Zod) | ❌ | ✔️ | Schema-driven `validate health` with field-path errors |
| Smarter `--repair` | ❌ | ✔️ | Zod schema defaults fill all missing / invalid fields at once |
| Toon output in skills | ❌ | ✔️ | `gsd-progress`, `gsd-stats`, `gsd-health` use `--output toon` |
| Pi session history ingestion | ❌ | ✔️ | `/gsd-profile-user` reads pi JSONL sessions from `~/.pi/agent/sessions/` |
| `/gsd-setup-pi` onboarding | ❌ | ✔️ | Setup skill for bun installs where postinstall is skipped |

---

## Data Format Compatibility

This package is a **faithful port** of GSD v1.30.0. The `.planning/` directory layout, all file formats (`STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `PLAN.md`, `SUMMARY.md`, `UAT.md`), frontmatter schemas, and `gsd-tools` command signatures are **byte-compatible** with the original `get-shit-done-cc` package.

Projects started with the original GSD work without migration.

---

## Development

```sh
# Type-check
npm run typecheck

# Build CLI (TypeScript → dist/gsd-tools.js)
npm run build

# Validate integrity
node scripts/validate-model-profiles.cjs
```

---

## License

MIT — this is an unofficial port. Original GSD by [Get Shit Done](https://github.com/gsd-build/get-shit-done).
