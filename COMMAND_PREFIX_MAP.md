# GSD Command Prefix Cross-Reference Map

> **Generated:** 2026-04-03  
> **Scope:** All 8 harness installs under `/home/fulgidus/Documents/pi-gsd/`  
> **Audited files:** `*/get-shit-done/bin/lib/commands.cjs`, `*/get-shit-done/bin/lib/init.cjs`

---

## Summary

GSD commands are invoked via slash-command syntax. The **canonical prefix** for all user-facing
commands across every harness is:

```
/gsd-<command-name>
```

The `gsd:` colon-separated variant (e.g. `/gsd:discuss-phase`) is a **Claude Code / Gemini CLI
internal-workflow shorthand** used only within workflow `.md` files and Skill invocations - it is
**not** a runtime command prefix emitted by the binary tools. It must never appear in generated
scaffold files (CONTEXT.md, etc.) or binary error messages, because those artifacts are read by
all harnesses including ones (e.g. Codex, `.agent`) that do not recognise the colon form.

---

## Prefix Semantics by Harness

| Harness         | Config Dir   | Slash-command prefix | Workflow internal refs                 | Hook support                  |
| --------------- | ------------ | -------------------- | -------------------------------------- | ----------------------------- |
| Claude Code     | `.claude/`   | `/gsd-<cmd>`         | `/gsd:<cmd>` (in `.md` workflows only) | ✅ Full (4 hooks + statusline) |
| Gemini CLI      | `.gemini/`   | `/gsd-<cmd>`         | `/gsd:<cmd>` (in `.md` workflows only) | ✅ Full (AfterTool/BeforeTool) |
| OpenCode        | `.opencode/` | `/gsd-<cmd>`         | `gsd:<cmd>` (in Skill() calls only)    | ✅ Hooks + opencode.json       |
| Codex           | `.codex/`    | `/gsd-<cmd>`         | `gsd:<cmd>` (in Skill() calls only)    | ✅ SessionStart only           |
| Agent (generic) | `.agent/`    | `/gsd-<cmd>`         | `/gsd-<cmd>`                           | ✅ Hooks                       |
| Cursor          | `.cursor/`   | `/gsd-<cmd>`         | `/gsd-<cmd>`                           | ❌ None                        |
| Windsurf        | `.windsurf/` | `/gsd-<cmd>`         | `/gsd-<cmd>`                           | ❌ None                        |
| GitHub Copilot  | `.github/`   | `/gsd-<cmd>`         | `/gsd-<cmd>`                           | ❌ None                        |

**Key distinction:** the `/gsd:<cmd>` colon form in Claude/Gemini workflow files is an
internal harness mechanism (Claude's `SlashCommand()`/Gemini's command dispatch) and is
intentionally distinct from the binary-tool-emitted `/gsd-<cmd>` dash form. However, any
**generated artefact** (CONTEXT.md scaffold content, error messages written to stdout/stderr by
`gsd-tools.cjs`) must use the **dash form** so that cross-harness readers interpret it correctly.

---

## Divergence Found and Fixed (2026-04-03)

The following files contained `/gsd:<cmd>` colon-form strings in positions where they would be
**written into generated files or emitted as user-visible error messages** - causing confusion for
agents in `.agent`/Codex/Cursor/Windsurf harnesses that expect only the dash form.

### Fixed: `.claude/get-shit-done/bin/lib/commands.cjs` - line 744

`cmdScaffold()` - `case 'context'` template string written into `*-CONTEXT.md` files:

```diff
- _Decisions will be captured during /gsd:discuss-phase ${phase}_
+ _Decisions will be captured during /gsd-discuss-phase ${phase}_
```

### Fixed: `.claude/get-shit-done/bin/lib/init.cjs` - lines 824–827

`cmdInitManager()` - prerequisite-check error messages:

```diff
- error('No ROADMAP.md found. Run /gsd:new-milestone first.');
+ error('No ROADMAP.md found. Run /gsd-new-milestone first.');
- error('No STATE.md found. Run /gsd:new-milestone first.');
+ error('No STATE.md found. Run /gsd-new-milestone first.');
```

### Already correct (no changes needed)

