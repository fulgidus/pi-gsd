---
plan: 05-01
status: complete
completed_at: 2026-04-06
---

## Summary

Wave 1: copy-on-first-run + symlink migration.

### Delivered

- `copyHarness(src, dest)` function: recursive copy with symlink detection. Symlinks replaced with real copies (HRN-03). Missing files copied (HRN-01). Real files skipped (never overwritten).
- `session_start` updated: calls `copyHarness()` instead of `ensureHarnessSymlink()`. Notifies on symlink replacement.
- `ensureHarnessSymlink()` removed from `pi-gsd-hooks.ts` (HRN-04).
- Unused imports (`rmSync`, `symlinkSync`, `statSync`) removed.

### Requirements Covered

- HRN-01: copy-on-first-run, never overwrite existing real files ✓
- HRN-03: symlink detection + replacement with real copies ✓
- HRN-04: `ensureHarnessSymlink()` fully removed ✓

### Verification

- `grep -rn "ensureHarnessSymlink" src/ .gsd/` → 0 matches ✓
- `npm run typecheck` → zero errors ✓
