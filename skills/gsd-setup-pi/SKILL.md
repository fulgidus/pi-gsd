---
name: gsd-setup-pi
description: Check and repair GSD hook wiring for pi. Use when postinstall was skipped (bun install) or to verify extension health. Routes to /gsd-new-project for first-time setups.
---

<objective>
Verify that the GSD pi extension (`gsd-hooks.ts`) is correctly installed in the current project.
If the extension is missing, install it and update `.pi/settings.json`.
If already present, confirm hook wiring and report status.
Always route first-time users to `/gsd-new-project` at the end.
</objective>

<context>
**Why this skill exists:**
`bun install` does not run npm `postinstall` scripts, so `gsd-hooks.ts` may not be
automatically copied into the consumer project's `.pi/extensions/` directory.
This skill provides a manual fallback that performs the same wiring as `postinstall.js`.

**What the extension does:**
- `session_start` → background GSD update check (24 h cache in `~/.pi/cache/`)
- `tool_call` (write/edit) → advisory workflow guard when `hooks.workflow_guard` is set
- `tool_result` → context-usage monitor with debounced warnings

**Extension source inside the pi-gsd package:**
`.gsd/extensions/gsd-hooks.ts`

**Target location in the consumer project:**
`.pi/extensions/gsd-hooks.ts`

**settings.json entry (belt-and-suspenders — pi also auto-discovers from `.pi/extensions/`):**
`{ "extensions": ["<absolute-path-to-.pi/extensions/gsd-hooks.ts>"] }`
</context>

<process>

## Step 1 — Locate the pi-gsd package

Resolve the pi-gsd package root (where `gsd-hooks.ts` lives):
1. Try `node -e "console.log(require.resolve('pi-gsd/package.json'))"` — strip `/package.json` suffix to get PKG_DIR.
2. If that fails, try common global paths:
   - `~/.bun/install/global/node_modules/pi-gsd`
   - `/home/linuxbrew/.linuxbrew/lib/node_modules/pi-gsd`
   - Output of `npm root -g` + `/pi-gsd`
3. Confirm the extension source exists at `<PKG_DIR>/.gsd/extensions/gsd-hooks.ts`.
   If the source cannot be found, report the error clearly and stop — do not proceed to Step 2.

## Step 2 — Check current project extension status

In the current working directory (the consumer project):

- **Check A:** Does `.pi/extensions/gsd-hooks.ts` exist?
- **Check B:** Does `.pi/settings.json` exist? If yes, does `extensions` array include an absolute path to the extension file?
- **Check C:** Does `.pi/extensions/` directory exist?

## Step 3 — Install or confirm

### If extension is MISSING (Check A failed):

1. Create `.pi/extensions/` directory if it does not exist.
2. Copy `<PKG_DIR>/.gsd/extensions/gsd-hooks.ts` → `.pi/extensions/gsd-hooks.ts`.
3. Update `.pi/settings.json`:
   - If the file does not exist, create it as `{ "extensions": ["<absolute-path>/.pi/extensions/gsd-hooks.ts"] }`.
   - If the file exists but `extensions` array is missing or does not include the path, add the absolute path.
   - Preserve all other existing settings — merge, do not overwrite.
4. Report: `✓ GSD extension installed at .pi/extensions/gsd-hooks.ts`
5. Report: `✓ .pi/settings.json updated`

### If extension is PRESENT (Check A passed):

1. Confirm the file is non-empty (not a zero-byte stub).
2. Confirm it contains the marker comment `gsd-extension-version:` — indicating it is the genuine GSD extension, not a stale copy from another tool.
3. Check Check B — if `settings.json` is missing or the extension path is absent, add it now (same logic as missing case, step 3).
4. Report:
   - `✓ GSD extension present at .pi/extensions/gsd-hooks.ts`
   - `✓ hooks: session_start (update-check), tool_call (workflow-guard), tool_result (context-monitor)`
   - `✓ .pi/settings.json` — either "already registered" or "path added"

## Step 4 — Summarise status

Print a concise status table:

```
GSD pi hook wiring status
──────────────────────────────────────────────────────────
Extension file     .pi/extensions/gsd-hooks.ts   ✓ / ✗
Settings entry     .pi/settings.json extensions   ✓ / ✗
Extension version  gsd-extension-version: X.Y.Z   (value)
──────────────────────────────────────────────────────────
```

If any item is `✗` after repair attempts, explain what failed and the manual fix.

## Step 5 — Route to first-time setup

Ask the user:

> "GSD hook wiring is complete. Is this a new project that hasn't been set up with GSD yet?"

- **Yes / first time:** Run `/gsd-new-project` to initialise `.planning/`, requirements, and roadmap.
- **Already set up:** Run `/gsd-progress` to show current project state and next steps.
- **Just checking:** Report "All done — hooks verified." and stop.

</process>
