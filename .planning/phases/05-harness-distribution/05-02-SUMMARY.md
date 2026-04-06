---
plan: 05-02
status: complete
completed_at: 2026-04-06
---

## Summary

Wave 2: version-aware update detection (HRN-02).

### Delivered

- Version comparison block in `session_start`: reads `package.json` version, compares against project harness files' `<gsd-version>` tags using `readWorkflowVersionTag()`.
- Files with `do-not-update` flag are silently skipped.
- Outdated files trigger a `ctx.ui.notify()` listing the files and the command to run (`pi-gsd-tools harness update [y|n|pick|diff]`).
- Sample set: `workflows/execute-phase.md`, `workflows/plan-phase.md`.

### Requirements Covered

- HRN-02: version comparison + update prompt with y/n/pick/diff options ✓
