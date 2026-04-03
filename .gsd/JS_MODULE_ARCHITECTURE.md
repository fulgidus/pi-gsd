# GSD Tools - JavaScript Module Architecture

> **Generated:** 2026-04-03  
> **Source tree:** `.gsd/bin/<harness>/` (18 files per harness, identical logic)  
> **Reference harness used for this document:** `.gsd/bin/github/`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Dependency Graph](#2-module-dependency-graph)
3. [Per-Module Breakdowns](#3-per-module-breakdowns)
4. [Key Data Flows](#4-key-data-flows)
5. [File System Layout](#5-file-system-layout)
6. [Configuration Schema](#6-configuration-schema)
7. [Frontmatter Schemas](#7-frontmatter-schemas)
8. [Model Profiles](#8-model-profiles)

---

## 1. Overview

`gsd-tools.cjs` is the single CLI entry point for the **Get Shit Done** planning toolkit. It is a Node.js CommonJS module (~974 lines) that parses global flags, resolves the project root, optionally scopes to a workstream, and dispatches to one of 17 library modules via a `switch(command)` statement.

### Invocation signature

```
node gsd-tools.cjs <command> [args…] [--raw] [--pick <dotpath>] [--cwd=<path>] [--ws=<name>]
```

### Global flags (resolved before `runCommand()`)

| Flag               | Effect                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| `--cwd=<path>`     | Override the project root directory                                                   |
| `--ws=<name>`      | Activate a named workstream (scopes `.planning/` paths)                               |
| `--raw`            | Emit raw string instead of a JSON envelope                                            |
| `--pick <dotpath>` | Extract a single field from JSON output (e.g. `phase_number`, `config.model_profile`) |

### Workstream resolution order

1. `--ws` flag
2. `GSD_WORKSTREAM` environment variable
3. `.planning/active-workstream` file contents
4. `null` (flat / single-workstream mode)

### `SKIP_ROOT_RESOLUTION` set

Commands listed here skip `findProjectRoot()` and accept any working directory:

```
generate-slug  current-timestamp  verify-path-exists  verify-summary
template  frontmatter  generate-model-profiles-md
```

### Output protocol

All commands call `core.output(data, raw)`. For JSON payloads > 50 KB the data is written to `/tmp/gsd-<timestamp>.json` and the string `@file:/tmp/gsd-<timestamp>.json` is returned to stdout so callers can stream large payloads without pipe-buffer limits.

---

## 2. Module Dependency Graph

```
gsd-tools.cjs  (entry point + CLI router)
│
├── model-profiles.cjs   ← no external deps (pure data)
├── security.cjs         ← no external deps (pure utilities)
│
├── core.cjs             ← requires: model-profiles.cjs
│   │
│   ├── frontmatter.cjs  ← requires: core.cjs
│   │
│   ├── state.cjs        ← requires: core.cjs, frontmatter.cjs, security.cjs
│   │
│   ├── phase.cjs        ← requires: core.cjs, frontmatter.cjs, state.cjs
│   │
│   ├── roadmap.cjs      ← requires: core.cjs
│   │
│   ├── milestone.cjs    ← requires: core.cjs, frontmatter.cjs, state.cjs
│   │
│   ├── verify.cjs       ← requires: core.cjs, frontmatter.cjs, state.cjs, model-profiles.cjs
│   │
│   ├── config.cjs       ← requires: core.cjs, model-profiles.cjs
│   │
│   ├── template.cjs     ← requires: core.cjs, frontmatter.cjs
│   │
│   ├── commands.cjs     ← requires: core.cjs, frontmatter.cjs, model-profiles.cjs, security.cjs
│   │
│   ├── init.cjs         ← requires: core.cjs  (security.cjs loaded lazily inside)
│   │
│   ├── workstream.cjs   ← requires: core.cjs, state.cjs
│   │
│   ├── uat.cjs          ← requires: core.cjs, frontmatter.cjs, security.cjs  [lazy-loaded]
│   │
│   ├── profile-pipeline.cjs ← requires: core.cjs
│   └── profile-output.cjs   ← requires: core.cjs
```

> **Lazy loads:** `uat.cjs` and `security.cjs` (in some paths) are `require()`-d inside `runCommand()` on demand rather than at module load time.

### Dependency matrix (✓ = direct import)

| Consumer ↓ \ Provider → | model-profiles | security | core  | frontmatter | state | phase | roadmap | milestone | verify | config | commands | init  |
| ----------------------- | :------------: | :------: | :---: | :---------: | :---: | :---: | :-----: | :-------: | :----: | :----: | :------: | :---: |
| core.cjs                |       ✓        |          |       |             |       |       |         |           |        |        |          |       |
| frontmatter.cjs         |                |          |   ✓   |             |       |       |         |           |        |        |          |       |
| state.cjs               |                |    ✓     |   ✓   |      ✓      |       |       |         |           |        |        |          |       |
| phase.cjs               |                |          |   ✓   |      ✓      |   ✓   |       |         |           |        |        |          |       |
| roadmap.cjs             |                |          |   ✓   |             |       |       |         |           |        |        |          |       |
| milestone.cjs           |                |          |   ✓   |      ✓      |   ✓   |       |         |           |        |        |          |       |
| verify.cjs              |       ✓        |          |   ✓   |      ✓      |   ✓   |       |         |           |        |        |          |       |
| config.cjs              |       ✓        |          |   ✓   |             |       |       |         |           |        |        |          |       |
| template.cjs            |                |          |   ✓   |      ✓      |       |       |         |           |        |        |          |       |
| commands.cjs            |       ✓        |    ✓     |   ✓   |      ✓      |       |       |         |           |        |        |          |       |
| init.cjs                |                |  (lazy)  |   ✓   |             |       |       |         |           |        |        |          |       |
| workstream.cjs          |                |          |   ✓   |             |   ✓   |       |         |           |        |        |          |       |
| uat.cjs                 |                |    ✓     |   ✓   |      ✓      |       |       |         |           |        |        |          |       |
| profile-pipeline.cjs    |                |          |   ✓   |             |       |       |         |           |        |        |          |       |
| profile-output.cjs      |                |          |   ✓   |             |       |       |         |           |        |        |          |       |

---

## 3. Per-Module Breakdowns

### 3.1 `gsd-tools.cjs` - CLI entry point

**Responsibilities:** argument parsing, flag resolution, root detection, workstream scoping, command dispatch.

**Key internal functions:**

| Function                          | Lines | Purpose                                        |
| --------------------------------- | ----- | ---------------------------------------------- |
| `main()`                          | ~181  | Top-level async entry; resolves flags in order |
| `runCommand(cmd, args, cwd, raw)` | ~358  | `switch(command)` dispatch to all lib exports  |

**Dispatch table** (selected commands - full list in source):

```
phase       → phase.cmdPhaseAdd / cmdPhaseComplete / cmdPhasesList …
state       → state.cmdStateLoad / cmdStateBeginPhase / cmdStateAdvancePlan …
validate    → verify.cmdValidateHealth / cmdValidateConsistency …
init        → init.cmdInitExecutePhase / cmdInitPlanPhase / cmdInitNewProject …
config      → config.cmdConfigGet / cmdConfigSet / cmdConfigNewProject …
scaffold    → commands.cmdScaffold
progress    → commands.cmdProgressRender
milestone   → milestone.cmdMilestoneComplete / cmdRequirementsMarkComplete
roadmap     → roadmap.cmdRoadmapAnalyze / cmdRoadmapGetPhase …
workstream  → workstream.cmdWorkstreamCreate / cmdWorkstreamList …
frontmatter → frontmatter.cmdFrontmatterGet / cmdFrontmatterSet …
template    → template.cmdTemplateSelect / cmdTemplateFill
uat         → uat.cmdAuditUat / cmdRenderCheckpoint
profile     → profile-pipeline / profile-output commands
```

---

### 3.2 `core.cjs` - Foundation utilities

**Responsibilities:** path resolution, config loading, model resolution, markdown normalisation, file I/O helpers, output formatting, process locking.

**Exported functions (selected):**

| Function                               | Purpose                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `planningDir(cwd, ws)`                 | Returns `.planning/` or `.planning/workstreams/{ws}/`                                     |
| `planningPaths(cwd, ws)`               | Returns full path map: `planning, state, roadmap, project, config, phases, requirements`  |
| `planningRoot(cwd)`                    | Always returns root `.planning/` (never workstream-scoped)                                |
| `findProjectRoot(cwd)`                 | Walks ancestor dirs looking for `.planning/config.json`; stops at `$HOME`                 |
| `resolveWorktreeRoot(cwd)`             | Detects git worktree and returns main working tree root                                   |
| `loadConfig(cwd)`                      | Reads `config.json`, merges `~/.gsd/defaults.json`, applies defaults                      |
| `resolveModelInternal(cwd, agentType)` | Loads config internally then resolves agent → model alias using priority chain (see §4.7) |
| `output(data, raw)`                    | Writes JSON (or raw string) to stdout; >50 KB → temp file                                 |
| `normalizeMd(text)`                    | Enforces MD022/031/032/012/047 markdownlint rules                                         |
| `withPlanningLock(cwd, fn)`            | Acquires `.planning/.lock` for concurrent-worktree safety                                 |

**Config defaults** (applied by `loadConfig` when keys are absent):

```js
model_profile: 'balanced'
commit_docs: true
search_gitignored: false
branching_strategy: 'none'
phase_branch_template: 'gsd/phase-{phase}-{slug}'
milestone_branch_template: 'gsd/{milestone}-{slug}'
quick_branch_template: null
research: true
plan_checker: true
verifier: true
nyquist_validation: true
parallelization: true
brave_search: false
firecrawl: false
exa_search: false
text_mode: false
sub_repos: []
resolve_model_ids: false
context_window: 200000
phase_naming: 'sequential'
```

**Model alias map:**

```js
const MODEL_ALIAS_MAP = {
  'opus':   'claude-opus-4-6',
  'sonnet': 'claude-sonnet-4-6',
  'haiku':  'claude-haiku-4-5',
};
```

---

### 3.3 `model-profiles.cjs` - Model routing data

**Responsibilities:** Defines the `MODEL_PROFILES` table (agent → tier → alias) and the `HARNESS_CONFIG` map.

- No imports; pure data module.
- Exports: `MODEL_PROFILES`, `VALID_PROFILES`, `HARNESS_CONFIG`, `getHarnessConfig(name)`

**Valid profile tiers:** `quality | balanced | budget | inherit`

**HARNESS_CONFIG** - 8 supported runtimes:

| Key        | Intended runtime | Command prefix |
| ---------- | ---------------- | -------------- |
| `claude`   | Claude Code      | `/gsd:`        |
| `gemini`   | Gemini CLI       | `/gsd:`        |
| `cursor`   | Cursor           | `/gsd-`        |
| `windsurf` | Windsurf         | `/gsd-`        |
| `agent`    | Generic agent    | `/gsd-`        |
| `github`   | GitHub Copilot   | `/gsd-`        |
| `opencode` | OpenCode         | `/gsd-`        |
| `codex`    | OpenAI Codex     | `$gsd-`        |

Each harness entry also carries: `cmdPrefix`, `providerHeader`, `providerIntro`, `rationaleAlias`, `nonRuntimeHeading`, `nonRuntimeIntro`.

> **Source note - `runtimeName` field:** The *Intended runtime* column above describes each harness's conceptual identity. In the actual source (`model-profiles.cjs:48–112`) the `runtimeName` field is currently set to `'Claude'` for **all** eight entries, including `gemini`, `cursor`, `windsurf`, `opencode`, and `codex`. The `gemini` entry in particular also retains `cmdPrefix: '/gsd:'` and Anthropic-specific prose identical to the `claude` entry, indicating it is an incomplete stub. The `runtimeName` values will diverge from `'Claude'` once per-harness customisation is completed. Do not rely on `runtimeName` as a harness discriminator in code - use the harness **key** (`gemini`, `opencode`, etc.) instead.

---

### 3.4 `security.cjs` - Security utilities

**Responsibilities:** Input validation and sanitisation for all user-supplied values.

- No imports; pure Node.js stdlib.
- Exports: `validatePath`, `INJECTION_PATTERNS`, `sanitizeForPrompt`, `safeJsonParse`, `validatePhaseNumber`, `validateFieldName`

| Function                          | Behaviour                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `validatePath(baseDir, userPath)` | Resolves with `fs.realpathSync`; throws if outside `baseDir` (path-traversal prevention) |
| `sanitizeForPrompt(text)`         | Strips zero-width characters; neutralises `<system>`, `<assistant>`, `<human>` XML tags  |
| `safeJsonParse(text)`             | Parses JSON with 1 MB size guard; returns `{ ok, value, error }`                         |
| `validatePhaseNumber(n)`          | Asserts integer 1–999                                                                    |
| `validateFieldName(s)`            | Allows `[A-Za-z][A-Za-z0-9 _.\-/]{0,60}`                                                 |
| `INJECTION_PATTERNS`              | Array of 16 regex patterns for prompt-injection detection                                |

---

### 3.5 `frontmatter.cjs` - YAML frontmatter I/O

**Responsibilities:** Parse, validate, get, set, and merge YAML frontmatter blocks in `.md` files.

**Exported functions:**

| Function                                                 | Purpose                                            |
| -------------------------------------------------------- | -------------------------------------------------- |
| `cmdFrontmatterGet(cwd, filePath, field, raw)`           | Read a single frontmatter field                    |
| `cmdFrontmatterSet(cwd, filePath, field, value, raw)`    | Write a single frontmatter field                   |
| `cmdFrontmatterMerge(cwd, filePath, data, raw)`          | Deep-merge a JSON object into existing frontmatter |
| `cmdFrontmatterValidate(cwd, filePath, schemaName, raw)` | Validate required fields against a named schema    |
| `parseFrontmatter(text)`                                 | Internal: extract YAML block → JS object           |
| `serializeFrontmatter(obj, body)`                        | Internal: reserialise object back into `---` block |

**Schemas:** see §7.

---

### 3.6 `state.cjs` - STATE.md management

**Responsibilities:** All reads and writes to `STATE.md`; YAML frontmatter auto-sync; file locking; state field manipulation helpers.

**Exported functions:**

| Function                 | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `cmdStateLoad`           | Load config + STATE.md + existence flags             |
| `cmdStateGet`            | Return a single section from STATE.md                |
| `cmdStatePatch`          | Apply multiple key→value patches at once             |
| `cmdStateUpdate`         | Set a single field                                   |
| `cmdStateAdvancePlan`    | Increment Current Plan counter                       |
| `cmdStateBeginPhase`     | Set Phase, Phase Name, Plans count, Status=executing |
| `cmdStateUpdateProgress` | Recalculate and write progress percent               |
| `cmdStateAddDecision`    | Append a decision entry                              |
| `cmdStateAddBlocker`     | Append a blocker entry                               |
| `cmdStateResolveBlocker` | Mark a blocker resolved                              |
| `cmdStateRecordSession`  | Record a session start/end timestamp                 |
| `cmdStateSnapshot`       | Emit full STATE.md as JSON                           |
| `cmdStateJson`           | Emit parsed STATE.md fields as structured JSON       |
| `cmdSignalWaiting`       | Write `.planning/WAITING.json` decision-point signal |
| `cmdSignalResume`        | Delete `WAITING.json`                                |

**Write pipeline - every `writeStateMd()` call:**

```
1. Acquire .planning/.lock (O_EXCL spin-lock, 10 retries, stale >30s)
2. buildStateFrontmatter()  ← parse body fields to build YAML object
3. syncStateFrontmatter()   ← prepend updated --- block
4. normalizeMd()            ← enforce markdownlint rules
5. fs.writeFileSync()
6. Release lock
```

**STATE.md YAML frontmatter fields** (auto-maintained):

```yaml
gsd_state_version: "1.0"
milestone:          "v1.0"
milestone_name:     "..."
current_phase:      "3"
current_phase_name: "..."
current_plan:       "2 of 5"
status:             executing   # planning|discussing|executing|verifying|paused|completed|unknown
stopped_at:         "..."
paused_at:          "..."
last_updated:       "2026-04-03T12:00:00.000Z"
last_activity:      "..."
progress:
  total_phases:     8
  completed_phases: 2
  total_plans:      24
  completed_plans:  10
  percent:          42
```

---

### 3.7 `phase.cjs` - Phase lifecycle management

**Responsibilities:** CRUD operations on phases in both the filesystem and ROADMAP.md.

**Exported functions:**

| Function              | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `cmdPhasesList`       | List all phases from disk (slug, number, plan count)                 |
| `cmdPhaseNextDecimal` | Compute next decimal sub-phase number after a base (e.g. 3 → 3.1)    |
| `cmdFindPhase`        | Locate a phase directory by number or slug                           |
| `cmdPhasePlanIndex`   | Return ordered list of PLAN.md files for a phase                     |
| `cmdPhaseAdd`         | Create new phase dir + append entry to ROADMAP.md                    |
| `cmdPhaseInsert`      | Insert a phase after an existing phase (renumbers subsequent phases) |
| `cmdPhaseRemove`      | Remove a phase dir and its ROADMAP.md entry                          |
| `cmdPhaseComplete`    | Mark phase done; update ROADMAP + REQUIREMENTS + STATE               |

**`cmdPhaseAdd` flow:**

```
1. loadConfig(cwd)
2. Read ROADMAP.md → find highest existing phase number
3. new_num = max + 1
4. mkdir .planning/phases/NN-slug/
5. Write .gitkeep
6. Inject phase entry into ROADMAP.md before final --- separator
7. output { phase_number, padded, name, slug, directory }
```

**`cmdPhaseComplete` flow:**

```
1. Locate phase in ROADMAP.md
2. Warn if UAT or VERIFICATION files show incomplete status
3. Update ROADMAP.md: checkbox ✓, progress table, plan count
4. Update REQUIREMENTS.md checkboxes that reference this phase
5. Find next phase (disk scan, fallback to ROADMAP)
6. Update STATE.md: Status, Current Phase, Current Phase Name,
   Current Plan, Last Activity, Completed Phases counter
7. Recalculate progress percent
```

---

### 3.8 `roadmap.cjs` - ROADMAP.md analysis

**Responsibilities:** Read-focused operations on `ROADMAP.md`; no writes to STATE.md.

**Exported functions:**

| Function                       | Purpose                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `cmdRoadmapGetPhase`           | Return structured data for a single phase entry           |
| `cmdRoadmapAnalyze`            | Parse full roadmap → phases array with status/plan counts |
| `cmdRoadmapUpdatePlanProgress` | Rewrite plan-count column for one phase                   |

**Note:** `extractCurrentMilestone()` from core scopes all ROADMAP searches to the active milestone version (read from STATE.md frontmatter) to prevent false matches across milestone boundaries.

---

### 3.9 `milestone.cjs` - Milestone operations

**Responsibilities:** Completing milestones; archiving ROADMAP/REQUIREMENTS/phases; marking requirements complete.

**Exported functions:**

| Function                      | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `cmdRequirementsMarkComplete` | Mark one or more requirement IDs as done in REQUIREMENTS.md           |
| `cmdMilestoneComplete`        | Archive current milestone, reset STATE, optionally archive phase dirs |

**`cmdMilestoneComplete` flow:**

```
1. Validate all phases are ✓ in ROADMAP.md
2. Copy ROADMAP.md → milestones/vX.Y-ROADMAP.md
3. Copy REQUIREMENTS.md → milestones/vX.Y-REQUIREMENTS.md
4. Optionally: copy phases/ → milestones/vX.Y-phases/
5. Append entry to MILESTONES.md
6. Reset STATE.md to next milestone version
7. Optionally commit docs
```

---

### 3.10 `verify.cjs` - Verification and health checks

**Responsibilities:** Summary validation, plan structure checks, artifact verification, consistency checks, full health audit.

**Exported functions:**

| Function                     | Purpose                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `cmdVerifySummary`           | Validate a SUMMARY.md file (frontmatter fields, file counts)      |
| `cmdVerifyPlanStructure`     | Check a PLAN.md has all required sections and frontmatter         |
| `cmdVerifyPhaseCompleteness` | Confirm all plans in a phase have summaries                       |
| `cmdVerifyReferences`        | Check `files_modified` paths exist on disk                        |
| `cmdVerifyCommits`           | Validate git commit hashes are reachable                          |
| `cmdVerifyArtifacts`         | Check `must_haves.artifacts` constraints from PLAN.md frontmatter |
| `cmdVerifyKeyLinks`          | Verify `must_haves.key_links` import/export relationships         |
| `cmdValidateConsistency`     | Cross-check STATE.md ↔ ROADMAP.md ↔ disk                          |
| `cmdValidateHealth`          | Full project health audit (10 checks, optional --repair)          |
| `cmdValidateAgents`          | Verify all required agent files are installed                     |

**`cmdValidateHealth` check sequence:**

```
1.  .planning/ directory exists
2.  PROJECT.md exists + has required sections
3.  ROADMAP.md exists
4.  STATE.md exists + phase references are valid
5.  config.json is valid JSON
6.  Nyquist key present in config.json
7.  Phase directories follow NN-slug naming convention
8.  No orphaned PLAN.md files (plans without phase dirs)
9.  Agent files installed (via checkAgentsInstalled())
10. ROADMAP phases ↔ disk phase dirs are in sync

--repair actions: createConfig | resetConfig | regenerateState | addNyquistKey
Output: { status: 'healthy'|'degraded'|'broken', errors[], warnings[], info[], repairable_count }
```

---

### 3.11 `config.cjs` - Configuration management

**Responsibilities:** Read/write `config.json`; initialise new project configs; validate schema.

**Exported functions:**

| Function                   | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `cmdConfigNewProject`      | Scaffold `config.json` from wizard choices         |
| `cmdConfigEnsureSection`   | Add missing top-level sections to existing config  |
| `cmdConfigSet`             | Set a dot-path key (e.g. `git.branching_strategy`) |
| `cmdConfigGet`             | Read a dot-path key                                |
| `cmdConfigSetModelProfile` | Set `model_profile` with validation                |

**Config `get()` helper** supports both nested (`git.branching_strategy`) and legacy flat (`branching_strategy`) key formats for backwards compatibility.

---

### 3.12 `template.cjs` - Document templates

**Responsibilities:** Select the appropriate template for a plan type; fill and write template files.

**Exported functions:**

| Function            | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `cmdTemplateSelect` | Detect plan type from PLAN.md and return template name       |
| `cmdTemplateFill`   | Render a named template with given options and write to disk |

**Template types:** `plan`, `summary`, `verification`, `context`, `research`, `uat`, `reviews`

---

### 3.13 `commands.cjs` - General utilities

**Responsibilities:** Miscellaneous helpers that don't belong to a single domain.

**Exported functions:**

| Function              | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `cmdGenerateSlug`     | Convert text → URL-safe slug                            |
| `cmdCurrentTimestamp` | Emit ISO-8601 or formatted timestamp                    |
| `cmdListTodos`        | List todo files from `todos/pending/`                   |
| `cmdVerifyPathExists` | Check a file/dir exists (safe path validation)          |
| `cmdHistoryDigest`    | Summarise recent git commit log                         |
| `cmdResolveModel`     | Resolve an agent type to its model ID                   |
| `cmdCommit`           | Stage files and create a git commit                     |
| `cmdCommitToSubrepo`  | Commit in a sub-repository                              |
| `cmdSummaryExtract`   | Extract specific fields from a SUMMARY.md               |
| `cmdWebsearch`        | Dispatch to Brave/Firecrawl/Exa based on config         |
| `cmdProgressRender`   | Render progress as JSON, markdown table, or bar string  |
| `cmdTodoMatchPhase`   | Find todos associated with a phase                      |
| `cmdTodoComplete`     | Move a todo from `pending/` to `completed/`             |
| `cmdScaffold`         | Write a scaffolded document (CONTEXT, RESEARCH, UAT, …) |
| `cmdStats`            | Aggregate project statistics                            |

---

### 3.14 `init.cjs` - Workflow bootstrap payloads

**Responsibilities:** Assemble large JSON context payloads that bootstrap AI agent workflows (executor, planner, verifier, etc.).

All `init` commands call `withProjectRoot()` which injects portable path fields into every payload:

```json
{
  "project_root":    "/abs/path/to/project",
  "gsd_bin":         "/abs/path/to/gsd-tools.cjs",
  "gsd_root":        "/abs/path/to/.gsd/",
  "gsd_harness_dir": "/abs/path/to/.gsd/bin/github/",
  "agents_installed": true,
  "missing_agents":   []
}
```

**Exported functions:**

| Function                 | Purpose                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `cmdInitExecutePhase`    | Full executor payload: config flags, phase info, plan inventory, branch name, file paths |
| `cmdInitPlanPhase`       | Planner payload: PROJECT.md + ROADMAP context + config                                   |
| `cmdInitNewProject`      | New-project wizard bootstrap                                                             |
| `cmdInitNewMilestone`    | Milestone-start payload                                                                  |
| `cmdInitQuick`           | Quick-task context payload                                                               |
| `cmdInitResume`          | Resume-from-pause payload                                                                |
| `cmdInitVerifyWork`      | Verifier payload: phase info + VERIFICATION template path                                |
| `cmdInitPhaseOp`         | Phase-level operation payload                                                            |
| `cmdInitTodos`           | Todo-management payload                                                                  |
| `cmdInitMilestoneOp`     | Milestone operation payload                                                              |
| `cmdInitMapCodebase`     | Codebase-mapping payload                                                                 |
| `cmdInitManager`         | Manager workflow payload (multi-agent orchestration)                                     |
| `cmdInitProgress`        | Progress-report payload                                                                  |
| `cmdInitNewWorkspace`    | Create a new workstream                                                                  |
| `cmdInitListWorkspaces`  | List workstreams                                                                         |
| `cmdInitRemoveWorkspace` | Remove a workstream                                                                      |
| `cmdAgentSkills`         | Return agent-skills config for a given agent type                                        |

---

### 3.15 `workstream.cjs` - Workstream management

**Responsibilities:** Create, list, switch, query, and complete named workstreams.

**Exported functions:**

| Function                | Purpose                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `cmdWorkstreamCreate`   | Scaffold `.planning/workstreams/{name}/` with STATE/ROADMAP/REQUIREMENTS |
| `cmdWorkstreamList`     | List all workstreams with status summary                                 |
| `cmdWorkstreamStatus`   | Return detailed status of one workstream                                 |
| `cmdWorkstreamComplete` | Archive a completed workstream to `milestones/ws-{name}-{date}/`         |
| `cmdWorkstreamSet`      | Write `active-workstream` file (sets default for subsequent commands)    |
| `cmdWorkstreamGet`      | Read current active workstream name                                      |
| `cmdWorkstreamProgress` | Return progress data across all workstreams                              |

---

### 3.16 `uat.cjs` - User Acceptance Testing

**Responsibilities:** Audit UAT files; render UAT checkpoint summaries.

**Exported functions:**

| Function              | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `cmdAuditUat`         | Scan all `NN-UAT.md` files; report status per phase       |
| `cmdRenderCheckpoint` | Render current UAT state as a structured checkpoint block |

**UAT file structure:**

```yaml
---
phase: 3
name: "Feature UAT"
created: "2026-04-03"
status: pending   # pending | complete
---
## Current Test
number: 1
name: "Login flow"
expected: |
  User can log in with valid credentials
result:      # pending | skipped | blocked | pass
```

---

### 3.17 `profile-pipeline.cjs` - Claude session analysis

**Responsibilities:** Read `~/.claude/projects/` JSONL session files to extract genuine user messages for profiling.

**Exported functions:**

| Function             | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `cmdScanSessions`    | List all project directories and session JSONL files                   |
| `cmdExtractMessages` | Filter messages: `type=user, userType=external, !isMeta, !isSidechain` |
| `cmdProfileSample`   | Multi-project weighted sample with recency bias                        |

**Recency weighting:** messages from sessions within last 30 days → 10 msgs/session; older sessions → 3 msgs/session. Context-dump messages are skipped. Extracted messages written to `/tmp/gsd-pipeline-*/` temp files.

---

### 3.18 `profile-output.cjs` - User profile generation

**Responsibilities:** Render `USER-PROFILE.md` from analysed messages; generate/update `GEMINI.md` / `CLAUDE.md` with managed sections.

**Exported functions:**

| Function                    | Purpose                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `cmdWriteProfile`           | Render USER-PROFILE.md from analysis JSON (with sensitive-data redaction) |
| `cmdProfileQuestionnaire`   | Interactive questionnaire to seed profile                                 |
| `cmdGenerateDevPreferences` | Write `~/.claude/commands/gsd/dev-preferences.md`                         |
| `cmdGenerateClaudeProfile`  | Write full Claude-specific profile document                               |
| `cmdGenerateClaudeMd`       | Generate/update GEMINI.md with 5 managed sections                         |

**8 profiling dimensions:**

1. `communication_style`
2. `decision_speed`
3. `explanation_depth`
4. `debugging_approach`
5. `ux_philosophy`
6. `vendor_philosophy`
7. `frustration_triggers`
8. `learning_style`

**Managed sections in GEMINI.md** (delimited by `<!-- GSD:section-start/end -->` markers, manual edits outside markers are preserved):

1. Project
2. Stack
3. Conventions
4. Architecture
5. Workflow

**Sensitive-data redaction:** 14 regex patterns covering API keys, tokens, passwords, emails, IPs, credit card numbers, and similar PII.

---

## 4. Key Data Flows

### 4.1 `state load`

```
gsd-tools state load
  │
  ├─ loadConfig(cwd)           [core.cjs]   → reads config.json + ~/.gsd/defaults.json
  ├─ read .planning/STATE.md               → raw markdown string
  ├─ check ROADMAP.md exists               → boolean
  └─ output {
       config,
       state_raw,
       state_exists,
       roadmap_exists,
       config_exists
     }
```

### 4.2 `phase add <description>`

```
gsd-tools phase add "implement auth"
  │
  ├─ loadConfig(cwd)
  ├─ check phase_naming mode ('sequential' | 'custom')
  ├─ extractCurrentMilestone(ROADMAP.md)    → scope to active milestone
  ├─ scan existing phase dirs               → find max(phase_number)
  ├─ new_num = max + 1  (zero-padded: "04")
  ├─ slug = generateSlug("implement auth")  → "implement-auth"
  ├─ mkdir .planning/phases/04-implement-auth/
  ├─ write .gitkeep
  ├─ inject into ROADMAP.md before last --- separator:
  │    "- [ ] Phase 4: implement-auth …"
  └─ output { phase_number: 4, padded: "04", name, slug, directory }
```

### 4.3 `phase complete <N>`

```
gsd-tools phase complete 4
  │
  ├─ findPhaseInternal(cwd, 4)
  ├─ check for incomplete UAT / VERIFICATION → emit warnings
  ├─ update ROADMAP.md:
  │    - checkbox  [ ] → [x]
  │    - progress table row
  │    - plan count column
  ├─ update REQUIREMENTS.md checkboxes referencing phase 4
  ├─ find next phase (disk scan → ROADMAP fallback)
  ├─ writeStateMd updates:
  │    Status, Current Phase, Current Phase Name,
  │    Current Plan, Last Activity, Completed Phases++
  └─ recalculate progress percent
```

### 4.4 `scaffold context --phase N`

```
gsd-tools scaffold context --phase 3
  │
  ├─ normalizePhaseName(3)          → "03"
  ├─ findPhaseInternal(cwd, "03")   → { dir, number, slug }
  ├─ build YAML frontmatter block
  ├─ write .planning/phases/03-slug/03-CONTEXT.md
  └─ output { created: true, path }
```

### 4.5 `validate health [--repair]`

```
gsd-tools validate health --repair
  │
  ├─ Check 1: .planning/ directory exists
  ├─ Check 2: PROJECT.md + required section headings
  ├─ Check 3: ROADMAP.md exists
  ├─ Check 4: STATE.md exists + phase references valid
  ├─ Check 5: config.json valid JSON
  ├─ Check 6: nyquist key present in config
  ├─ Check 7: phase dir names match NN-slug pattern
  ├─ Check 8: no orphaned PLAN.md files
  ├─ Check 9: agent files installed (checkAgentsInstalled)
  ├─ Check 10: ROADMAP phases ↔ disk dirs in sync
  │
  └─ if --repair and issues found:
       ├─ createConfig / resetConfig
       ├─ regenerateState
       └─ addNyquistKey

  output: { status, errors[], warnings[], info[], repairable_count }
```

### 4.6 `init execute-phase <N>`

```
gsd-tools init execute-phase 4
  │
  ├─ withProjectRoot() injects:
  │    project_root, gsd_bin, gsd_root, gsd_harness_dir,
  │    agents_installed, missing_agents
  │
  ├─ loadConfig(cwd)
  ├─ resolveModelInternal(cwd, 'gsd-executor') → model string
  ├─ resolveModelInternal(cwd, 'gsd-verifier') → verifier model string
  ├─ findPhaseInternal(cwd, 4)
  ├─ cmdPhasePlanIndex(cwd, 4)  → ordered PLAN.md list
  ├─ getMilestoneInfo(cwd)
  ├─ computeBranchName(config, phase)
  ├─ check file existence booleans (UAT, VERIFICATION, CONTEXT …)
  │
  └─ output large JSON blob:
       { executor_model, verifier_model, config_flags,
         phase_info, plan_inventory, branch_name,
         milestone_info, file_paths, project_root, gsd_bin, … }
```

### 4.7 Model resolution priority chain

```
resolveModelInternal(cwd, agentType)          [core.cjs:1000]
  │
  ├─ loadConfig(cwd)                          → config object (internal; not a parameter)
  │
  ├─ 1. config.model_overrides?.[agentType]   → return override directly if set
  ├─ 2. config.resolve_model_ids === 'omit'   → return '' (suppress model param)
  ├─ 3. MODEL_PROFILES[agentType][profile]    → alias (opus/sonnet/haiku/inherit)
  │       where profile = config.model_profile ?? 'balanced'
  │       missing agentType → falls back to 'sonnet'
  └─ 4. config.resolve_model_ids === true
         ? MODEL_ALIAS_MAP[alias]   → 'claude-opus-4-6' / 'claude-sonnet-4-6' / 'claude-haiku-4-5'
         : alias                    → 'opus' / 'sonnet' / 'haiku'
```

> `resolveModelInternal` is the **internal** implementation exported directly; callers pass `(cwd, agentType)` and the function loads `config` itself. The `core.cjs` export table lists it as `resolveModelInternal` (not `resolveModel`). The §3.2 export table entry `resolveModel(agentType, config)` was a documentation error - the correct signature is `resolveModelInternal(cwd, agentType)`.

### 4.8 `progress table`

```
gsd-tools progress table
  │
  ├─ scan .planning/phases/ directories
  ├─ for each phase dir:
  │    count PLAN.md files   → total plans
  │    count SUMMARY.md files → completed plans
  ├─ getMilestoneInfo(cwd)
  ├─ calculate percent complete
  └─ render as:
       json  → raw JSON object
       table → markdown table string
       bar   → ASCII progress bar + summary line
```

---

## 5. File System Layout

```
<project-root>/
└── .planning/
    ├── config.json                 ← project config (always root; never workstream-scoped)
    ├── PROJECT.md                  ← project definition (always root)
    ├── MILESTONES.md               ← shipped milestone history log
    ├── active-workstream           ← plain text: name of active workstream (optional)
    ├── WAITING.json                ← decision-point signal file (transient)
    │
    ├── STATE.md                    ← flat-mode: project state with auto-synced YAML frontmatter
    ├── ROADMAP.md                  ← flat-mode: phase roadmap
    ├── REQUIREMENTS.md             ← flat-mode: requirements list
    │
    ├── phases/                     ← flat-mode phase directories
    │   └── NN-slug/
    │       ├── .gitkeep
    │       ├── NN-PP-PLAN.md       ← plan document (PP = plan number)
    │       ├── NN-PP-SUMMARY.md    ← completion summary
    │       ├── NN-CONTEXT.md       ← phase context / scope document
    │       ├── NN-RESEARCH.md      ← research findings
    │       ├── NN-VERIFICATION.md  ← verification results
    │       ├── NN-UAT.md           ← user acceptance tests
    │       └── NN-REVIEWS.md       ← review notes
    │
    ├── workstreams/
    │   └── {name}/
    │       ├── STATE.md
    │       ├── ROADMAP.md
    │       ├── REQUIREMENTS.md
    │       └── phases/
    │           └── NN-slug/ …      ← same layout as flat-mode phases/
    │
    ├── milestones/
    │   ├── vX.Y-ROADMAP.md
    │   ├── vX.Y-REQUIREMENTS.md
    │   ├── vX.Y-MILESTONE-AUDIT.md
    │   ├── vX.Y-phases/            ← archived phase dirs (--archive-phases flag)
    │   └── ws-{name}-{date}/       ← archived workstream directories
    │
    ├── codebase/
    │   ├── STACK.md
    │   ├── CONVENTIONS.md
    │   └── ARCHITECTURE.md
    │
    ├── research/
    │
    ├── todos/
    │   ├── pending/    ← *.md todo files
    │   └── completed/  ← *.md completed todo files
    │
    └── quick/
        └── YYMMDD-xxx-slug/        ← quick-task directories

~/.gsd/
    ├── defaults.json               ← user-level config defaults (merged under project config)
    ├── brave_api_key
    ├── firecrawl_api_key
    └── exa_api_key

~/.claude/
    ├── get-shit-done/
    │   └── USER-PROFILE.md         ← generated user profile
    ├── commands/gsd/
    │   └── dev-preferences.md
    └── projects/                   ← JSONL session files (read by profile-pipeline)
        └── <project>/
            └── *.jsonl
```

> **Workstream scoping rule:** `config.json` and `PROJECT.md` always live at the root `.planning/` level. `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, and `phases/` are scoped to `.planning/workstreams/{name}/` when a workstream is active.

> **`.gsd/WAITING.json`** takes precedence over `.planning/WAITING.json` when the `.gsd/` directory exists at project root.

---

## 6. Configuration Schema

**Location:** `.planning/config.json`  
**Defaults source:** `~/.gsd/defaults.json` (merged before project config; project values win)

```json
{
  "model_profile": "balanced",
  "commit_docs":   true,
  "search_gitignored": false,
  "parallelization":   true,
  "brave_search":  false,
  "firecrawl":     false,
  "exa_search":    false,
  "resolve_model_ids": false,
  "context_window": 200000,
  "phase_naming":  "sequential",
  "sub_repos":     [],
  "model_overrides": null,
  "agent_skills":  {},

  "git": {
    "branching_strategy":         "none",
    "phase_branch_template":      "gsd/phase-{phase}-{slug}",
    "milestone_branch_template":  "gsd/{milestone}-{slug}",
    "quick_branch_template":      null
  },

  "workflow": {
    "research":                  true,
    "plan_check":                true,
    "verifier":                  true,
    "nyquist_validation":        true,
    "auto_advance":              false,
    "node_repair":               true,
    "node_repair_budget":        2,
    "ui_phase":                  true,
    "ui_safety_gate":            true,
    "text_mode":                 false,
    "research_before_questions": false,
    "discuss_mode":              "discuss",
    "skip_discuss":              false,
    "_auto_chain_active":        false
  },

  "hooks": {
    "context_warnings": true
  }
}
```

### Field reference

| Key                             | Type                                         | Default                      | Description                                                       |
| ------------------------------- | -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `model_profile`                 | `"quality"\|"balanced"\|"budget"\|"inherit"` | `"balanced"`                 | Global model tier; maps to alias via MODEL_PROFILES               |
| `commit_docs`                   | boolean                                      | `true`                       | Auto-commit `.planning/` docs after updates                       |
| `search_gitignored`             | boolean                                      | `false`                      | Include gitignored files in searches                              |
| `parallelization`               | boolean                                      | `true`                       | Enable parallel agent sub-tasks                                   |
| `brave_search`                  | boolean                                      | `false`                      | Enable Brave Search API                                           |
| `firecrawl`                     | boolean                                      | `false`                      | Enable Firecrawl web-crawl API                                    |
| `exa_search`                    | boolean                                      | `false`                      | Enable Exa Search API                                             |
| `resolve_model_ids`             | `false\|true\|"omit"`                        | `false`                      | `true` = expand alias to full ID; `"omit"` = suppress model param |
| `context_window`                | integer                                      | `200000`                     | Token context window hint for agents                              |
| `phase_naming`                  | `"sequential"\|"custom"`                     | `"sequential"`               | Auto-increment vs. manual phase numbering                         |
| `sub_repos`                     | string[]                                     | `[]`                         | Child directory names that have their own `.git`                  |
| `model_overrides`               | object\|null                                 | `null`                       | Per-agent model alias overrides, e.g. `{"gsd-planner":"opus"}`    |
| `agent_skills`                  | object                                       | `{}`                         | Per-agent skills/capability flags                                 |
| `git.branching_strategy`        | `"none"\|"phase"\|"milestone"\|"workstream"` | `"none"`                     | When to create branches                                           |
| `git.phase_branch_template`     | string                                       | `"gsd/phase-{phase}-{slug}"` | Branch name template for phases                                   |
| `git.milestone_branch_template` | string                                       | `"gsd/{milestone}-{slug}"`   | Branch name template for milestones                               |
| `git.quick_branch_template`     | string\|null                                 | `null`                       | Branch name template for quick tasks                              |
| `workflow.research`             | boolean                                      | `true`                       | Run research agent before planning                                |
| `workflow.plan_check`           | boolean                                      | `true`                       | Run plan-checker agent on PLAN.md files                           |
| `workflow.verifier`             | boolean                                      | `true`                       | Run verifier agent after execution                                |
| `workflow.nyquist_validation`   | boolean                                      | `true`                       | Run Nyquist auditor for coverage gaps                             |
| `workflow.auto_advance`         | boolean                                      | `false`                      | Automatically advance to next plan without prompting              |
| `workflow.node_repair`          | boolean                                      | `true`                       | Attempt automated repair of failed workflow nodes                 |
| `workflow.node_repair_budget`   | integer                                      | `2`                          | Max repair attempts per node                                      |
| `workflow.ui_phase`             | boolean                                      | `true`                       | Include UI-specific review agents                                 |
| `workflow.ui_safety_gate`       | boolean                                      | `true`                       | Block phase completion if UI checks fail                          |
| `workflow.text_mode`            | boolean                                      | `false`                      | Suppress image/screenshot tools                                   |
| `workflow.discuss_mode`         | `"discuss"\|"skip"`                          | `"discuss"`                  | Whether to enter discussion phase                                 |
| `workflow.skip_discuss`         | boolean                                      | `false`                      | Hard override to skip discussion entirely                         |
| `hooks.context_warnings`        | boolean                                      | `true`                       | Emit warnings when context window usage is high                   |

> **Legacy flat format:** Top-level keys like `branching_strategy`, `research`, `plan_checker`, `verifier`, `nyquist_validation` are still accepted by the `get()` helper for backwards compatibility with configs created before the nested-section format was introduced.

---

## 7. Frontmatter Schemas

All schemas are validated by `cmdFrontmatterValidate` using `FRONTMATTER_SCHEMAS` defined in `frontmatter.cjs`.

### 7.1 Plan frontmatter (`NN-PP-PLAN.md`)

**Required fields:** `phase`, `plan`, `type`, `wave`, `depends_on`, `files_modified`, `autonomous`, `must_haves`

```yaml
---
phase: 3
plan: 2
type: feature              # feature | fix | refactor | research | infra | docs
wave: 1                    # execution wave (for parallelization grouping)
depends_on: [1]            # list of plan numbers this depends on
files_modified: []         # files expected to be created/modified
autonomous: true           # can run without human input
must_haves:
  truths:
    - "Users can authenticate via OAuth"
  artifacts:
    - path: src/auth/oauth.ts
      min_lines: 50
      contains: "export function"
      exports: ["oauthHandler"]
  key_links:
    - from: src/auth/oauth.ts
      to: src/routes/auth.ts
      via: import
      pattern: "oauthHandler"
---
```

### 7.2 Summary frontmatter (`NN-PP-SUMMARY.md`)

**Required fields:** `phase`, `plan`, `subsystem`, `tags`, `duration`, `completed`

**Optional fields:** `one-liner`, `key-files`, `tech-stack`, `key-decisions`, `patterns-established`, `dependency-graph`, `requirements-completed`

```yaml
---
phase: 3
plan: 2
subsystem: "authentication"
tags: [oauth, security, backend]
duration: "2h"
completed: true
one-liner: "Implemented OAuth 2.0 login flow"
key-files:
  - src/auth/oauth.ts
  - src/routes/auth.ts
tech-stack:
  added: [passport-oauth2]
  patterns: [middleware, strategy-pattern]
key-decisions:
  - "Used passport.js strategy for extensibility"
patterns-established:
  - "Auth middleware in src/auth/"
dependency-graph:
  provides: [OAuthHandler, authMiddleware]
  affects: [UserService, SessionManager]
requirements-completed: [REQ-14, REQ-15]
---
```

### 7.3 Verification frontmatter (`NN-VERIFICATION.md`)

**Required fields:** `phase`, `verified`, `status`, `score`

```yaml
---
phase: 3
verified: true
status: complete           # pending | human_needed | gaps_found | complete
score: 92                  # 0-100 quality score
---
```

### 7.4 UAT frontmatter (`NN-UAT.md`)

```yaml
---
phase: 3
name: "Feature UAT"
created: "2026-04-03"
status: pending            # pending | complete
---
```

---

## 8. Model Profiles

### 8.1 Profile tiers

| Tier       | Description                             | Use case                            |
| ---------- | --------------------------------------- | ----------------------------------- |
| `quality`  | Highest capability model for each agent | Production releases, critical paths |
| `balanced` | Mix of performance and cost (default)   | Day-to-day development              |
| `budget`   | Fastest/cheapest model for each agent   | High-iteration, CI, draft work      |
| `inherit`  | All agents return `'inherit'`           | Let harness runtime decide          |

### 8.2 Agent → model matrix

| Agent                      | quality | balanced | budget |
| -------------------------- | ------- | -------- | ------ |
| `gsd-planner`              | opus    | opus     | sonnet |
| `gsd-roadmapper`           | opus    | sonnet   | sonnet |
| `gsd-executor`             | opus    | sonnet   | sonnet |
| `gsd-phase-researcher`     | opus    | sonnet   | haiku  |
| `gsd-project-researcher`   | opus    | sonnet   | haiku  |
| `gsd-research-synthesizer` | sonnet  | sonnet   | haiku  |
| `gsd-debugger`             | opus    | sonnet   | sonnet |
| `gsd-codebase-mapper`      | sonnet  | haiku    | haiku  |
| `gsd-verifier`             | sonnet  | sonnet   | haiku  |
| `gsd-plan-checker`         | sonnet  | sonnet   | haiku  |
| `gsd-integration-checker`  | sonnet  | sonnet   | haiku  |
| `gsd-nyquist-auditor`      | sonnet  | sonnet   | haiku  |
| `gsd-ui-researcher`        | opus    | sonnet   | haiku  |
| `gsd-ui-checker`           | sonnet  | sonnet   | haiku  |
| `gsd-ui-auditor`           | sonnet  | sonnet   | haiku  |

### 8.3 Model alias → full API ID

| Alias    | Full model ID       |
| -------- | ------------------- |
| `opus`   | `claude-opus-4-6`   |
| `sonnet` | `claude-sonnet-4-6` |
| `haiku`  | `claude-haiku-4-5`  |

> Aliases are expanded to full IDs only when `config.resolve_model_ids === true`. When `resolve_model_ids === "omit"`, the model parameter is omitted entirely from agent invocations (letting the harness default apply). When `false` (default), the short alias string is passed through unchanged.

### 8.4 Agent role descriptions

| Agent                      | Role                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| `gsd-planner`              | Writes and refines PLAN.md files; decomposes phases into executable tasks |
| `gsd-roadmapper`           | Generates and updates ROADMAP.md; structures phase sequences              |
| `gsd-executor`             | Implements code changes according to PLAN.md specifications               |
| `gsd-phase-researcher`     | Researches technical approaches for a specific phase                      |
| `gsd-project-researcher`   | Broad project-level research and technology evaluation                    |
| `gsd-research-synthesizer` | Consolidates multiple research outputs into RESEARCH.md                   |
| `gsd-debugger`             | Investigates failures, analyses errors, proposes fixes                    |
| `gsd-codebase-mapper`      | Scans and documents existing codebase structure                           |
| `gsd-verifier`             | Validates that implementation satisfies plan must_haves and artifacts     |
| `gsd-plan-checker`         | Reviews PLAN.md quality, completeness, and feasibility                    |
| `gsd-integration-checker`  | Checks cross-plan and cross-phase integration points                      |
| `gsd-nyquist-auditor`      | Audits for coverage gaps and missing test/verification nodes              |
| `gsd-ui-researcher`        | Researches UI/UX patterns and component approaches                        |
| `gsd-ui-checker`           | Validates UI implementation against design specifications                 |
| `gsd-ui-auditor`           | End-to-end UI quality audit; accessibility and consistency                |

---

*This document was generated from static analysis of all 18 `.cjs` files in `.gsd/bin/github/`. All line references are to that source tree. The document should be regenerated when module exports or schemas change.*
