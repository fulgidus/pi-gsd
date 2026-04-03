# pi-gsd

A **TypeScript** pi package (actively being ported from JS) that ports the **Get Shit Done** (GSD) v1.30.0 framework across 8 AI coding harnesses: Claude Code, Gemini CLI, OpenCode, Codex, Cursor, Windsurf, GitHub Copilot, and the generic `.agent` harness.

## What We Publish

- `skills/` — 57 GSD skill definitions (`gsd-*/SKILL.md`)
- `scripts/` — Audit and validation tooling
- `README.md`, `LICENSE`

The harness runtime files are assembled at publish time via `scripts/build-harnesses.js` and are **not committed to the repo root**.

## Commands

### Type-check (once tsconfig.json is in place)

```bash
npx tsc --noEmit
```

### Before publishing

```bash
node scripts/build-harnesses.js --clean
```

Assembles `.gsd/harnesses/` from canonical sources. Must run before `npm publish`.

### Validate cross-harness integrity

```bash
node scripts/validate-harness-sync.cjs     # Full 5-check integrity suite
node scripts/audit-harness-sync.cjs        # File hash comparison
node scripts/validate-model-profiles.cjs   # model-profiles.md ↔ .cjs sync
```

After ANY change to `model-profiles.cjs`, run the model-profiles validator and stage the updated markdown files.

## Conventions

1. **Tier-1 modules are byte-identical** — `frontmatter.cjs`, `milestone.cjs`, `model-profiles.cjs`, `roadmap.cjs`, `security.cjs`, `state.cjs`, `template.cjs`, `uat.cjs`, `init.cjs` must be identical across all 8 harnesses. The integrity suite enforces this.

2. **Tier-2 modules are harness-specific** — edit them only via the canonical source in `.gsd/bin/<harness>/lib/`, never directly in `.<harness>/get-shit-done/bin/lib/`.

3. **Hook files are hardlinked** — `.agent/`, `.claude/`, `.gemini/`, `.opencode/`, and `.gsd/hooks/` share a single inode. Editing one edits all. Never copy them — always relink.

4. **Command prefix rule** — `/gsd:<name>` (colon-form) is a Claude/Gemini internal dispatch mechanism only. It must **never** appear in generated artefacts, ROADMAP entries, or error messages. Use `/gsd-<name>` (hyphen-form) everywhere else.

5. **Published content** — `skills/` and `scripts/` are published. Do not add harness runtime directories to `package.json`'s `files` field.

6. **Never touch** — `*.lock`, `.env*`, `.git/hooks/*`.

## Directory Structure

```
pi-gsd/
├── skills/               # 57 GSD skills (gsd-*/SKILL.md) — published to npm
├── scripts/              # Audit/validation scripts + build pipeline
├── .gsd/                 # Canonical hook source + per-harness binary copies
│   ├── hooks/            # Hardlink anchor for all 5 hook files
│   ├── bin/<harness>/    # Per-harness lib overrides (core.cjs, profile-output.cjs)
│   └── harnesses/        # Assembled output (built by build-harnesses.js, gitignored)
├── examples/             # Usage examples
├── .ralphi/              # Ralphi loop configuration
├── COMMAND_PREFIX_MAP.md # Complete command inventory + prefix semantics
├── HOOKS_ARCHITECTURE.md # Hardlink model, hook inventory, install pipeline
├── HARNESS_DIFF.md       # Cross-harness diff analysis
└── README.md             # This repo's documentation
```

## Pre-commit Hook

`.git/hooks/pre-commit` runs `node scripts/validate-model-profiles.cjs` automatically when `model-profiles.cjs` or the validator itself is staged. To bypass in an emergency: `git commit --no-verify`.

## Release Process

1. Bump `version` in `package.json`
2. Commit and push
3. Tag: `git tag vX.Y.Z && git push --tags`
4. GitHub Actions (`publish.yml`) runs `build-harnesses.js`, packs, and publishes to npm
