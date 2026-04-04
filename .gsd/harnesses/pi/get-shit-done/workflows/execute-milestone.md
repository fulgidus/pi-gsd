# execute-milestone workflow

Execute all planned phases in the current milestone with scope guardian, UAT gates, and configurable recovery.

---

## Worktree Check (always first)

```bash
git worktree list
```

If not in an isolated worktree:
> "Large-scale milestone execution should run in an isolated worktree to protect your main branch. Create one now? (y/n, default: y)"

If yes: `Skill(skill="gsd-new-workspace", args="milestone-exec")`, then continue in the new worktree.
If no: warn once, proceed on current branch.

---

## Mode Selection (step 1 — always second)

Ask the user ONE binary question:

> **"How should I behave when I hit a doubt, error, or scope deviation?"**
>
> - **Interactive** — Stop and ask me; I'll guide you through it
> - **Silent** — Try to self-correct; only surface unrecoverable blockers

Store as `MODE` (interactive | silent). Do not ask again.

---

## Phase Discovery

```bash
pi-gsd-tools roadmap analyze --raw
pi-gsd-tools progress json --raw
```

Build execution queue: phases with ≥1 PLAN.md and status ≠ Complete, in roadmap order.

If queue is empty: "All phases are already complete. Run /gsd-audit-milestone." Stop.

---

## Per-Phase Execution Loop

For each pending phase `N`:

### A. Scope Pre-check (lightweight, one LLM call)

Read:
- `.planning/REQUIREMENTS.md`
- Phase goal + success criteria from ROADMAP.md

Prompt (internal): *"Does executing this phase risk implementing anything not covered by active requirements, or conflict with what previous phases delivered? Rate: low / medium / high. One sentence reason."*

- **low** — continue silently
- **medium** — log in scope-log, continue
- **high + interactive** — surface to user, ask: proceed / adjust phase goal / stop
- **high + silent** — log prominently, continue, include in final report

### B. Execute Phase

```
Skill(skill="gsd-execute-phase", args="${N}")
```

### C. Scope Post-audit (full, one LLM call)

Read new SUMMARY.md files from the phase directory.

Check:
1. **Undelivered must-haves** — PLAN.md `must_haves` entries absent from SUMMARY
2. **Scope creep** — files modified that are outside this phase's stated scope
3. **Requirement drift** — work done that has no matching REQUIREMENTS entry

Classify result as `SCOPE_STATUS`:
- **clean** — continue
- **drift** — log + warn, continue
- **violation** — trigger recovery (see §F)

### D. Verify

```
Skill(skill="gsd-verify-work", args="${N}")
```

Compute UAT pass rate = passing items / total items.
Default threshold: **80%**. Override with `--uat-threshold N`.

### E. Gate Check

| Condition | Interactive | Silent |
|-----------|-------------|--------|
| UAT pass rate < threshold | Ask: fix gaps now or continue? | → Recovery loop |
| Context remaining < 20% | Warn, ask: stop or continue? | → Write HANDOFF, stop |
| SCOPE_STATUS = violation | Surface details, ask | → Recovery loop |
| All gates pass | Continue to checkpoint | Continue to checkpoint |

### F. Recovery Loop

When triggered:

```
1. pi-gsd-tools validate health --repair
2. Self-correct: identify root cause, patch, re-run verification
3. Re-check gates
4. Gates pass → continue to checkpoint
5. Still failing:
   - Interactive: explain issue, ask user how to resolve, loop from step 2
   - Silent: write HANDOFF files (see §G), stop
```

### G. Hard Stop — HANDOFF Files

On unrecoverable stop, write two files matching original GSD pause-work convention:

**`.planning/HANDOFF.json`** (machine-readable, consumed by `/gsd-resume-work`):
```json
{
  "stopped_at": "ISO-timestamp",
  "phase": "N",
  "phase_name": "phase name",
  "stop_reason": "uat_failure | scope_violation | context_exhausted | unrecoverable_error | audit_gaps_found | audit_no_result",
  "retry_attempts": 0,
  "gap_phases_executed": [],
  "remaining_gaps": [],
  "uat_pass_rate": 75,
  "scope_status": "violation",
  "phases_completed": ["1", "2", "3"],
  "phases_remaining": ["N", "N+1"],
  "scope_log": ["note 1", "note 2"],
  "next_action": "Run /gsd-execute-milestone --from N to resume"
}
```

**`.planning/phases/NN-name/.continue-here.md`** (human-readable):
```markdown
---
phase: N
status: stopped
stop_reason: [reason]
last_updated: [timestamp]
---

## What happened
[Clear explanation of why execution stopped]

## State at stop
- UAT pass rate: X%
- Scope status: [clean/drift/violation]
- Scope notes: [any flags]

## How to resume
Run: /gsd-execute-milestone --from N
Or fix the specific issue first: [specific suggestion]
```

