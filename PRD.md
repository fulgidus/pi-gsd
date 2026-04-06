# PRD: WXP - Workflow XML Preprocessor

> **Version:** 1.0 draft
> **Author:** pi-gsd contributors
> **Date:** 2026-04-06
> **Status:** Draft

---

## 1. Problem Statement

pi-gsd workflow files currently embed raw bash commands that the LLM must execute via tool calls. This wastes tokens (the LLM runs `pi-gsd-tools init execute-phase "16"` as a bash command, parses the output, then continues), is provider-dependent (different LLMs handle bash differently), and creates a security surface (the LLM executes arbitrary shell commands).

The `<gsd-include>` system (v1.12) solved file injection but not command execution. Workflow files still instruct the LLM to run CLI commands for setup, state queries, and conditional logic - all of which can and should be handled programmatically before the LLM sees the text whenever possible.

Additionally:
- `pi-gsd-tools` uses commander.js with loose typing and manual arg parsing
- Remaining `any` type aliases exist throughout the codebase
- Harness file distribution relies on fragile symlinks

---

## 2. Solution: WXP (Workflow XML Preprocessor)

A preprocessing engine that runs in the pi extension's `context` event, after template expansion and `<gsd-include>` injection, but before the LLM receives the messages.

WXP parses XML directives embedded in workflow files, executes them programmatically (shell commands, conditionals, string operations), stores results in a typed variable namespace, and replaces `<gsd-paste>` tags with computed values. The LLM receives clean text with all setup data pre-injected.

### 2.1 Processing Pipeline

```
User types /gsd-execute-phase 16
  │
  ├─ pi expands prompt template
  │   → `<gsd-include path="..." />` (+ $ARGUMENTS if `<gsd-include path="..." include-arguments />`) (or `<gsd-include path="..."></gsd-include>` with <gsd-arguments> block (args can be easily renamed for whatever supported args from the target file `<arg name="my-internal-var" as="phase" />`))
  │
  ├─ context event fires
  │   │
  │   ├─ Phase 1: <gsd-include> resolution (existing)
  │   │   → if variable naming collision detected, disambiguate with owner prefix (e.g. `execute-phase:config-json`) and update references accordingly
  │   │   → file contents injected inline
  │   │
  │   ├─ Phase 2: <gsd-arguments> parsing (when needed)
  │   │   → $ARGUMENTS split into typed named variables
  │   │
  │   ├─ Phase 3: <gsd-execute> blocks
  │   │   → shell commands run, conditionals evaluated
  │   │   → results stored in variable namespace each time
  │   │
  │   ├─ Phase 4: <gsd-paste> replacement
  │   │   → variable values injected into text
  │   │   → if variables are missing thrown error (no undefined pastes, no LLM fallback)
  │   │
  │   └─ Phase 5: cleanup
  │       → all WXP XML tags stripped from final text
  │       → LLM receives clean markdown + pre-computed data
  │
  └─ LLM processes the fully prepared context
```

---

## 3. XML Tag Specification

### 3.1 `<gsd-include>`

**Status:** Implemented (v1.12). Needs new flag.

Existing supported examples:
```xml
<gsd-include path=".pi/gsd/workflows/execute-phase.md" />
<gsd-include path=".pi/gsd/references/ui-brand.md" select="tag:core" />
<gsd-include path=".pi/gsd/references/ui-brand.md" select="heading:Anti-Patterns" />
<gsd-include path=".pi/gsd/references/ui-brand.md" select="lines:1-50" />
```
New flag:
```xml
<gsd-include path="..." include-arguments />
<gsd-include path="..." select="..." include-arguments />
```
or `include-arguments="true"` if XML doesn't support boolean attributes.

**Selectors:** `tag:NAME`, `heading:TEXT`, `lines:N-M`
**Valid chains:** `tag|heading`, `tag|lines`, `heading|tag`, `heading|lines`
**Invalid:** `lines` in any chain, 3+ segments
**On failure:** abort, red error notification.

### 3.2 `<gsd-arguments>`

Defines the typed argument schema for the workflow. Appears once per file, at the top.

```xml
<gsd-arguments>
  <settings>
    <keep-extra-args />     <!-- or <strict-args /> -->
    <delimiters> <!-- totally optionsl for multiple strings -->
      <delimiter type="string" value="\n" />
    </delimiters>
  </settings>
  <arg name="phase" type="number" />
  <arg name="auto-chain-active" type="flag" flag="--auto" optional />
  <arg name="user-text" type="string" optional />
</gsd-arguments>
```

