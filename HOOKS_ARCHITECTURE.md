# GSD Hook Architecture — Canonical Source & Install Pipeline

> **TL;DR:** The hook files in `.agent/hooks/`, `.claude/hooks/`, `.gemini/hooks/`, and
> `.opencode/hooks/` are **not copies** — they are **OS hardlinks** sharing a single inode.
> Editing any one of them instantly edits all of them. There is no maintenance hazard.
> This document explains why, how the pipeline works, and what the rules are for contributors.

---

## Table of Contents

1. [The Hardlink Model](#1-the-hardlink-model)
2. [Hook Inventory](#2-hook-inventory)
3. [Harness Coverage](#3-harness-coverage)
4. [The Full Install Pipeline](#4-the-full-install-pipeline)
5. [Runtime Self-Detection](#5-runtime-self-detection)
6. [Rules for Contributors](#6-rules-for-contributors)
7. [Verification Commands](#7-verification-commands)
8. [Why Not Symlinks?](#8-why-not-symlinks)
9. [The One Actual Difference: Build-time Templating](#9-the-one-actual-difference-build-time-templating)

---

## 1. The Hardlink Model

```
Filesystem inode 14190830  (one actual file on disk)
    ├── .gsd/hooks/gsd-statusline.js         ← canonical repo view
    ├── .agent/hooks/gsd-statusline.js
    ├── .claude/hooks/gsd-statusline.js
    ├── .gemini/hooks/gsd-statusline.js
    └── .opencode/hooks/gsd-statusline.js
```

Each harness `hooks/` directory contains **five hardlinks per hook file**, all pointing to the
same inode. The link count reported by `stat` is `5` — matching the five harness directories
that have hooks (`.gsd`, `.agent`, `.claude`, `.gemini`, `.opencode`).

**Consequence:** A bug fix written to `.agent/hooks/gsd-context-monitor.js` is immediately
visible in every other harness directory. No sync step is needed. No copies can drift.

Verify at any time:

```bash
stat -c "%i %h %n" \
  .gsd/hooks/gsd-statusline.js \
  .agent/hooks/gsd-statusline.js \
  .claude/hooks/gsd-statusline.js \
  .gemini/hooks/gsd-statusline.js \
  .opencode/hooks/gsd-statusline.js
# All five lines print the same inode number, link count = 5
```

---

## 2. Hook Inventory

| File | Event trigger | Purpose |
|------|--------------|---------|
| `gsd-statusline.js` | StatusLine (Claude) | Renders context bar + model + current task in the terminal statusline; writes `/tmp/claude-ctx-{session}.json` bridge file |
| `gsd-context-monitor.js` | PostToolUse / AfterTool | Reads bridge file; injects advisory `additionalContext` warning at 35% / 25% remaining context |
| `gsd-prompt-guard.js` | PreToolUse / BeforeTool | Scans content written to `.planning/` for 13 prompt-injection patterns; advisory only (never blocks) |
| `gsd-check-update.js` | SessionStart | Spawns background `npm view get-shit-done-cc version` check; caches result in `{configDir}/cache/gsd-update-check.json` |
| `gsd-workflow-guard.js` | PreToolUse / BeforeTool | Detects direct file edits outside a GSD workflow context; advisory nudge to use `/gsd:fast` or `/gsd:quick` |

All five hooks share identical source across all harnesses (same inode). There are **zero
harness-specific branches** inside the hook source files. Harness identity is detected
dynamically at runtime (see §5).

---

## 3. Harness Coverage

| Harness | Config dir | Has hooks | Reason if absent |
|---------|-----------|-----------|-----------------|
| Claude Code | `.claude/` | ✅ Yes | Full `settings.json` hook API |
| Gemini CLI | `.gemini/` | ✅ Yes | Full `settings.json` hook API (uses `AfterTool`/`BeforeTool` event names) |
| OpenCode | `.opencode/` | ✅ Yes | Full `settings.json` hook API |
| Agent (generic) | `.agent/` | ✅ Yes | Catch-all for future/custom harnesses |
| Codex | `.codex/` | ❌ No | Only `config.toml` `SessionStart` — no `PostToolUse` equivalent |
| Cursor | `.cursor/` | ❌ No | Skills only; no hook execution API |
| Windsurf | `.windsurf/` | ❌ No | Skills only; no hook execution API |
| GitHub Copilot | `.github/` | ❌ No | Skills only; no hook execution API |

---

## 4. The Full Install Pipeline

The hook files go through three distinct stages before reaching the harness directories:

### Stage 1 — Source in npm package (upstream)

```
get-shit-done-cc/
├── hooks/
│   ├── gsd-check-update.js        ← raw source, {{GSD_VERSION}} placeholder
│   ├── gsd-context-monitor.js
│   ├── gsd-prompt-guard.js
│   ├── gsd-statusline.js
│   └── gsd-workflow-guard.js
└── scripts/
    └── build-hooks.js             ← validates syntax, copies to hooks/dist/
```

`build-hooks.js` runs at `prepublishOnly`:
1. For each hook, compiles it with `vm.Script` to catch `SyntaxError` before shipping
   (guards against regressions like issue #1107 — a duplicate `const` that broke
   `PostToolUse` for all users).
2. Copies valid hooks verbatim into `hooks/dist/`.
3. Fails the build (`process.exit(1)`) if any hook has a syntax error.

The `{{GSD_VERSION}}` placeholder in hook headers is **not** substituted at this stage.

### Stage 2 — `npx get-shit-done-cc` installation (`bin/install.js`)

When a user runs `npx get-shit-done-cc --claude --global` (or any runtime), `install()` in
`bin/install.js` executes:

```javascript
const hooksSrc = path.join(src, 'hooks', 'dist');   // hooks/dist/ from npm package
const hooksDest = path.join(targetDir, 'hooks');     // e.g. ~/.claude/hooks/
fs.mkdirSync(hooksDest, { recursive: true });

for (const entry of fs.readdirSync(hooksSrc)) {
  if (entry.endsWith('.js')) {
    let content = fs.readFileSync(srcFile, 'utf8');
    // Template substitutions applied here:
    content = content.replace(/'\.claude'/g, configDirReplacement); // e.g. -> '.gemini'
    content = content.replace(/\{\{GSD_VERSION\}\}/g, pkg.version); // e.g. -> '1.30.0'
    fs.writeFileSync(destFile, content);
    fs.chmodSync(destFile, 0o755);  // ensures +x on Linux/macOS
  }
}
```

Key points:
- `configDirReplacement` is computed by `getConfigDirFromHome(runtime, isGlobal)` — it
  produces the correct runtime-specific config dir string (`.claude`, `.gemini`, etc.) so
  the `gsd-check-update.js` search-path list includes the right primary harness dir.
- `{{GSD_VERSION}}` becomes the literal installed version (e.g. `1.30.0`), which is then
  matched against the `VERSION` file by `gsd-check-update.js` to detect stale hooks.
- Each installed hook file is a **separate regular file** at this point (not yet hardlinked).
  Hardlinking happens in Stage 3.

> **Note:** OpenCode installs hooks too (into `~/.config/opencode/hooks/` or `.opencode/hooks/`)
> but does NOT register them in `settings.json` via the OpenCode hook API — it relies on the
> Claude Code `PostToolUse` path. The hooks are present for compatibility and forward-compat.

### Stage 3 — This repo (reverse-engineered snapshot)

This repository (`pi-gsd`) is a snapshot of an already-installed GSD across all harnesses.
The hardlinks were created manually to consolidate identical post-install files:

```bash
# How the hardlinks were established (one-time setup, not run on every install):
cd /home/fulgidus/Documents/pi-gsd

# .gsd/hooks/ is designated the canonical "view" (purely for repo navigation)
# All other harness hooks/ dirs are hardlinked to it:
for hook in gsd-check-update.js gsd-context-monitor.js gsd-prompt-guard.js \
            gsd-statusline.js gsd-workflow-guard.js; do
  for harness in .agent .claude .gemini .opencode; do
    ln -f ".gsd/hooks/$hook" "$harness/hooks/$hook"
  done
done
```

After `npx get-shit-done-cc` updates a harness, the new file at e.g. `~/.claude/hooks/gsd-statusline.js`
is a fresh copy. Re-running `ln -f` re-establishes the hardlinks across all harness dirs
in this snapshot repo.

---

## 5. Runtime Self-Detection

No harness-specific logic lives inside the hook source files. Each hook detects its context
entirely from runtime signals:

### Config directory detection (`gsd-check-update.js`, `gsd-statusline.js`)

```javascript
// Derive harness config dir from __filename at runtime.
// e.g. /home/user/.claude/hooks/gsd-statusline.js  ->  harnessDir = '.claude'
// e.g. /home/user/.gemini/hooks/gsd-statusline.js  ->  harnessDir = '.gemini'
const harnessDir = path.basename(path.dirname(path.dirname(__filename)));
```

Because `__filename` is the path of the hardlink that was invoked (the OS resolves the
harness-specific path, not the inode's "primary" name), this expression correctly returns
the calling harness's config dir name for every harness simultaneously — with one binary file.

### Hook event name detection (`gsd-context-monitor.js`)

```javascript
hookSpecificOutput: {
  // Gemini CLI uses 'AfterTool'; every other harness uses 'PostToolUse'
  hookEventName: process.env.GEMINI_API_KEY ? "AfterTool" : "PostToolUse",
  additionalContext: message
}
```

Gemini CLI sets `GEMINI_API_KEY` in the hook's environment. All other harnesses do not,
so the ternary cleanly branches without any explicit runtime flag.

> The `PreToolUse` vs `BeforeTool` distinction for `gsd-prompt-guard.js` and
> `gsd-workflow-guard.js` is handled at the `settings.json` registration level by the
> installer (`preToolEvent = runtime === 'gemini' ? 'BeforeTool' : 'PreToolUse'`), not
> inside the hook scripts themselves. The hooks always output `hookEventName: 'PreToolUse'`
> but the harness configuration routes the correct event to them regardless of name.

### CLAUDE_CONFIG_DIR override

Both `gsd-statusline.js` and `gsd-check-update.js` respect the `CLAUDE_CONFIG_DIR`
environment variable for custom multi-account config dir setups (issue #870):

```javascript
const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(homeDir, harnessDir);
```

---

## 6. Rules for Contributors

### ✅ DO

- **Edit any single copy** — all hardlinked copies update simultaneously.
  Prefer editing through `.gsd/hooks/<name>.js` as the canonical repo path.
- **Add version bump** to the `// gsd-hook-version:` header comment when making
  functional changes. The update-check system compares this string against the
  installed `VERSION` file to detect stale hooks.
- **Use `__filename` and `__dirname`** for any path that needs to reference the
  harness config dir. Never hardcode `.claude` or any other harness name.
- **Use `process.env.GEMINI_API_KEY`** as the Gemini runtime signal. This is the
  single approved branching point for harness-specific behaviour inside hook code.
- **Always `process.exit(0)` on error** — hooks must never block tool execution.
  Silent fail is the contract.
- **Keep hooks dependency-free.** They run as standalone Node.js scripts with no
  `node_modules`. Use only Node built-ins (`fs`, `path`, `os`, `child_process`).

### ❌ DON'T

- **Don't add per-harness `if/else` blocks** inside hook source. All harness identity
  must be derived from runtime signals (`__filename`, `process.env.*`).
- **Don't introduce `require()` of third-party packages.** Hooks are executed in
  arbitrary user environments; bundling is not done at install time.
- **Don't copy the hooks manually** between harness directories. This breaks the
  hardlink and creates a real drift hazard. Use `ln -f` to re-establish the link.
- **Don't add a build step for hooks in this repo.** The build pipeline lives
  upstream in the `get-shit-done-cc` npm package (`scripts/build-hooks.js`).
  This repo holds the installed snapshot only.
- **Don't put sensitive or environment-specific data in hook output.** The
  `additionalContext` field is injected into the agent's conversation context and
  may be logged.

---

## 7. Verification Commands

```bash
cd /home/fulgidus/Documents/pi-gsd

# 1. Confirm all copies share the same inode (hardlinks, not copies)
for hook in gsd-check-update.js gsd-context-monitor.js gsd-prompt-guard.js \
            gsd-statusline.js gsd-workflow-guard.js; do
  echo "=== $hook ==="
  stat -c "%i %h %n" \
    .gsd/hooks/$hook .agent/hooks/$hook .claude/hooks/$hook \
    .gemini/hooks/$hook .opencode/hooks/$hook
done

# 2. Confirm zero content drift (belt-and-suspenders check for the paranoid)
for hook in gsd-check-update.js gsd-context-monitor.js gsd-prompt-guard.js \
            gsd-statusline.js gsd-workflow-guard.js; do
  for harness in .agent .claude .gemini .opencode; do
    diff .gsd/hooks/$hook $harness/hooks/$hook \
      && echo "$harness/$hook: OK" \
      || echo "DRIFT: $harness/$hook differs from .gsd/hooks/$hook"
  done
done

# 3. Re-establish hardlinks after a GSD update that installs fresh hook copies
# (run from repo root after `npx get-shit-done-cc --all --global`)
for hook in gsd-check-update.js gsd-context-monitor.js gsd-prompt-guard.js \
            gsd-statusline.js gsd-workflow-guard.js; do
  for harness in .agent .claude .gemini .opencode; do
    ln -fv ".gsd/hooks/$hook" "$harness/hooks/$hook"
  done
done
```

---

## 8. Why Not Symlinks?

Symlinks were considered and rejected for three reasons:

1. **Harness config loaders** — some harnesses stat hook files for execution permission
   (`chmod +x`). Symlinks would require the target to be executable, not the link itself.
   Hardlinks avoid this entirely; the inode holds the permission bits.

2. **`__filename` resolution** — Node.js resolves `__filename` to the **symlink path**,
   not the target, on most platforms. This is actually desirable for the harness-detection
   pattern (`path.dirname(path.dirname(__filename))`). However, some edge-case environments
   (NFS mounts, certain container setups) resolve symlinks before exposing `__filename`,
   which would break the detection. Hardlinks have no such ambiguity: `__filename` is always
   exactly the path used to invoke the script.

3. **Portability** — hardlinks work on all Linux/macOS filesystems without special
   flags. Symlinks require that relative paths are computed correctly relative to the
   link location, which is error-prone when the directory tree is moved or the repo is
   cloned to a different path.

**Limitation:** Hardlinks cannot cross filesystem boundaries. All five harness dirs must
live on the same filesystem (they do — they all live under `$HOME`).

---

## 9. The One Actual Difference: Build-time Templating

Although the runtime hook files are byte-for-byte identical at the OS level (hardlinks),
the **upstream npm package source** contains two template placeholders that are substituted
*per-runtime* during installation:

| Placeholder | Substitution | Where used |
|-------------|-------------|-----------|
| `'\.claude'` (regex) | Runtime-specific config dir name, e.g. `'.gemini'` | `gsd-check-update.js` — `searchDirs` array for VERSION file lookup |
| `{{GSD_VERSION}}` | Installed package version, e.g. `'1.30.0'` | `// gsd-hook-version:` header in all 5 hooks |

After substitution, each harness directory receives a **slightly different file** at install
time. In this repo's snapshot, all files were installed for the same effective version
(`1.30.0`) and the template variable `'\.claude'` evaluates the same way for `.agent`,
`.claude`, `.gemini`, and `.opencode` because `gsd-check-update.js` uses a dynamic
`searchDirs` array that checks all known harness dirs anyway. The result: all five installed
files are identical, and hardlinking is valid.

If a future version introduces a template substitution that produces meaningfully different
outputs per harness, that hook must **not** be hardlinked — it becomes a per-harness copy
and should be documented as an exception here.

---

*Last updated: 2026-04-03 | GSD version: 1.30.0 | Hardlink count per hook: 5*
