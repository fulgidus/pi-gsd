# execute-milestone workflow

Execute all planned phases in the current milestone, with scope guardian, UAT gates, and configurable recovery behaviour.

---

## Worktree Check (always first)

Check whether we are operating in a git worktree:
```
git worktree list
```

If **not** in an isolated worktree:
> "Large-scale milestone execution should run in an isolated worktree to protect your main branch. Create one now? (y / skip)"

If yes: `Skill(skill="gsd-new-workspace", args="milestone-exec")` then continue from the new worktree.
If skip: warn once, proceed.

---

## Mode Selection (step 1)

Ask the user ONE question:

> **"How should I behave when I hit a doubt, error, or scope deviation?"**
>
> - **Interactive** — Stop and ask me; I'll guide you through it
> - **Silent** — Try to self-correct autonomously; only surface unrecoverable blockers

Store as `MODE` (interactive | silent). Do not ask again.

---

## Phase Discovery

```
pi-gsd-tools roadmap analyze --raw
pi-gsd-tools progress json --raw
```

Build the execution queue: phases that have ≥1 PLAN.md and status ≠ Complete. Order by roadmap sequence.

If queue is empty: "All phases are already complete. Run /gsd-audit-milestone."

---

## Per-Phase Execution Loop

For each pending phase `N`:

### A. Scope Pre-check (lightweight)

Read:
- `.planning/REQUIREMENTS.md`
- Phase goal from ROADMAP.md

Ask the LLM: "Does executing this phase risk deviating from active requirements? Rate risk: low / medium / high."

- **low**: continue silently
- **medium**: log in scope-log, continue
- **high + interactive**: surface to user before executing
- **high + silent**: log prominently, continue, flag in final report

### B. Execute Phase

```
Skill(skill="gsd-execute-phase", args="${N}")
```

### C. Scope Post-check (full audit)

After execution, compare:
- Phase SUMMARY.md deliverables
- REQUIREMENTS.md entries that this phase was meant to address

Check for:
- Undelivered must-haves
- New scope introduced (files modified outside phase scope)
- Requirement entries marked complete that weren't targeted

Emit audit result as `SCOPE_STATUS` (clean | drift | violation).

- **clean**: continue
- **drift**: log + warn, continue
- **violation + interactive**: stop, surface details, ask how to proceed
- **violation + silent**: attempt `pi-gsd-tools validate health --repair`, then try one self-correction pass; if still failing, write HANDOFF.md and stop

### D. Verify

```
Skill(skill="gsd-verify-work", args="${N}")
```

Read UAT result. Compute pass rate = passing / total UAT items.

### E. Gate Check

| Condition | Interactive | Silent |
|-----------|-------------|--------|
| UAT pass rate < 80% | Ask: fix gaps now or continue? | Self-correct once → re-verify → HANDOFF.md if still failing |
| Context remaining < 20% | Warn + ask: stop or continue? | Write HANDOFF.md, stop |
| SCOPE_STATUS = violation | Surface details, ask | Attempt repair loop → HANDOFF.md |
| All gates pass | Continue | Continue |

### F. Recovery Loop (when triggered)

```
1. pi-gsd-tools validate health --repair
2. Self-correct: identify root cause, patch, re-run verification
3. Re-check gates
4. If passing → continue
5. If still failing:
   - Interactive: ask user how to resolve, loop from step 2
   - Silent: write HANDOFF.md, stop
```

### G. Checkpoint

```
pi-gsd-tools state update current_phase ${N}
pi-gsd-tools state update last_activity $(date -u +%Y-%m-%d)
```

Commit: `git add .planning/ && pi-gsd-tools commit "chore: complete phase ${N}"`

Announce: `✓ Phase ${N} complete (UAT: ${pass_rate}%)`

---

## HANDOFF.md Format

When writing a HANDOFF.md (`.planning/HANDOFF.md`):

```markdown
# Milestone Execution Handoff

**Stopped at:** Phase ${N}
**Reason:** ${stop_reason}
**Time:** ${ISO_timestamp}

## State at Stop
- Phases complete: ${completed_list}
- Current phase: ${N} — ${status}
- UAT pass rate: ${pass_rate}%

## Scope Notes
${scope_log}

## How to Resume
Run: /gsd-execute-milestone
Or resume from phase N: /gsd-execute-phase ${N} --gaps-only
```

---

## Final Summary

```
━━ execute-milestone complete ━━━━━━━━━━━━━━━━━━━
✓ Phases executed: [list]
📊 UAT pass rate:  [avg]%
⚠ Scope flags:    [count]
↳ Next: /gsd-audit-milestone
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Route to `/gsd-audit-milestone` when all phases are complete and clean.
