---
name: gsd-stats
description: Display project statistics - phases, plans, requirements, git metrics, and timeline
---

<objective>
Display comprehensive project statistics including phase progress, plan execution metrics, requirements completion, git history stats, and project timeline.
</objective>

<execution_context>
@.pi/get-shit-done/workflows/stats.md
</execution_context>

<process>
1. Run: `gsd-tools stats --output toon`
   - If successful, present the toon output to the user.
   - If the command fails or toon output is unavailable, fall back to: `gsd-tools stats` (plain JSON output).

2. Execute the stats workflow from @.pi/get-shit-done/workflows/stats.md end-to-end.
</process>
