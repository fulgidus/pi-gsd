---
name: gsd-plan-milestone
description: Plan all unplanned phases in the current milestone — one interview, then churn
---

<objective>
Plan every unplanned phase in the current milestone in a single orchestrated session.

**Opens with one mode question** (interactive vs silent), then works through all unplanned phases in roadmap order. Each phase gets a lightweight scope pre-check against REQUIREMENTS.md before planning begins.

**Creates:**
- PLAN.md files for every unplanned phase
- Scope alignment notes (if any deviations detected)
- Checkpoint commits after each phase

**After this command:** Run `/gsd-execute-milestone` to execute all planned phases.
</objective>

<execution_context>
@.pi/gsd/workflows/plan-milestone.md
@.pi/gsd/references/ui-brand.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
</execution_context>

<context>
Optional flags:
- `--from N` — Start planning from phase N (skip already-planned phases before N)
- `--silent` — Skip mode question, run in silent mode
- `--interactive` — Skip mode question, run in interactive mode

Phase list, state, and plan status are resolved at runtime via `pi-gsd-tools roadmap analyze` and `pi-gsd-tools progress json`.
</context>

<process>
Execute the plan-milestone workflow from @.pi/gsd/workflows/plan-milestone.md end-to-end.
Ask the mode question first. Preserve all gates (scope pre-check, planning, checkpoint, context limit).
</process>
