# Pitfalls Research: pi-gsd WXP Milestone

**Research date:** 2026-04-06
**Focus:** Mistakes when ADDING these features to an existing system (not greenfield)

---

## 1. XML Parsing in Markdown

### Pitfall: Code blocks swallow WXP tags

**Warning sign:** Tests pass on clean input, fail when a workflow includes a ` ```xml ` code block showing WXP syntax examples (like tutorials or this very PRD).

**Mechanism:** The parser naively scans for `<gsd-execute>` and finds one inside a ` ``` ` block — executes it as live code.

**Prevention:** First-pass code-fence detection. Build a list of `[start, end]` byte ranges for all fenced blocks. Token extraction skips any match whose offset falls in a fenced range.

**Phase:** Must be addressed in Phase 1 before any other parser work. Foundational.

---

### Pitfall: Self-closing vs children syntax confusion

**Warning sign:** `<gsd-include path="..." />` works but `<gsd-include path="..."></gsd-include>` silently fails or is double-processed.

**Mechanism:** Regex for self-closing `/>` doesn't match the children form; the children form regex then re-matches the self-closing form.

**Prevention:** Parser must handle both forms explicitly. Test fixture: one of each in the same document.

**Phase:** Phase 1 (parser.ts).

---

### Pitfall: Attribute values containing `>`

**Warning sign:** `<arg string="a > b" />` breaks the tag-end detection.

**Mechanism:** Naive `[^>]*` attribute regex stops at the `>` inside the attribute value.

**Prevention:** Attribute regex must handle quoted values: `(?:"[^"]*"|'[^']*'|[^"'>\s]+)`. No unquoted attribute values with `>` allowed — XSD should enforce this.

**Phase:** Phase 1 (parser.ts). Document in XSD as a constraint.

---

## 2. Resolution Loop

### Pitfall: Infinite loop via circular includes

**Warning sign:** `<gsd-include path="A.md" />` where A.md contains `<gsd-include path="B.md" />` and B.md includes A.md → loop forever.

**Prevention:** Track resolved file paths in the current resolution stack. If a file appears twice in the stack → WxpError "Circular include detected: A.md → B.md → A.md".

**Phase:** Phase 1 (executor.ts or index.ts).

---

### Pitfall: Done-marker leaking into final output

**Warning sign:** LLM receives text with `<gsd-execute done>` tags — looks like documentation but confuses the model.

**Mechanism:** The final strip regex misses a done-marker variant (e.g., `<gsd-execute done="true">` from an attribute change).

**Prevention:** Strip step must be the last thing before returning. Test: assert final output contains zero `<gsd-` substrings (except inside code fences that should be preserved).

**Phase:** Phase 1 (index.ts, strip step). Add assertion to integration tests.

---

### Pitfall: Variable populated after paste tag reads it

**Warning sign:** `<gsd-paste name="x" />` appears before the `<gsd-execute>` that sets `x` — WxpError "Undefined variable: x" even though x is defined later in the file.

**Mechanism:** Paste happens in the same loop iteration as execute; ordering is not guaranteed.

**Prevention:** Resolution loop step 4 (paste) runs AFTER step 3 (execute) — this is correct by design. Enforce: paste step only runs after all execute blocks in the current iteration are done. Document this ordering constraint clearly.

**Phase:** Phase 1 — design the loop correctly from the start. Not fixable retroactively without breaking workflows.

---

## 3. oclif Migration

### Pitfall: Help format change breaks workflow XML

**Warning sign:** A `<shell command="pi-gsd-tools">` with `<arg string="--help" />` in a workflow returns different text after migration — causes condition checks to fail.

**Prevention:** Audit all workflow XML files for `--help` usage before migration. (None expected — workflows call functional commands, not help.) Document the new help format.

**Phase:** Phase 2, pre-migration audit step.

---

### Pitfall: Exit code changes breaking `<suppress-errors />`

**Warning sign:** A `<shell>` with `<suppress-errors />` was relying on commander.js exiting with code 1 for missing args; oclif exits with code 2. Condition checks on `$?` (if any) break.

**Prevention:** WXP shell runner checks for non-zero exit regardless of code value. Don't check specific exit codes in WXP XML — only presence/absence of `<suppress-errors />` matters.

**Phase:** Phase 2. Verify WXP shell.ts uses `exitCode !== 0` not `exitCode === 1`.

---

