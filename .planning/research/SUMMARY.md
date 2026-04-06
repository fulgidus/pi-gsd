# Research Summary: pi-gsd WXP Milestone

**Synthesized:** 2026-04-06
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Stack Additions

| Addition | Version | Why |
|---|---|---|
| `@oclif/core` | ^4.22 | Typed CLI commands, class-based, replaces commander.js |
| `vitest` | ^2.x (4.1.2) | TypeScript-native tests, no config, tsup-compatible |
| Custom XML lexer | N/A (in-tree) | Markdown-mixed XML; full XML parsers can't handle it |
| XSD 1.1 schema | N/A (authored) | IDE auto-complete; no runtime dep |
| Zod (expand) | ^3.x (existing) | All WXP types via `z.infer<>` — zero hand-written interfaces |

**Remove:** `commander` npm package after oclif migration completes.

---

## Feature Table Stakes (must ship)

**WXP Engine:**
- Code-fence skip (prevents processing WXP tags inside ` ``` ` blocks)
- `<gsd-arguments>` two-pass parser (flags first, then positionals, greedy last string)
- `<shell>` execution via `execFileSync` with allowlist + 30s timeout
- `<if>/<equals>/<starts-with>` conditional blocks
- `<string-op op="split">` string manipulation
- `<gsd-paste>` variable injection
- Variable store with collision detection + owner-prefix disambiguation
- Resolution loop with done-markers + 50-iteration limit
- Total-crash failure with full state dump notification
- Security: trusted-path enforcement + shell allowlist

**CLI:** All existing commands migrated to typed oclif classes; `--help` auto-generated; `wxp` subcommand group

**Workflows:** `execute-phase.md` pilot → all high-traffic → all remaining

**Types:** `FrontmatterObject` → `YamlValue` recursive type; `output.ts` AnyValue removed; all `eslint-disable no-explicit-any` comments gone

**Harness:** Copy-on-first-run; version-aware update prompts; symlink detection + migration; `<gsd-version>` tag support

---

## Watch Out For

**Critical path risks:**

1. **Code-fence skipping** — must be the first thing built in the parser; every other parser feature depends on it being correct. Test with a document that has WXP tags inside ` ```xml ` blocks.

2. **Resolution loop ordering** — paste runs after execute in the same loop iteration by design. Getting this wrong causes "undefined variable" errors for correctly-written workflows. Build and test the loop before any individual operator.

3. **Circular include detection** — without it, a malformed workflow hangs the context event forever. Add the stack-based detector on day one of Phase 1.

4. **Symlink migration in Phase 5** — existing v1.12.x installations have symlinks. The copy-on-first-run check must detect and replace them, not skip them. Test on a project that was installed with v1.12.x before v2.0.

5. **oclif exit code changes** — WXP shell.ts must check `exitCode !== 0`, not `exitCode === 1`. Verify before Phase 2 ships.

6. **FrontmatterObject ripple** — changing from `any` to `YamlValue` touches 40+ call sites. Do Phase 4 as a focused burst, not mixed into other phases.

---

## Build Order Recommendation

```
Phase 1: WXP Foundation
  → schema.ts → variables.ts → security.ts → parser.ts
  → shell.ts → conditions.ts → string-ops.ts → arguments.ts → paste.ts
  → executor.ts → index.ts → integration into gsd-hooks.ts
  → vitest unit tests + integration tests

Phase 2: oclif Migration (can start in parallel after Phase 1 begins)
  → @oclif/core installed
  → Commands migrated one-by-one (highest-traffic first)
  → commander.js removed
  → verify all workflow XML shell calls still work

Phase 3: Workflow Conversion (requires Phase 1 complete)
  → execute-phase.md pilot (backup first)
  → plan-phase, discuss-phase, new-project, new-milestone
  → all remaining workflows
  → <gsd-version> tags added

Phase 4: Type Cleanup (can run in parallel with Phase 2)
  → FrontmatterObject → YamlValue
  → output.ts AnyValue removed
  → all eslint-disable no-explicit-any removed
  → CI lint rule: no-explicit-any: error

Phase 5: Harness Distribution (independent, can run after Phase 1)
  → copy-on-first-run in gsd-hooks.ts
  → symlink detection + migration
  → version-aware update prompts (y/n/pick/diff)
  → ensureHarnessSymlink() deleted
  → pi-gsd-settings.json schema published
```

---

## Key Unknowns / Questions for User

1. **Phase ordering** — Phases 2 and 4 are independent of Phase 1 (after it starts). Should they be sequenced or truly parallel in execution? (Config setting: parallelization = true suggests parallel.)

2. **Workflow backup strategy** — The PRD says `cp <name>.md <name>.md.bak`. Should backups be committed to git or `.gitignore`d? Committed backups add noise; gitignored backups lose the rollback trail.

3. **`pi-gsd-settings.json` scope** — Is this a project-level file or a global user file (`~/.gsd/pi-gsd-settings.json`)? The PRD implies project-level (`<project>/.pi/gsd/pi-gsd-settings.json`) for security config.
