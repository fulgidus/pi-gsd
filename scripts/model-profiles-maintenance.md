# Model Profiles — Maintenance Guide

## Single Source of Truth

**Edit only one file:**

```
.agent/get-shit-done/bin/lib/model-profiles.cjs
```

`MODEL_PROFILES` (line ~12) is the canonical data store.  All eight harness
copies of `references/model-profiles.md` are **auto-generated** from it.
Never edit those `.md` files by hand — your changes will be overwritten the
next time someone regenerates.

```
.agent/get-shit-done/bin/lib/model-profiles.cjs   ← EDIT HERE
       │
       └─ generateModelProfilesMd(harness)
              │
              ├─ .agent/get-shit-done/references/model-profiles.md
              ├─ .claude/get-shit-done/references/model-profiles.md
              ├─ .codex/get-shit-done/references/model-profiles.md
              ├─ .cursor/get-shit-done/references/model-profiles.md
              ├─ .gemini/get-shit-done/references/model-profiles.md
              ├─ .github/get-shit-done/references/model-profiles.md
              ├─ .opencode/get-shit-done/references/model-profiles.md
              └─ .windsurf/get-shit-done/references/model-profiles.md
```

---

## How to Make a Change

### 1 — Update MODEL_PROFILES

Open `.agent/get-shit-done/bin/lib/model-profiles.cjs` and change the
relevant entry in `MODEL_PROFILES`:

```js
const MODEL_PROFILES = {
  'gsd-planner':  { quality: 'opus',   balanced: 'opus',   budget: 'sonnet' },
  //                                                        ↑ change this
  ...
};
```

Valid model tiers: `opus`, `sonnet`, `haiku`, `inherit`.

### 2 — Regenerate all harness markdown files

```bash
# From the repo root:
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness agent
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness claude
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness codex
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness cursor
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness gemini
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness github
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness opencode
node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness windsurf
```

Or use the validation script's `--fix` flag, which regenerates only
out-of-sync files:

```bash
node scripts/validate-model-profiles.cjs --fix
```

### 3 — Verify

```bash
node scripts/validate-model-profiles.cjs
# → ✔  All model-profiles.md files are in sync with model-profiles.cjs.
```

### 4 — Commit both the .cjs and all regenerated .md files

```bash
git add .agent/get-shit-done/bin/lib/model-profiles.cjs
git add '*/references/model-profiles.md'
git commit -m "chore: update model profile for gsd-planner (quality→opus)"
```

---

## Drift Detection — validate-model-profiles.cjs

The script at `scripts/validate-model-profiles.cjs` compares every harness
`.md` against what `generateModelProfilesMd()` would produce from the current
`MODEL_PROFILES` data.

### Commands

| Command | What it does |
|---------|-------------|
| `node scripts/validate-model-profiles.cjs` | Check all 8 harnesses — exits 0 (clean) or 1 (drift) |
| `node scripts/validate-model-profiles.cjs --fix` | Regenerate any stale/missing files — exits 0 if all fixed |
| `node scripts/validate-model-profiles.cjs --verbose` | Show line-by-line diff for every stale file |
| `node scripts/validate-model-profiles.cjs --harness claude` | Check a single harness |
| `node scripts/validate-model-profiles.cjs --quiet` | Silent mode, exits 0/1/2 only (for CI piping) |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All in sync (or `--fix` succeeded) |
| `1` | One or more files out of sync (without `--fix`) |
| `2` | Argument or I/O error |

### CI integration

Add to any CI pipeline that validates the repo:

```yaml
# GitHub Actions example
- name: Validate model-profiles sync
  run: node scripts/validate-model-profiles.cjs --quiet
```

```sh
# Pre-commit hook  (.git/hooks/pre-commit)
#!/bin/sh
if git diff --cached --name-only | grep -q "model-profiles.cjs"; then
  echo "model-profiles.cjs changed — checking markdown sync…"
  node scripts/validate-model-profiles.cjs
  if [ $? -ne 0 ]; then
    echo "Run: node scripts/validate-model-profiles.cjs --fix"
    exit 1
  fi
fi
```

---

## Adding a New Agent

1. Add the agent to `MODEL_PROFILES` in `model-profiles.cjs`:
   ```js
   'gsd-my-new-agent': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
   ```
2. Regenerate all markdown files (see step 2 above).
3. Create the agent prompt file in each harness's agents directory.
4. Run `node scripts/validate-model-profiles.cjs` to confirm sync.

## Adding a New Harness

1. Add the harness key to `HARNESS_CONFIG` in `model-profiles.cjs`:
   ```js
   mynewharness: {
     runtimeName:    'MyTool',
     cmdPrefix:      '/gsd:',
     providerHeader: 'Using MyTool with Non-Anthropic Providers (OpenRouter, Local)',
     providerIntro:  "If you're using MyTool with OpenRouter ...",
     rationaleAlias: "MyTool",
   },
   ```
2. Add the directory mapping to `HARNESS_DIRS` in
   `scripts/validate-model-profiles.cjs`:
   ```js
   mynewharness: '.mynewharness',
   ```
3. Regenerate:
   ```bash
   node .agent/get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness mynewharness
   ```
4. Run `node scripts/validate-model-profiles.cjs` to confirm.

---

## Why the Markdown Files Exist

The `.md` files are not redundant — they serve a specific purpose:

- **Workflow context injection:** Several agent workflows (e.g.
  `model-profile-resolution.md`) reference the table via `@path` includes.
  Agents parse plain markdown far more efficiently than executing JS.
- **Harness-specific phrasing:** Each harness needs slightly different command
  syntax (`/gsd:`, `/gsd-`, `$gsd-`) and provider section wording.  The
  generator handles this; the `.md` is the rendered artefact.
- **Human readability:** The markdown is the user-facing documentation.

The `.cjs` is the data and logic; the `.md` files are rendered views.
Keep them in sync — never edit the views.