### Pitfall: Flag prefix changes (`--no-` flags)

**Warning sign:** commander.js auto-generates `--no-<flag>` negations; oclif does not by default.

**Prevention:** Audit existing `pi-gsd-tools` flag usage in workflow files. For each `--no-X` flag found, explicitly add the negation in oclif.

**Phase:** Phase 2, during command-by-command migration.

---

## 4. Security

### Pitfall: Argument injection via variable content

**Warning sign:** A variable set by `<shell>` stdout contains a space or shell metacharacter, and is then used as `<arg name="varname" />` in another shell call — the content becomes multiple arguments.

**Mechanism:** Even with `execFileSync` (not `execSync`), arguments are passed as an array. A variable value of `"foo bar"` passed as one array element is safe — it's one argument. But if the workflow author uses `wrap='"'` and the value contains `"`, the wrapped string could break.

**Prevention:** The `wrap` attribute must only wrap the entire value in quotes for contexts where the CLI expects a quoted string (like `pi-gsd-tools init execute-phase "16"`). Document: `wrap` does NOT shell-escape the value. For values from shell output, use without `wrap` — `execFileSync` handles array args safely.

**Phase:** Phase 1 (shell.ts) + documentation in XSD.

---

### Pitfall: PATH manipulation

**Warning sign:** A project-level `.env` or shell init sets `PATH` to include a directory containing a malicious `git` binary. WXP runs `git` → executes the malicious binary.

**Prevention:** `execFileSync` resolves the binary at execution time from `PATH`. WXP should use `which <command>` during extension startup to snapshot absolute paths for each allowlisted binary, then use absolute paths in execFileSync. Or document that users are responsible for PATH security (acceptable for v1).

**Phase:** Phase 1, security.ts. Note as a known limitation if not implementing snapshot approach.

---

## 5. TypeScript `any` Elimination

### Pitfall: `FrontmatterObject` ripple effect

**Warning sign:** Changing `Record<string, any>` to a recursive type breaks 40+ call sites that were relying on structural `any` compatibility.

**Mechanism:** `FrontmatterObject` is used throughout `src/lib/frontmatter.ts` and imported by other modules. Making it strict causes type errors at every access point.

**Prevention:** Define a recursive `YamlValue` type first:
```typescript
type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };
type FrontmatterObject = Record<string, YamlValue>;
```
Then fix callers one-by-one. Use `unknown` + type guards at JSON.parse boundaries instead of `any`.

**Phase:** Phase 4, but can start immediately as a parallel track (frontmatter.ts is independent of WXP).

---

### Pitfall: `output.ts` AnyValue = any

**Warning sign:** `type AnyValue = any` in output.ts is used in the JSONPath formatting path — making it `unknown` forces type guards at every consumer.

**Prevention:** Use `unknown` with runtime narrowing, or use the specific Zod-inferred types for toon output. Don't make it `AnyValue = unknown` blindly — that just shifts the errors downstream.

**Phase:** Phase 4.

---

## 6. Harness Distribution

### Pitfall: Partial write on interrupted copy

**Warning sign:** Extension host crashes mid-copy → half-written file in `<project>/.pi/gsd/` that passes the "file exists" check on next start, silently running broken workflow.

**Prevention:** Write to a temp file first, then `fs.renameSync()` (atomic on same filesystem). Check file size/hash after copy.

**Phase:** Phase 5 (harness distribution code in gsd-hooks.ts).

---

### Pitfall: Old symlinks not cleaned up

**Warning sign:** After removing `ensureHarnessSymlink()`, existing projects still have symlinks. The "file exists" check passes (symlink exists) but the target may be broken after a package update moves the harness directory.

**Prevention:** In the copy-on-first-run check: if `fs.lstatSync()` shows a symlink at the expected path, remove it and copy the real file. Log a one-time notification: "Migrated harness symlink to local copy."

**Phase:** Phase 5. Critical for backwards compatibility with v1.12.x installations.

---

### Pitfall: Windows path separators in file list

**Warning sign:** Harness files copied correctly on Linux/Mac, but path comparison `existingFiles.includes(harnessList[i])` fails on Windows due to `\\` vs `/`.

**Prevention:** Normalize all paths to POSIX separators before comparison. Use `path.posix.normalize()` or replace `\\` with `/` in all harness path operations.

**Phase:** Phase 5. Note: pi runs primarily on Linux/Mac, but worth fixing for correctness.