**Arg types:** `string`, `number`, `boolean`, `flag`
- `flag`: boolean derived from presence of `flag="--flagname"` in $ARGUMENTS
- `optional`: absence is not an error; variable is `null`

**Settings:**
- `<keep-extra-args />`: extra positional args stored in `_extra` variable (array of strings)
- `<strict-args />`: extra args → error
- `<delimiters>`: how to split $ARGUMENTS before positional parsing (default: whitespace)

**Parsing algorithm (two-pass):**

```
Input: $ARGUMENTS = '16 --auto --gaps-only fix the login bug'
Schema: <arg name="phase" type="number" />
        <arg name="auto" type="flag" flag="--auto" optional />
        <arg name="gaps-only" type="flag" flag="--gaps-only" optional />
        <arg name="user-text" type="string" optional />

Pass 1 — Flag extraction:
  Scan $ARGUMENTS for all declared flag patterns.
  For type="flag": extract --name, set variable to true. Remove from string.
  For type="flag" with value (future): extract --name <value>, set variable. Remove both.
  Flags not declared in schema are left in the string untouched.

  After pass 1:
    auto = true
    gaps-only = true
    remaining = '16 fix the login bug'

Pass 2 — Positional assignment (left-to-right):
  Split remaining string by delimiters (default: whitespace).
  For each non-flag arg in declaration order:
    - type="number": consume next token, parse as number. NaN → error.
    - type="string" (not last): consume next token as-is.
    - type="string" (last declared arg): consume ALL remaining tokens,
      re-joined with space. This is the "greedy last string" rule.
    - type="boolean": consume next token, parse as true/false.

  After pass 2:
    phase = 16
    user-text = 'fix the login bug'

  If tokens remain after all args consumed:
    - <keep-extra-args />: store in _extra[]
    - <strict-args />: error
    - neither: silently discard

  Missing required args → error.
  Missing optional args → null.
```

### 3.3 `<gsd-execute>`

Contains programmatic operations. Can appear multiple times. Executes top-to-bottom.

```xml
<gsd-execute>
  <shell command="pi-gsd-tools">
    <args>
      <arg string="init" />
      <arg string="execute-phase" />
      <arg name="phase" wrap='"' />
    </args>
    <outs><!-- optional -->
      <out type="string" name="init" /><!-- can be multiples -->
    </outs>
  </shell>
</gsd-execute>
```

#### 3.3.1 `<shell>`

Runs a CLI command. Only allowlisted executables permitted (see §5 Security).

**Attributes:**
- `command`: executable name (must be in allowlist)

**Children:**
- `<args>`: ordered list of arguments
  - `<arg string="literal" />`: literal string argument
  - `<arg name="varname" />`: variable reference
  - `<arg name="varname" wrap='"' />`: variable wrapped in quotes
- `<outs>`: output capture
  - `<out type="string" name="varname" />`: capture stdout into variable
  - `<suppress-errors />`: suppress stderr (equivalent to `2>/dev/null`)

**Behaviour:**
- No piped input. Ever.
- Timeout: 30 seconds per command.
- Non-zero exit + no `<suppress-errors />` → abort with error.
- Non-zero exit + `<suppress-errors />` → variable is empty string.

#### 3.3.2 `<if>`

Conditional execution.

```xml
<if>
  <condition>
    <equals>
      <left name="auto-chain-active" />
      <right type="boolean" value="false" />
    </equals>
  </condition>
  <then>
    <!-- operations -->
  </then>
</if>
```

**Condition operators (v1):**
- `<equals>`: strict equality
- `<starts-with>`: string prefix check

**Operands:**
- `<left name="varname" />` / `<right name="varname" />`: variable reference
- `<left type="string" value="..." />` / `<right type="boolean" value="true" />`: literal

#### 3.3.3 `<string-op>`

String manipulation.

```xml
<string-op op="split">
  <args>
    <arg name="init" />
    <arg type="string" value="@file:" />
  </args>
  <outs><!-- mandatory -->
    <out type="string" name="init-file" /><!-- can be multiples -->
  </outs>
</string-op>
```

**Operations (v1):** `split` only.
**Future (v2+):** `replace`, `trim`, `join`, `substring`.

