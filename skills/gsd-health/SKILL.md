---
name: gsd-health
description: Diagnose planning directory health and optionally repair issues
---

<objective>
Validate `.planning/` directory integrity and report actionable issues. Checks for missing files, invalid configurations, inconsistent state, and orphaned plans.
</objective>

<execution_context>
@.pi/get-shit-done/workflows/health.md
</execution_context>

<process>
1. Run: `gsd-tools validate health --output toon`
   - If successful, present the toon output to the user.
   - If the command fails or toon output is unavailable, fall back to: `gsd-tools validate health` (plain JSON output).

2. Execute the health workflow from @.pi/get-shit-done/workflows/health.md end-to-end.
   Parse --repair flag from arguments and pass to workflow.
</process>
