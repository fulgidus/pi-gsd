# Requirements: pi-gsd

**Defined:** 2026-04-06
**Core Value:** Workflow files execute programmatically before the LLM ever sees them — zero shell round-trips, zero arbitrary command execution, fully typed from end to end.

---

## v1 Requirements

### WXP Engine Core

- [ ] **WXP-01**: Parser skips WXP tag processing inside fenced code blocks (` ``` ` regions)
- [ ] **WXP-02**: `<gsd-arguments>` block parses `$ARGUMENTS` via two-pass algorithm (flags extracted first, then positionals left-to-right with greedy-last-string rule)
- [ ] **WXP-03**: `<shell>` block executes allowlisted commands via `execFileSync` with 30-second timeout and stdout capture into named variables
- [ ] **WXP-04**: `<if>/<equals>/<starts-with>` conditional blocks control execution of nested operation blocks
- [ ] **WXP-05**: `<string-op op="split">` splits a variable value by a delimiter and stores the result
- [ ] **WXP-06**: `<gsd-paste>` tag is replaced with the named variable's value; undefined variable reference aborts processing
- [ ] **WXP-07**: Variable store maintains a typed namespace with collision detection — same-named variables from different included files are prefixed with their file's stem (e.g., `execute-phase:init`)
- [ ] **WXP-08**: Resolution loop processes tags iteratively (include → arguments → execute → paste → repeat) until no unprocessed tags remain, with a 50-iteration safety limit
- [ ] **WXP-09**: Any WXP processing failure produces a total crash — no partial injection, no LLM fallback — with a full error notification containing the variable namespace and pending/completed block states
- [ ] **WXP-10**: Security module enforces that WXP tags are only processed in files from trusted paths (package harness + project harness); `.planning/` files are never processed
- [ ] **WXP-11**: Security module enforces a shell allowlist (default: `pi-gsd-tools`, `git`, `node`, `cat`, `ls`, `echo`, `find`); any non-allowlisted command aborts processing
- [ ] **WXP-12**: XSD 1.1 canonical schema authored at `src/schemas/wxp.xsd` covering all tag names, nesting rules, attribute types, and content models
- [ ] **WXP-13**: Zod runtime schemas at `src/wxp/schema.ts` validate the parsed XML AST before execution; all TypeScript types in the WXP engine are inferred from these schemas (zero `any`)
- [ ] **WXP-14**: WXP preprocessing is integrated into the pi extension's `context` event, running after `<gsd-include>` resolution and before the LLM receives messages

### WXP Engine — `<gsd-include>` Extensions

- [ ] **INC-01**: `<gsd-include>` supports `include-arguments` flag — appends `$ARGUMENTS` inline when the file is injected (`<gsd-include path="..." include-arguments />`)
- [ ] **INC-02**: `<gsd-include>` supports children syntax for composable workflows — `<gsd-include path="..."><gsd-arguments><arg name="local-var" as="target-var" /></gsd-arguments></gsd-include>` maps caller variables into the included file's namespace
- [ ] **INC-03**: Variable collision between included files is automatically resolved with owner-prefix disambiguation; references in each file are updated to use the prefixed name

### WXP Engine — Tests

- [ ] **TST-01**: vitest unit tests cover all WXP modules (parser, arguments, variables, conditions, string-ops, security, shell (mocked), paste)
- [ ] **TST-02**: vitest integration tests cover the full `processWxp()` pipeline with fixture files including: basic shell output, conditional branches, nested includes, variable collisions, and each failure mode
- [ ] **TST-03**: Integration test asserts that the final output contains zero `<gsd-` substrings (outside code fences), verifying the strip step is complete

### CLI Migration (oclif)

- [ ] **CLI-01**: All existing `pi-gsd-tools` commands are migrated to typed oclif classes in `src/commands/`
- [ ] **CLI-02**: All command flags and positional arguments are typed via oclif `Flags.*` and `Args.*` decorators — no manual `parseNamedArgs()` or `Record<string, any>` arg parsing
- [ ] **CLI-03**: `pi-gsd-tools --help` and per-command `--help` are auto-generated from oclif class metadata
- [ ] **CLI-04**: `pi-gsd-tools wxp` subcommand group provides direct CLI access to WXP operations
- [ ] **CLI-05**: `commander` npm package is removed as a dependency after all commands are migrated
- [ ] **CLI-06**: All workflow XML `<shell command="pi-gsd-tools">` calls are verified to work correctly against the oclif-based CLI before commander removal

### Workflow File Conversion

- [ ] **WFL-01**: `execute-phase.md` is converted to use WXP as the pilot workflow; original file backed up as `execute-phase.md.bak` and committed to git
- [ ] **WFL-02**: High-traffic workflows converted to WXP: `plan-phase.md`, `discuss-phase.md`, `new-project.md`, `new-milestone.md` (each with .bak commit)
- [ ] **WFL-03**: All remaining workflow files in `.pi/gsd/workflows/` are converted to WXP incrementally
- [ ] **WFL-04**: All converted workflow files include a `<gsd-version v="X.Y.Z" />` tag identifying the pi-gsd version that produced them
- [ ] **WFL-05**: Harness files that have been user-customized can opt out of auto-updates via `<gsd-version v="X.Y.Z" do-not-update />`

### Type Cleanup

- [ ] **TYP-01**: `FrontmatterObject` in `src/lib/frontmatter.ts` is replaced with a recursive `YamlValue` type (`type YamlValue = string | number | boolean | null | YamlValue[] | Record<string, YamlValue>`) and `FrontmatterObject = Record<string, YamlValue>`
- [ ] **TYP-02**: All `eslint-disable @typescript-eslint/no-explicit-any` comments are removed from the codebase (currently in frontmatter.ts ×6, config.ts ×5, state.ts ×1, output.ts ×1)
- [ ] **TYP-03**: `output.ts` `AnyValue = any` is replaced with `unknown` + appropriate type guards
- [ ] **TYP-04**: `config.ts` dynamic object access typed via Zod-inferred types (no `any` casts)
- [ ] **TYP-05**: `state.ts` `any` usage typed via proper state interfaces
- [ ] **TYP-06**: ESLint rule `@typescript-eslint/no-explicit-any: error` is enforced with zero exceptions; `npm run typecheck` passes at zero errors

### Harness Distribution

- [ ] **HRN-01**: On `session_start`, the extension checks `<project>/.pi/gsd/` and copies any missing files from the package harness — existing files are never overwritten
- [ ] **HRN-02**: If a project harness file has a `<gsd-version>` tag older than the package version, the user is prompted with options: `y` (overwrite), `n` (skip), `pick` (select files), `diff` (create diff file)
- [ ] **HRN-03**: The extension detects and migrates existing symlinks at `<project>/.pi/gsd/` — replaces each symlink with a real file copy and logs a one-time notification
- [ ] **HRN-04**: `ensureHarnessSymlink()` and all symlink-related code are removed from the codebase
- [ ] **HRN-05**: `pi-gsd-settings.json` schema is authored at `src/schemas/pi-gsd-settings.schema.json` covering `trustedPaths`, `untrustedPaths`, `shellAllowlist`, `shellBanlist`, and `shellTimeoutMs`
- [ ] **HRN-06**: Global user settings are read from `~/.gsd/pi-gsd-settings.json` (user-level security config and allowlist extensions)
- [ ] **HRN-07**: Project-level settings at `<project>/.pi/gsd/pi-gsd-settings.json` override global settings for the specific project

---

## v2 Requirements

### WXP Engine Extensions

- **WXP-V2-01**: `<for-each>`, `<map>`, `<reduce>` iteration operations
- **WXP-V2-02**: `<string-op>` operations beyond `split`: `replace`, `trim`, `join`, `substring`
- **WXP-V2-03**: `<regex>` string matching and capture
- **WXP-V2-04**: `<json-parse>` operation for structured output from shell commands
- **WXP-V2-05**: `wait` and `async` attributes on `<shell>` for long-running commands

### oclif Extensions

- **CLI-V2-01**: oclif plugin architecture for user-defined command extensions

### WXP GUI/Tooling

- **TOOL-V2-01**: WXP debugger / step-through tool (notifications are sufficient for v1)

---

## Out of Scope

| Feature | Reason |
|---|---|
| Remote/URL file includes in `<gsd-include>` | Security surface; network dependency in a context event is unacceptable |
| Plugin system for custom WXP tags | Premature; v1 tag set is sufficient |
| WXP processing of `.planning/` files | Hard security invariant: LLM writes there; processing = arbitrary code execution via prompt injection |
| Piped input to `<shell>` commands | Attack surface; `pi-gsd-tools` validates args directly |
| Removing GSD v1.30.0 `.planning/` data compatibility | Hard constraint; format changes would break all existing GSD projects |

---

## Traceability

*Populated during roadmap creation.*

| Requirement | Phase | Status |
|---|---|---|
| WXP-01 through WXP-14 | — | Pending |
| INC-01 through INC-03 | — | Pending |
| TST-01 through TST-03 | — | Pending |
| CLI-01 through CLI-06 | — | Pending |
| WFL-01 through WFL-05 | — | Pending |
| TYP-01 through TYP-06 | — | Pending |
| HRN-01 through HRN-07 | — | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 44 ⚠️

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