### 3.4 `<gsd-paste>`

Injects a variable's value into the text.

```xml
<gsd-paste name="init" />
<gsd-paste name="agent-skills" />
<gsd-paste name="plan-index" />
```

**Rules:**
- Must appear AFTER the `<gsd-execute>` that populates the variable.
- Undefined variable → abort with error.
- The tag is replaced with the variable's string value.

### 3.5 Processing Model: The Resolution Loop

WXP tags can appear conditionally (a `<gsd-include>` inside an `<if>` block), and included files may themselves contain `<gsd-execute>` blocks. The engine handles this with a resolution loop:

```
loop:
  1. Scan text for unprocessed <gsd-include> tags (not marked done="true")
  2. For each: resolve file, apply selector, inject content
     Mark the original tag: <gsd-include ... done="true" />
  3. Scan for <gsd-arguments> blocks → parse, populate variables
     Mark: <gsd-arguments done="true">
  4. Scan for <gsd-execute> blocks (not done) → execute top-to-bottom
     Mark each: <gsd-execute done="true">
  5. Scan for <gsd-paste> → replace with variable values
     Mark: <gsd-paste ... done="true" />
  6. If any NEW unprocessed tags were introduced (from included files
     or conditional branches): goto loop
  7. Final gate: scan for any WXP tag NOT marked done="true".
     If found → error: "Unresolved WXP tag: <tag...>"
  8. Strip ALL WXP tags (including done markers) from final text.
```

This handles:
- Conditional includes: `<if>` evaluated in step 4, reveals a `<gsd-include>` → picked up in next loop iteration
- Nested includes: included file has its own `<gsd-execute>` → processed in next iteration
- The `done="true"` marker prevents double-processing

### 3.6 `<gsd-include>` Self-Closing vs Children Syntax

`<gsd-include>` supports two forms:

**Self-closing (existing):**
```xml
<gsd-include path=".pi/gsd/workflows/execute-phase.md" />
<gsd-include path=".pi/gsd/workflows/execute-phase.md" include-arguments />
```

**With children (new, for arg remapping):**
```xml
<gsd-include path=".pi/gsd/workflows/execute-phase.md">
  <gsd-arguments>
    <arg name="my-local-phase" as="phase" />
    <arg name="my-flag" as="auto-chain-active" />
  </gsd-arguments>
</gsd-include>
```

The `as="target-name"` attribute maps a variable from the caller's namespace to the included file's expected arg name. This allows the same workflow to be included from different contexts with different variable names.

The parser must handle both `<gsd-include ... />` (self-closing) and `<gsd-include ...>...</gsd-include>` (with children).

### 3.7 Variable Collision Detection

When multiple included files define variables with the same name:

1. **Owner prefix** derived from the included file's stem: `execute-phase.md` → owner `execute-phase`
2. On collision, BOTH variables are prefixed: `init` → `execute-phase:init` and `plan-phase:init`
3. All `<gsd-paste name="init" />` references in the respective files are updated to use the prefixed name
4. If the same file is included multiple times, a progressive number is appended: `execute-phase:init`, `execute-phase-2:init`
5. Variables defined in the root prompt template (not inside any include) have no prefix and take priority

### 3.8 Failure Behaviour

On ANY failure during WXP processing:
- **Total crash.** No partial injection. No fallback to LLM.
- Error notification (red) with full state dump:
  - Which tag failed and why
  - Current variable namespace (all names + values)
  - Which `<gsd-execute>` blocks completed vs pending
  - Which `<gsd-include>` files were resolved vs pending
- The `context` event returns `{ messages: [] }` to block the LLM call

Partial execution is never delivered to the LLM. All or nothing.

---

## 4. Schema Validation

### 4.1 XSD 1.1

Canonical schema definition at `src/wxp/schema/wxp.xsd`. Defines:
- All tag names and nesting rules
- Attribute types and required/optional
- Content models for each element

Published alongside the package for external tooling / IDE support.

### 4.2 Zod (Runtime)

TypeScript Zod schemas at `src/wxp/schema.ts`. Validate the parsed XML AST before execution:
- Argument type correctness
- Selector chain validity
- Shell command allowlist enforcement
- Variable reference resolution (no undefined pastes)
- Condition operator type compatibility

All types are inferred from Zod schemas via `z.infer<>`. Zero `any`.

