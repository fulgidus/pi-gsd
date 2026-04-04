# pi-gsd TODO

Improvements confirmed after analysis session on 2026-04-03.
Format compatibility with original GSD v1.30.0 `.planning/` data is a hard constraint on all items.

---

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done

---

## [x] #1 — Fix skill execution_context paths

Skills were referencing `@.agent/get-shit-done/…`. Migrated to `@.pi/gsd/…` to match
the `subdir: "gsd"` install target in postinstall. Confirmed 0 remaining `.agent/` refs.

---

## [x] #2a — Hook registration for pi (postinstall)

`postinstall.js` installs `.gsd/extensions/gsd-hooks.ts` into `.pi/extensions/` and
updates `.pi/settings.json` `extensions` array. Auto-discovered by pi — no manual wiring.
Source: `.gsd/extensions/gsd-hooks.ts`

---

## [x] #2b — `/gsd-setup-pi` skill

`skills/gsd-setup-pi/SKILL.md` exists. Fallback for bun/manual installs that skip postinstall.

---

## [x] #3 — Pi harness entry in HARNESS_CONFIG

`pi` key added to `HARNESS_CONFIG` in `src/lib/model-profiles.ts`.
Uses `AGENTS.md` output (not `CLAUDE.md`), `/gsd-` cmdPrefix, pi branding.

---

## [x] #4 — Toon output in skills (context optimization)

`/gsd-progress`, `/gsd-stats`, `/gsd-health` skills updated to use `--output toon`.
Decision: comparable outputs, harness-neutral data, users can switch freely.

---

## [~] #5 — Runtime validation with Zod

`src/lib/schemas.ts` (286 lines) defines Zod schemas for all `.planning/` structures:
STATE.md, ROADMAP.md phases, PLAN.md, UAT.md, config.json.

Schemas imported by:
- `src/lib/config.ts` — `PlanningConfig` type
- `src/lib/verify.ts` — `PlanningConfigSchema` in `validate health`

**Remaining:**
- [ ] Wire schemas into more validators — only `config.json` is fully validated; STATE.md,
  PLAN.md frontmatter, ROADMAP phases still parsed without schema enforcement
- [ ] Smarter `--repair`: use schemas to patch missing/wrong fields, not just report them
- [ ] Export unified type map so all modules use `z.infer<>` instead of loose `Record<>`

---

## [~] #6 — TypeScript types for .planning/ structures

Zod schemas in `schemas.ts` export inferred types. Remaining loose typing:

- [ ] `src/lib/config.ts` — 2 remaining `any`
- [ ] `src/lib/core.ts` — 3 remaining `any`
- [ ] `src/lib/frontmatter.ts` — 6 remaining `any`
- [ ] `src/lib/init.ts` — 2 remaining `any`
- [ ] `src/lib/phase.ts` — 1 remaining `any`
- [ ] `src/lib/profile-output.ts` — 1 remaining `any`
- [ ] `src/lib/profile-pipeline.ts` — 2 remaining `any`
- [ ] `src/lib/roadmap.ts` — 1 remaining `any`
- [ ] `src/lib/state.ts` — 2 remaining `any`
- [ ] `src/lib/template.ts` — 1 remaining `any`
- [ ] `src/lib/uat.ts` — 2 remaining `any`
- [ ] `src/lib/workstream.ts` — 1 remaining `any`

---

## [x] #7 — Pi session history ingestion for `/gsd-profile-user`

`profile-pipeline.ts` detects `--harness pi`, reads `~/.pi/agent/sessions/`,
lists pi sessions first as priority. Both harness types auto-detected.

---

## [x] Instant commands (gsd-hooks.ts)

- [x] `/gsd-progress` — formatted output + `setEditorText()` pivot affordance
- [x] `/gsd-stats` — formatted output + pivot
- [x] `/gsd-health [--repair]` — formatted health output
- [x] `/gsd-help` — instant command list
- [x] `/gsd-next` — deterministic auto-advance, zero LLM, pre-fills editor

---

## Completed (shipped)

- [x] Fix `/gsd:` → `/gsd-` prefix in all user-facing hook messages
- [x] Add pi harness to postinstall (installs to `.pi/`)
- [x] Add `.pi/AGENTS.md` and `.pi/settings.json` project config
- [x] Switch CI to npm Trusted Publishing (OIDC)
- [x] Fix CI Node.js 20 deprecation (checkout@v6, setup-node@v6)
- [x] Rewrite README with feature comparison table
- [x] Ralphi initialized (AGENTS.md, .ralphi/config.yaml, pre-commit hook)