### H. Checkpoint (on success)

```bash
pi-gsd-tools state update current_phase ${N}
pi-gsd-tools state update last_activity $(date -u +%Y-%m-%d)
pi-gsd-tools commit "chore: complete phase ${N}" --files .planning/
```

Announce: `✓ Phase ${N} complete — UAT: ${pass_rate}%  Scope: ${scope_status}`

---

## After All Phases — Mode Split

### Interactive mode

Do NOT auto-invoke the lifecycle. Surface the execution summary and hand back to the user:

```
━━ execute-milestone: all phases done ━━━━━━━━━━━━
✓ Phases:   ${done}/${total} complete
📊 Avg UAT: ${avg_uat}%
⚠ Scope:   ${scope_flag_count} flag(s) (details above)

Next: /gsd-audit-milestone when you are ready to review
      and close the milestone.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Stop. The user owns the audit decision.

---

### Silent mode — Auto Lifecycle

Only in silent mode: automatically invoke audit → complete → cleanup.

Display transition banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 All phases complete → Starting lifecycle: audit → complete → cleanup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Step 1 — Audit

```
Skill(skill="gsd-audit-milestone")
```

Read `AUDIT_STATUS` from the audit result file.

**If no result / malformed:**
→ Write HANDOFF (§G), stop.
Message: "Audit did not produce a result. Run /gsd-audit-milestone manually."

**If `passed`:**
Display `Audit ✅ passed` and proceed to Step 2.

**If `gaps_found`:**
Critical requirements are unsatisfied. Do NOT proceed to complete-milestone yet.

Read `config.workflow.auto_retry_audit` (default: `true`) and
`config.workflow.auto_retry_audit_budget` (default: `1`).

**If `auto_retry_audit` is true and budget > 0:**

Display:
```
━━ AUDIT: gaps found — attempting autonomous fix ━━
[gap list from audit file]
Retry budget: ${budget} attempt(s) remaining
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Run the gap-closure loop (decrement budget each cycle):

```
1. Skill(skill="gsd-plan-milestone-gaps")
   — creates gap-closure phase plans targeting the unsatisfied requirements

2. For each gap-closure phase produced:
   Skill(skill="gsd-execute-phase", args="${gap_phase} --gaps-only")

3. Skill(skill="gsd-audit-milestone")
   — re-audit with fresh eyes
```

After re-audit:
- **`passed`** → proceed to Step 2 (complete-milestone) ✅
- **`tech_debt`** → note it, proceed to Step 2 ✅
- **`gaps_found` and budget > 0** → loop again
- **`gaps_found` and budget exhausted** → enriched HANDOFF (see below), stop

**If `auto_retry_audit` is false OR budget exhausted after retries:**

Display:
```
━━ AUDIT: gaps found — milestone NOT complete ━━━━
[gap list]

Retry attempts made: ${attempts}
What was tried:      [gap phases planned and executed]
Still unsatisfied:   [remaining requirement gaps]

Fix path:
  1. /gsd-plan-milestone-gaps   — plan gap-closure phases
  2. /gsd-execute-milestone     — re-run execution
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Write HANDOFF with:
- `stop_reason: "audit_gaps_found"`
- `retry_attempts`: how many cycles were run
- `gap_phases_executed`: which phases were planned and executed
- `remaining_gaps`: the unsatisfied requirements still open

Stop.

**If `tech_debt`:**
Non-critical. Display the tech debt summary, then proceed to Step 2 with a note.

#### Step 2 — Complete Milestone

```
Skill(skill="gsd-complete-milestone", args="${milestone_version}")
```

Verify archive file produced:
```bash
ls .planning/milestones/v${milestone_version}-ROADMAP.md 2>/dev/null || true
```
If absent → Write HANDOFF, stop. Message: "complete-milestone did not produce archive files."

#### Step 3 — Cleanup

```
Skill(skill="gsd-cleanup")
```

Cleanup handles its own dry-run and user confirmation internally.

---

## Worktree Merge (both modes, after lifecycle or summary)

If running in an isolated worktree, ask:
> "Merge this worktree back to your main branch? (y/n, default: y)"

If yes:
```bash
git checkout main
git merge --no-ff milestone-exec -m "feat: complete milestone ${milestone_version}"
git worktree remove milestone-exec
```

If no: leave the worktree open. Tell the user how to merge manually.

---

## Final Banner (silent mode only, after full lifecycle)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► EXECUTE-MILESTONE ▸ COMPLETE 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Milestone: ${milestone_version} — ${milestone_name}
 Phases:    ${done}/${total} complete
 Avg UAT:   ${avg_uat}%
 Lifecycle: audit ✅ → complete ✅ → cleanup ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