---

## 5. Security

### 5.1 Trusted File Locations

WXP tags are only processed in files loaded from:
1. **Package harness:** `<pkg>/.gsd/harnesses/pi/get-shit-done/`
2. **Project harness:** `<project>/.pi/gsd/` (copied from package, user-customisable)
3. **Override config:** `<project>/.pi/gsd/pi-gsd-settings.json` `trustedPaths` array

Files from `.planning/` are NEVER processed for WXP tags. The LLM can write to `.planning/` - if it could embed `<gsd-execute>` blocks there, it could execute arbitrary code via the engine.

### 5.2 Shell Command Allowlist

Only these executables are permitted in `<shell command="...">`:

```
pi-gsd-tools
git
node
cat
ls
echo
find
```

Any other executable → abort with error. No exceptions. Configurable via `pi-gsd-settings.json` `shellAllowlist` array (can only ADD, never remove the defaults).

### 5.3 No Piped Input

`pi-gsd-tools` validates arguments as hard as possible

### 5.4 Timeout

- 30-second hard timeout per `<shell>` command.
- Configurable via `pi-gsd-settings.json` `shellTimeoutMs`.
- **v1.1:** `wait` and `async` attributes for long-running commands (deferred from v1).

---

## 6. Harness File Distribution

### 6.1 Replace Symlinks with Copy-on-First-Run

On `session_start`, the extension:
1. Checks if `<project>/.pi/gsd/` exists
2. If not: copies ALL files from `<pkg>/.gsd/harnesses/pi/get-shit-done/` into `<project>/.pi/gsd/`
3. If yes: compares file list. Copies MISSING files only. Never overwrites.
4. Version check: if in the project file there is a `<gsd-version v="X.Y.Z" />` is less than the package one, prompts:
   `"pi-gsd updated to vX.Y.Z. Some of the workflow files are outdated. Update workflow files? (y/n/pick/diff)"`
   - `y`: overwrites all harness files
   - `n`: keeps existing, records skip
   - `pick`: allows the user to select specific files to update (any unchanged files are preserved because they may contain customizations, but a diff is created for the user to review)
   - `diff`: creates a diff file in the root of the project for the user to review and manually apply changes if needed

### 6.2 Remove Symlink Logic

Delete `ensureHarnessSymlink()` and all symlink-related code. Symlinks are fragile (worktrees break them, build scripts nuke them). Copies are stable and user-customisable.

---

## 7. oclif Migration

### 7.1 Scope

