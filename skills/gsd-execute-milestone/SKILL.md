---
name: gsd-execute-milestone
description: Execute all planned phases in the milestone — scope guardian, UAT gates, recovery loop
---

<objective>
Execute every pending phase in the current milestone in a single orchestrated session.

**Opens with one mode question** (interactive vs silent), then works through all phases that have plans but aren't complete yet.

**Per-phase flow:**
1. Scope pre-check — lightweight alignment against REQUIREMENTS.md
2. Execute phase
3. Scope post-check — full audit of deliverables vs requirements
4. Verify / UAT
5. Gate check — UAT pass rate, context remaining, scope status
6. On failure: --repair → self-correct → ask (interactive) or HANDOFF.md (silent)
7. Checkpoint commit

**Always operates in an isolated worktree** — will offer to create one if not already in a worktree.

**Creates/Updates:**
- Phase SUMMARY.md, UAT.md, VERIFICATION.md per phase
- `.planning/HANDOFF.md` on hard stop
- `.planning/STATE.md` checkpointed after each phase

**After this command:** Run `/gsd-audit-milestone` to review before archiving.
</objective>

<execution_context>
@.pi/gsd/workflows/execute-milestone.md
@.pi/gsd/references/ui-brand.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/STATE.md
</execution_context>

<context>
Optional flags:
- `--from N` — Start from phase N (skip earlier completed phases)
- `--silent` — Skip mode question, run in silent mode
- `--interactive` — Skip mode question, run in interactive mode
- `--uat-threshold N` — Minimum UAT pass rate % to continue (default: 80)
- `--no-worktree-check` — Skip worktree isolation check

Phase execution queue, progress, and state are resolved at runtime via `pi-gsd-tools roadmap analyze` and `pi-gsd-tools progress json`.
</context>

<process>
Execute the execute-milestone workflow from @.pi/gsd/workflows/execute-milestone.md end-to-end.
Ask the mode question first. Preserve all gates: scope guardian (pre + post), UAT gate, context gate, recovery loop.
Never skip the HANDOFF.md on unrecoverable stop.
</process>
