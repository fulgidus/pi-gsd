---
plan: 05-03
status: complete
completed_at: 2026-04-06
---

## Summary

Wave 3: settings schema + global/project settings loading.

### Delivered

- `src/schemas/pi-gsd-settings.schema.json` — JSON Schema (draft-07) covering `trustedPaths`, `untrustedPaths`, `shellAllowlist`, `shellBanlist`, `shellTimeoutMs`. Full descriptions, defaults, examples.
- Context event updated: loads `~/.gsd/pi-gsd-settings.json` (global) and `<cwd>/.pi/gsd/pi-gsd-settings.json` (project). Project overrides global. Merged settings used for WXP `wxpSecurity` config.
- `shellAllowlist` from both settings files extends (not replaces) the default allowlist.
- `shellTimeoutMs` uses project override > global override > 30000ms default.

### Requirements Covered

- HRN-05: `src/schemas/pi-gsd-settings.schema.json` ✓
- HRN-06: global `~/.gsd/pi-gsd-settings.json` loaded in context event ✓
- HRN-07: project `.pi/gsd/pi-gsd-settings.json` overrides global ✓

### Verification

- `npm run typecheck` → zero errors ✓
- `npm test` → 93/93 passed ✓