| File                                                                       | Status                |
| -------------------------------------------------------------------------- | --------------------- |
| `.gemini/get-shit-done/bin/lib/commands.cjs` line 744                      | ✅ Was already `gsd-`  |
| `.gemini/get-shit-done/bin/lib/init.cjs` lines 824–827                     | ✅ Was already `gsd-`  |
| `.agent/get-shit-done/bin/lib/commands.cjs`                                | ✅ Clean (`gsd-` only) |
| `.agent/get-shit-done/bin/lib/init.cjs`                                    | ✅ Clean (`gsd-` only) |
| `.codex/`, `.cursor/`, `.github/`, `.opencode/`, `.windsurf/` - both files | ✅ All clean           |
| `.gsd/bin/*/lib/commands.cjs` + `init.cjs` (canonical copies)              | ✅ All clean           |

---

## Legitimate Use of `/gsd:<cmd>` (Do NOT change these)

The following occurrences of the colon form are **intentional** and must not be altered.
They live exclusively inside harness-specific workflow markdown files where the harness
itself interprets the colon syntax as an internal slash-command dispatcher:

| File                                              | Purpose                               |
| ------------------------------------------------- | ------------------------------------- |
| `.claude/get-shit-done/workflows/transition.md`   | Claude SlashCommand() invocations     |
| `.claude/get-shit-done/workflows/pause-work.md`   | Claude handoff instructions           |
| `.gemini/get-shit-done/workflows/transition.md`   | Gemini slash dispatch                 |
| `.gemini/get-shit-done/workflows/pause-work.md`   | Gemini handoff instructions           |
| `.codex/get-shit-done/workflows/autonomous.md`    | Codex `Skill(skill="gsd:…")` calls    |
| `.codex/get-shit-done/workflows/do.md`            | Codex template reference              |
| `.codex/get-shit-done/workflows/next.md`          | Codex template reference              |
| `.opencode/get-shit-done/workflows/autonomous.md` | OpenCode `Skill(skill="gsd:…")` calls |

---

## Complete Command Inventory

All 60+ commands use the `/gsd-<name>` dash prefix. Key commands by workflow stage:

### Project Setup
| Command              | Workflow file      |
| -------------------- | ------------------ |
| `/gsd-new-project`   | `new-project.md`   |
| `/gsd-new-milestone` | `new-milestone.md` |
| `/gsd-map-codebase`  | `map-codebase.md`  |
| `/gsd-settings`      | `settings.md`      |

### Phase Lifecycle
| Command                   | Workflow file       |
| ------------------------- | ------------------- |
| `/gsd-discuss-phase <N>`  | `discuss-phase.md`  |
| `/gsd-research-phase <N>` | `research-phase.md` |
| `/gsd-plan-phase <N>`     | `plan-phase.md`     |
| `/gsd-execute-phase <N>`  | `execute-phase.md`  |
| `/gsd-verify-work <N>`    | `verify-work.md`    |
| `/gsd-validate-phase <N>` | `validate-phase.md` |

### Navigation & Status
| Command            | Workflow file    |
| ------------------ | ---------------- |
| `/gsd-manager`     | `manager.md`     |
| `/gsd-progress`    | `progress.md`    |
| `/gsd-stats`       | `stats.md`       |
| `/gsd-next`        | `next.md`        |
| `/gsd-resume-work` | `resume-work.md` |
| `/gsd-pause-work`  | `pause-work.md`  |

### Utilities
| Command            | Workflow file    |
| ------------------ | ---------------- |
| `/gsd-todo-add`    | (inline)         |
| `/gsd-check-todos` | `check-todos.md` |
| `/gsd-quick`       | `quick.md`       |
| `/gsd-do`          | `do.md`          |
| `/gsd-review`      | `review.md`      |
| `/gsd-autonomous`  | `autonomous.md`  |
| `/gsd-help`        | `help.md`        |
| `/gsd-update`      | `update.md`      |

---

## Rule for Future Maintenance

> **Any string written to disk by `gsd-tools.cjs`** (scaffold templates, error messages, state
> files, HANDOFF.json, etc.) **must use `/gsd-<cmd>`** - never `/gsd:<cmd>`.
>
> The `/gsd:<cmd>` colon form may only appear inside harness-specific workflow `.md` files
> where the host harness (Claude Code, Gemini CLI) performs its own slash-command dispatch.
>
> This rule applies to all files under `*/get-shit-done/bin/lib/` in all 8 harness directories.
