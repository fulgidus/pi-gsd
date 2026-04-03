# pi-gsd

A **TypeScript** pi package that ports the **Get Shit Done (GSD) v1.30.0** framework across 8 AI coding harnesses.

## Stack

- **Language**: TypeScript 5 (strict mode)
- **Runtime**: Node.js ≥ 18
- **Bundler**: tsup (CJS output to `dist/`)
- **CLI framework**: Commander.js
- **Published artifacts**: `skills/`, `dist/`, `scripts/postinstall.js`

## Commands

```bash
npm run build           # Compile TypeScript → dist/gsd-tools.js (minified CJS)
npm run dev             # Watch mode build
npm run typecheck       # tsc --noEmit (type-check only, no emit)
npm run build:harnesses # Assemble .gsd/harnesses/ from canonical sources
```

## Validation / Integrity

```bash
node scripts/validate-harness-sync.cjs   # 5-check cross-harness integrity suite
node scripts/audit-harness-sync.cjs      # File hash comparison
node scripts/validate-model-profiles.cjs # model-profiles.md ↔ .cjs sync
```

> Run `validate-model-profiles.cjs` after **any** change to `model-profiles.cjs`.

## Directory Structure

```
src/
├── cli.ts              # Entry point
├── output.ts           # Output formatting
└── lib/                # Core modules (commands, config, core, state, ...)
skills/                 # 57 GSD skill definitions (gsd-*/SKILL.md) — published
scripts/                # Build + validation pipeline
.gsd/                   # Canonical hook source + per-harness binary copies
dist/                   # Build output (gitignored)
```

## Conventions

- **Tier-1 modules are byte-identical** across all 8 harnesses — never edit them directly in harness dirs
- **Tier-2 modules** live in `.gsd/bin/<harness>/lib/` — edit canonical source only
- **Hook files are hardlinked** — editing one edits all; never copy them
- **Command prefix**: use `/gsd-<name>` (hyphen) everywhere; `/gsd:<name>` (colon) is internal dispatch only
- **Commits**: Conventional Commits format
- **Never touch**: `*.lock`, `.env*`, `.git/hooks/*`

## Pre-commit Hook

Runs `validate-model-profiles.cjs` automatically when `model-profiles.cjs` or the validator is staged.  
Bypass: `git commit --no-verify`

## Release

1. Bump `version` in `package.json`
2. Commit + push
3. Tag: `git tag vX.Y.Z && git push --tags`
4. GitHub Actions (`publish.yml`) runs build-harnesses, packs, and publishes to npm
