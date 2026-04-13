# pi-gsd

pi-gsd - TypeScript port of GSD (get-shit-done-cc) v1.30.0 for pi.
A pi package that distributes GSD workflows, skills, and tooling for pi.

## Commands

After ANY code change, run:

```bash
npm run typecheck
```

Before any publish or release:

```bash
npm run build
node scripts/validate-model-profiles.cjs
```

Individual commands:

- `npm run typecheck` - Type-check TypeScript (no emit)
- `npm run build` - Bundle `src/cli.ts` → `dist/pi-gsd-tools.js` (minified CJS)
- `npm run dev` - Watch mode build
- `node scripts/validate-model-profiles.cjs` - Confirm model-profiles.md ↔ .cjs sync

## Conventions

- **`gsd/` is the canonical source** - edit workflows, agents, references, templates, prompts, and hooks there. Never edit `.pi/gsd/` (consumer output).
- **Hook files** in `gsd/hooks/` are the canonical source. They are hardlinked with `.agent/hooks/`, `.claude/hooks/`, `.gemini/hooks/`, `.opencode/hooks/`. Editing one edits all. Never copy them.
- **Command prefix rule** - `/gsd-<name>` (hyphen) everywhere. Colon is a Claude/Gemini internal dispatch mechanism only.
- **Published files** - `dist/`, `gsd/`, `scripts/postinstall.js` ship. Nothing else.
- **Never touch** - `*.lock`, `.env*`, `.git/hooks/*`
- **After ANY change to `model-profiles.cjs`** - run `validate-model-profiles.cjs` and stage updated markdown files
- **`.pi/gsd/` is gitignored** - populated by `npm install .` (or `pi install npm:pi-gsd` for consumers)

## Directory Structure

```
src/
├── cli.ts              # CLI entry point (lazy-loaded command router)
├── pi-gsd-hooks.ts     # Pi extension source (built → dist/pi-gsd-hooks.js)
├── output.ts           # --output / --pick JSONPath formatting
└── lib/                # All domain modules (state, roadmap, phase, verify, ...)
gsd/                    # Single canonical source for all harness content (shipped)
├── workflows/          # WXP workflow files
├── agents/             # Subagent prompt definitions
├── references/         # Reference docs (model profiles, UI brand, etc.)
├── templates/          # File templates (PLAN, SUMMARY, STATE, etc.)
├── prompts/            # Pi slash-command entry points (served from package)
├── hooks/              # Hook scripts installed to consumer .pi/gsd/hooks/
└── VERSION             # Harness version tag
skills/                 # GSD skill definitions - published to npm
scripts/                # Build pipeline + validation tooling
dist/                   # Build output (gitignored)
.pi/gsd/                # Gitignored - populated by npm install
```

## Testing

No automated test suite. Validation is done via:

1. `npm run typecheck` - compile-time correctness
2. `node scripts/validate-model-profiles.cjs` - model profile sync

## Key Files

- `TODO.md` - confirmed improvement backlog
- `HOOKS_ARCHITECTURE.md` - hook install pipeline
- `COMMAND_PREFIX_MAP.md` - complete command inventory
