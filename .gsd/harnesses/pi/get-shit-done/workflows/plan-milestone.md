# plan-milestone workflow

Plan all unplanned phases in the current milestone in a single orchestrated session.

## Mode Selection (step 0 — always first)

Before any planning, ask the user ONE question:

> **"Can I ask you questions during planning, or should I churn through all phases silently and flag doubts at the end?"**
>
> Options:
> - **Interactive** — I'll ask targeted questions per phase when I hit real ambiguity
> - **Silent** — Plan everything autonomously; collect flags for review at the end

Store the answer as `MODE` (interactive | silent). Do not ask again for the rest of the session.

---

## Phase Discovery

```
pi-gsd-tools roadmap analyze --raw
pi-gsd-tools state json --raw
```

Identify all phases that have **no PLAN.md files** in their phase directory.
Skip phases that are already Complete or already have plans.
Work in roadmap order.

---

## Per-Phase Planning Loop

For each unplanned phase `N`:

### 1. Pre-check (lightweight scope alignment)

Read:
- `.planning/REQUIREMENTS.md`
- The phase entry from ROADMAP.md (goal + success criteria)

Check: Does the phase goal align with active requirements? Flag any mismatch.
If critical misalignment found and `MODE=interactive`: surface it, ask before continuing.
If `MODE=silent`: note the flag, continue.

### 2. Plan the phase

Invoke `Skill(skill="gsd-plan-phase", args="${N} --skip-research")` unless:
- Research directory is empty or absent → drop `--skip-research`
- User in interactive mode requested research → invoke without flag

In **interactive mode**: the gsd-plan-phase skill will ask normally.
In **silent mode**: append `--auto` to suppress discussion questions.

### 3. Checkpoint

After each phase plan is committed:
```
pi-gsd-tools state update current_phase ${N}
```
Announce: `✓ Phase ${N} planned — ${plans_created} plan(s) created`

Check context remaining. If < 25%: stop, emit summary of planned/remaining, recommend `/gsd-plan-milestone` to continue.

---

## Final Summary

```
━━ plan-milestone complete ━━━━━━━━━━━━━━━━━━━━━━
✓ Planned: [list of phases]
⚠ Flags:   [any scope/ambiguity notes]
↳ Next: /gsd-execute-milestone
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If flags exist: present them for user review before suggesting execute-milestone.
