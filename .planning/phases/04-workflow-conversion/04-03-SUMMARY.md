---
plan: 04-03
status: complete
completed_at: 2026-04-06
---

## Summary

Converted all remaining 53 workflows + added do-not-update infrastructure.

### Delivered

- All 53 remaining workflow .md files in `.gsd/harnesses/pi/get-shit-done/workflows/` now have `<gsd-version v="1.12.4" />` as first line (Category A conversion — pure instruction files, no bash init)
- `src/wxp/index.ts`: `readWorkflowVersionTag(content)` exported — reads version + `doNotUpdate` flag from workflow content. Used by Phase 5 harness copy-on-first-run.

### Requirements Covered

- WFL-03: all remaining workflow files converted (version tag added) ✓
- WFL-04: all 58 workflows now have `<gsd-version v="1.12.4" />` ✓
- WFL-05: `do-not-update` flag recognized by `readWorkflowVersionTag()` ✓

### Verification

- `grep -L "<gsd-version" .gsd/harnesses/pi/get-shit-done/workflows/*.md | grep -v ".bak"` → 0 files ✓
- `npm run typecheck` → zero errors ✓
- `npm test` → 93/93 passed ✓