Migrate `pi-gsd-tools` from commander.js to [oclif](https://oclif.io/):
- Each command becomes a class in `src/commands/`
- Typed flags and args via oclif decorators
- Built-in help generation
- Plugin architecture for future extensibility

### 7.2 Command Structure

```
pi-gsd-tools
├── state          (json | update | get | patch | ...)
├── progress       (json)
├── stats          (json)
├── roadmap        (get-phase | analyze | update-plan-progress)
├── phase          (add | insert | remove | complete | next-decimal)
├── milestone      (complete)
├── verify         (plan-structure | phase-completeness | ...)
├── validate       (health | consistency | agents)
├── template       (select | fill)
├── frontmatter    (get | set | merge | validate)
├── init           (execute-phase | plan-phase | new-project | ...)
├── config         (get | set | set-model-profile | new-project)
├── workstream     (create | list | status | complete | set | get)
├── scaffold
├── commit
├── generate-model-profiles-md
├── wxp             (might as well put it here since it's a CLI entrypoint for WXP operations, maybe some crazy user will want to interact with it directly one day...)
└── ...
```

### 7.3 Typing

All command args and flags are typed via oclif's `Flags` and `Args` utilities. No `parseNamedArgs()` manual parsing. No `Record<string, any>`.

---

## 8. Type Cleanup

### 8.1 Zero `any` Policy

Every `any` in the codebase is eliminated:
- `FrontmatterObject = Record<string, any>` → proper recursive YAML value type
- All `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments → removed
- WXP engine built with Zod-inferred types from day one
- oclif commands typed via framework decorators

### 8.2 Audit

Full grep for `any` across `src/`, `.gsd/extensions/`, and new `src/wxp/`. Zero remaining when done.

---

## 9. Architecture

```
src/
├── wxp/                          ← NEW: Workflow XML Preprocessor
│   ├── index.ts                  ← main entry: processWxp(text, cwd, vars) → string
│   ├── parser.ts                 ← XML tag extraction from markdown
│   ├── arguments.ts              ← <gsd-arguments> parsing + $ARGUMENTS splitting
│   ├── executor.ts               ← <gsd-execute> block runner
│   ├── shell.ts                  ← <shell> command execution (execFileSync, allowlist)
│   ├── conditions.ts             ← <if>/<equals>/<starts-with> evaluation
│   ├── string-ops.ts             ← <string-op> operations
│   ├── variables.ts              ← typed variable store (get/set/resolve)
│   ├── paste.ts                  ← <gsd-paste> replacement
│   ├── security.ts               ← trusted path validation, allowlist enforcement
│   ├── schema.ts                 ← Zod schemas for all WXP types
│   └── schema/
│       └── wxp.xsd               ← XSD 1.1 canonical schema
├── commands/                     ← NEW: oclif command classes
│   ├── state.ts
│   ├── progress.ts
│   ├── ...
│   └── index.ts
├── lib/                          ← existing domain modules (cleaned up)
│   ├── core.ts
│   ├── state.ts
│   ├── ...
│   └── schemas.ts
├── cli.ts                        ← oclif entrypoint (replaces commander router)
└── output.ts
```

---

## 10. Migration Path

### Phase 1: Foundation (no breaking changes)
1. Create `src/wxp/` directory structure
2. Implement parser, variable store, security module
3. Implement `<gsd-arguments>` parsing
4. Implement `<shell>` execution with allowlist
5. Implement `<if>` / `<equals>` / `<starts-with>`
6. Implement `<string-op op="split">`
7. Implement `<gsd-paste>` replacement
8. XSD 1.1 schema + Zod runtime schemas
9. Wire into `context` event after `<gsd-include>` phase
10. Tests: vitest for all modules
    - Unit: parser, arguments, variables, conditions, string-ops, security, shell (mocked), paste
    - Integration: full pipeline from raw text with `<gsd-include>` + `<gsd-execute>` + `<gsd-paste>` → clean output
    - Edge cases: nested includes, conditional includes, variable collisions, partial failure crash dumps

### Phase 2: oclif migration (breaking: CLI interface)
1. Add oclif dependency
2. Migrate commands one-by-one from cli.ts switch/case to oclif classes
3. Typed flags and args
4. Remove commander.js dependency
5. Verify all workflow `<shell command="pi-gsd-tools">` calls still work

### Phase 3: Workflow conversion
1. Convert `execute-phase.md` as the pilot (highest-value workflow)
2. Convert remaining high-traffic workflows: `plan-phase.md`, `discuss-phase.md`, `new-project.md`
3. Convert remaining workflows incrementally
4. All workflows are converted to use WXP and oclif commands and versioned

### Phase 4: Type cleanup
1. Eliminate all `any` across codebase
2. `FrontmatterObject` → proper recursive type
3. Audit + CI lint rule: `no-explicit-any` with zero exceptions

### Phase 5: Harness distribution overhaul
1. Replace symlinks with copy-on-first-run
2. Version-aware update prompting
3. Remove all symlink code

---

## 11. Success Criteria

- [ ] `/gsd-execute-phase 16` runs with zero LLM bash commands for setup
- [ ] All pi-gsd-tools init/state/config calls happen via `<gsd-execute>` blocks
- [ ] `<gsd-paste>` injects pre-computed data that the LLM consumes directly
- [ ] XSD schema validates all WXP tags at parse time
- [ ] Zod schemas enforce runtime type safety
- [ ] Zero `any` in codebase
- [ ] `pi-gsd-tools` runs via oclif with typed commands
- [ ] Harness files are copied (not symlinked), user-customisable, version-tracked (update can be inhibited adding `do-not-update` eg: `<gsd-version v="X.Y.Z" do-not-update />`)
- [ ] No shell command executes without allowlist approval
- [ ] No `.planning/` file is ever processed for WXP tags

---

## 12. Non-Goals (v1)

- GUI/TUI for WXP debugging (use notifications)
- `<for-each>`, `<regex>`, `<json-parse>`, `<map>`, `<reduce>` (v2)
- `<string-op>` operations beyond `split` (v2)
- Remote file includes (URLs in `<gsd-include>`) is strictly forbidden
- Plugin system for custom WXP tags
