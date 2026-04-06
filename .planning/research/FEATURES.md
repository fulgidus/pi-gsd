# Features Research: pi-gsd WXP Milestone

**Research date:** 2026-04-06
**Milestone:** v1.0 — WXP + oclif + type cleanup + harness distribution

## Existing Features (already built — do not duplicate)

- `<gsd-include>` tag resolution (selectors: tag/heading/lines, chains)
- All 57 slash-command skills, per-harness distribution, background hooks
- `.planning/` state management (roadmap, phase, milestone, config commands)

---

## Feature Categories for This Milestone

### 1. WXP Preprocessing Engine

**Table stakes** (must have or the entire milestone goal fails):

| Feature | Description | Complexity |
|---|---|---|
| Code-fence skip | Skip WXP processing inside ` ``` ` blocks | Medium |
| `<gsd-arguments>` parsing | Two-pass: flags first, then positional | High |
| `<shell>` execution | Allowlisted, timeout, no pipes, stdout capture | High |
| `<if>/<equals>/<starts-with>` | Conditional execution | Medium |
| `<string-op op="split">` | Split variable by delimiter | Low |
| `<gsd-paste>` injection | Replace tag with variable value | Low |
| Variable namespace | Typed store, collision detection, owner prefix | Medium |
| Resolution loop | Iterative until no unprocessed tags, done markers | High |
| Total-crash failure | All-or-nothing, state dump notification | Medium |
| Security module | Trusted-path check, shell allowlist enforcement | High |

**Differentiators** (what makes this good vs just functional):

| Feature | Description | Complexity |
|---|---|---|
| XSD 1.1 schema | IDE auto-complete + validation in VSCode for WXP XML | Medium |
| Zod-inferred types | Zero `any` in WXP engine from day one | Low |
| Full state dump on error | Variable namespace + completed/pending blocks in error | Medium |
| `<gsd-include>` children syntax | `<gsd-include path="..."><gsd-arguments>` for composable workflows | High |
| Variable collision prefixing | Automatic disambiguation, no silent overwrites | Medium |
| `pi-gsd-settings.json` schema | Published JSON schema for IDE validation of security config | Low |

**Anti-features** (things that look good but cause problems — exclude from v1):

| Feature | Why not |
|---|---|
| `<for-each>`, `<map>`, `<reduce>` | Turns WXP into a programming language; LLM can't debug WXP scripts |
| `<regex>` string-op | Regex in XML attributes is unreadable; too much power for a preprocessor |
| Remote URL `<gsd-include>` | Security surface; network dependency in context events |
| Async/parallel `<shell>` | Complicates resolution loop; variable ordering becomes non-deterministic |
| WXP GUI/debugger | Notification-based error dumps are sufficient for v1 |
| `<gsd-paste>` with expressions | `name="init.file"` dot-path access → complexity explosion |

---

### 2. CLI Migration (oclif)

**Table stakes:**

| Feature | Description |
|---|---|
| All existing commands typed | Every `pi-gsd-tools <cmd>` maps to a typed oclif class |
| Typed flags + args | No `Record<string, any>`, no manual `parseNamedArgs()` |
| Built-in `--help` | Auto-generated from class metadata |
| `wxp` subcommand group | CLI entry point for direct WXP operations |
| Subcommand grouping | `state json`, `state update`, `phase add`, `phase complete`, etc. |

**Differentiators:**

| Feature | Description |
|---|---|
| Plugin architecture | Foundation for future extensibility (v2+) |
| Typed exit codes | Consistent exit behavior; testable in CI |

---

### 3. Workflow File Conversion

**Table stakes:**

| Feature | Description |
|---|---|
| `execute-phase.md` pilot | Highest-value workflow, validates full pipeline |
| Backup before conversion | `cp <name>.md <name>.md.bak` before each file |
| All high-traffic workflows | plan-phase, discuss-phase, new-project, new-milestone |
| All remaining workflows | Incremental conversion, versioned |
| GSD version tag | `<gsd-version v="X.Y.Z" />` in all converted files |
| `do-not-update` flag | `<gsd-version v="X.Y.Z" do-not-update />` for user-customized files |

---

### 4. Type Cleanup

**Table stakes:**

| Location | Problem | Fix |
|---|---|---|
| `src/lib/frontmatter.ts` | `FrontmatterObject = Record<string, any>` | Recursive YAML value type |
| `src/lib/frontmatter.ts` | 6× `eslint-disable no-explicit-any` | Remove after type fix |
| `src/lib/config.ts` | 5× `eslint-disable no-explicit-any` | Proper config types |
| `src/lib/state.ts` | 1× `eslint-disable no-explicit-any` | Typed state |
| `src/output.ts` | `type AnyValue = any` | Use `unknown` + type guards |
| CI lint rule | `no-explicit-any: error` in eslint | Zero exceptions |

---

### 5. Harness Distribution

**Table stakes:**

| Feature | Description |
|---|---|
| Copy-on-first-run | On `session_start`, copy missing files to `<project>/.pi/gsd/` |
| Never overwrite existing | Only copy if file doesn't exist |
| Version comparison | `<gsd-version>` tag check; prompt if project file is older |
| Update options | `y / n / pick / diff` |
| Remove symlink code | Delete `ensureHarnessSymlink()` and all symlink-related paths |
| `pi-gsd-settings.json` | Security config file per-project |

**Differentiators:**

| Feature | Description |
|---|---|
| `pick` update mode | User selects specific files to update; unchanged files preserved with diff |
| `diff` update mode | Creates diff file at project root for manual review |
| `do-not-update` flag | Harness files can opt out of auto-updates |

---

## Patterns from Reference Systems

**Resolution loop → learned from Jinja2/Nunjucks:**
- Jinja2 uses a two-phase approach: parse template into AST, then render. WXP's loop is render-time, not parse-time. The key lesson: mark processed nodes to prevent double-execution, not double-parsing.

**Error handling → learned from Ansible:**
- Ansible's `any_errors_fatal: true` pattern: one task failure blocks all subsequent tasks. WXP mirrors this: one `<shell>` failure aborts the entire preprocessing pipeline. No "continue on error" in v1.

**Allowlist pattern → learned from Ansible's `command` module:**
- Ansible explicitly blocks shell metacharacters when using `command` (vs `shell`). WXP's `<shell>` uses `execFileSync` (not `execSync`) — arguments are passed as an array, preventing shell injection.

**Harness distribution → learned from VS Code extension host:**
- VS Code copies extension files to `~/.vscode/extensions/` on install, never symlinks. Update on version bump with user prompt. WXP mirrors this at the project level.
