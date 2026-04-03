#!/usr/bin/env node
/**
 * postinstall.js — GSD harness installer
 *
 * Runs automatically after `npm install get-shit-done-cc`.
 * Copies each AI-platform harness directory from this package's
 * `.gsd/harnesses/<harness>/` into the consumer project's root
 * so the AI agent can discover the GSD workflows, commands, hooks,
 * and CLI binary at the expected platform-native paths.
 *
 * Harness layout inside this package (source):
 *   .gsd/harnesses/
 *     agent/     → consumer project root: .agent/get-shit-done/
 *     claude/    → consumer project root: .claude/get-shit-done/
 *     codex/     → consumer project root: .codex/get-shit-done/
 *     cursor/    → consumer project root: .cursor/get-shit-done/
 *     gemini/    → consumer project root: .gemini/get-shit-done/
 *     github/    → consumer project root: .github/get-shit-done/
 *     opencode/  → consumer project root: .opencode/get-shit-done/
 *     windsurf/  → consumer project root: .windsurf/get-shit-done/
 *
 * Hook files are also copied from `.gsd/hooks/` into each harness
 * that supports the GSD hook system.
 *
 * The script is intentionally defensive: it never overwrites files
 * that already exist (use --force-reinstall env flag to override),
 * and it skips silently if a harness source directory is absent
 * from the package (forward-compatibility).
 *
 * @see README.md §3 (Installation) for usage details.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const FORCE = process.env.GSD_FORCE_REINSTALL === '1'
           || process.argv.includes('--force-reinstall');

/**
 * Directory that contains this package's files.
 * When executed via npm postinstall, __dirname is the package root.
 */
const PKG_DIR = path.resolve(__dirname, '..');

/**
 * The consuming project's root.
 * npm sets INIT_CWD to the directory where `npm install` was run.
 * Fall back to process.cwd() for programmatic / npx usage.
 */
const PROJECT_ROOT = process.env.INIT_CWD || process.cwd();

/**
 * Harness definitions.
 *
 * Each entry maps:
 *   src  — subdirectory under <package>/.gsd/harnesses/
 *   dest — directory in the consumer project root
 *   hooks — whether this platform supports GSD hooks (copied from .gsd/hooks/)
 */
const HARNESSES = [
  { src: 'agent',    dest: '.agent',    hooks: true  },
  { src: 'claude',   dest: '.claude',   hooks: true  },
  { src: 'codex',    dest: '.codex',    hooks: false },
  { src: 'cursor',   dest: '.cursor',   hooks: false },
  { src: 'gemini',   dest: '.gemini',   hooks: true  },
  { src: 'github',   dest: '.github',   hooks: false },
  { src: 'opencode', dest: '.opencode', hooks: true  },
  { src: 'windsurf', dest: '.windsurf', hooks: false },
];

/**
 * Subdirectory name used inside each harness's dest folder for
 * GSD-specific content (workflows, bin, references, templates …).
 */
const GSD_SUBDIR = 'get-shit-done';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively copy a directory tree from `src` to `dest`.
 * If `overwrite` is false (default), existing files are left untouched.
 *
 * @param {string} src       Absolute source path
 * @param {string} dest      Absolute destination path
 * @param {boolean} overwrite Replace existing files when true
 * @returns {{ copied: number, skipped: number }}
 */
function copyDir(src, dest, overwrite) {
  let copied  = 0;
  let skipped = 0;

  if (!fs.existsSync(src)) return { copied, skipped };

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcEntry  = path.join(src, entry.name);
    const destEntry = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      const sub = copyDir(srcEntry, destEntry, overwrite);
      copied  += sub.copied;
      skipped += sub.skipped;
    } else if (entry.isFile()) {
      if (!overwrite && fs.existsSync(destEntry)) {
        skipped++;
      } else {
        fs.copyFileSync(srcEntry, destEntry);
        copied++;
      }
    }
  }

  return { copied, skipped };
}

/**
 * Emit a coloured status line to stdout.
 * Colours are stripped when stdout is not a TTY (CI / pipe).
 *
 * @param {'ok'|'skip'|'warn'|'err'} level
 * @param {string} msg
 */
function log(level, msg) {
  const isTTY = process.stdout.isTTY;
  const colours = {
    ok:   isTTY ? '\x1b[32m✓\x1b[0m' : '✓',
    skip: isTTY ? '\x1b[33m–\x1b[0m' : '–',
    warn: isTTY ? '\x1b[33m⚠\x1b[0m' : '⚠',
    err:  isTTY ? '\x1b[31m✗\x1b[0m' : '✗',
  };
  console.log(`  ${colours[level] || ' '} ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Skip when running inside the package's own development tree
  // (i.e. when INIT_CWD === the package directory itself).
  if (path.resolve(PROJECT_ROOT) === path.resolve(PKG_DIR)) {
    log('skip', 'Running inside package source tree — skipping harness install.');
    return;
  }

  // Skip when explicitly opted out
  if (process.env.GSD_SKIP_INSTALL === '1') {
    log('skip', 'GSD_SKIP_INSTALL=1 — skipping harness install.');
    return;
  }

  const harnessesRoot = path.join(PKG_DIR, '.gsd', 'harnesses');
  const hooksRoot     = path.join(PKG_DIR, '.gsd', 'hooks');

  console.log('');
  console.log('  GSD — installing harness files into your project…');
  if (FORCE) console.log('  (force-reinstall mode: existing files will be overwritten)');
  console.log('');

  let totalCopied  = 0;
  let totalSkipped = 0;
  let installed    = 0;

  for (const harness of HARNESSES) {
    const srcHarness  = path.join(harnessesRoot, harness.src);
    const destHarness = path.join(PROJECT_ROOT, harness.dest);

    // ── get-shit-done/ content ──────────────────────────────────────────────
    const srcGsd  = path.join(srcHarness, GSD_SUBDIR);
    const destGsd = path.join(destHarness, GSD_SUBDIR);

    if (!fs.existsSync(srcHarness)) {
      log('skip', `${harness.dest}/${GSD_SUBDIR}  (source absent — skipped)`);
      continue;
    }

    const { copied, skipped } = copyDir(srcGsd, destGsd, FORCE);
    totalCopied  += copied;
    totalSkipped += skipped;

    if (copied > 0 || skipped === 0) {
      log('ok', `${harness.dest}/${GSD_SUBDIR}  (${copied} file${copied === 1 ? '' : 's'} installed)`);
    } else {
      log('skip', `${harness.dest}/${GSD_SUBDIR}  (already up-to-date, ${skipped} file${skipped === 1 ? '' : 's'} skipped)`);
    }

    // ── gsd-file-manifest.json ──────────────────────────────────────────────
    const manifestSrc  = path.join(srcHarness, 'gsd-file-manifest.json');
    const manifestDest = path.join(destHarness, 'gsd-file-manifest.json');

    if (fs.existsSync(manifestSrc)) {
      if (!FORCE && fs.existsSync(manifestDest)) {
        totalSkipped++;
      } else {
        fs.mkdirSync(destHarness, { recursive: true });
        fs.copyFileSync(manifestSrc, manifestDest);
        totalCopied++;
      }
    }

    // ── hooks/ (platform-selective) ─────────────────────────────────────────
    if (harness.hooks && fs.existsSync(hooksRoot)) {
      const destHooks = path.join(destHarness, 'hooks');
      const h = copyDir(hooksRoot, destHooks, FORCE);
      totalCopied  += h.copied;
      totalSkipped += h.skipped;

      if (h.copied > 0) {
        log('ok', `${harness.dest}/hooks  (${h.copied} hook${h.copied === 1 ? '' : 's'} installed)`);
      }
    }

    // ── skills/ (opencode only — present in .gsd/harnesses/opencode/skills) ─
    const srcSkills  = path.join(srcHarness, 'skills');
    const destSkills = path.join(destHarness, 'skills');

    if (fs.existsSync(srcSkills)) {
      const s = copyDir(srcSkills, destSkills, FORCE);
      totalCopied  += s.copied;
      totalSkipped += s.skipped;

      if (s.copied > 0) {
        log('ok', `${harness.dest}/skills  (${s.copied} skill file${s.copied === 1 ? '' : 's'} installed)`);
      }
    }

    installed++;
  }

  console.log('');

  if (installed === 0) {
    log('warn', 'No harness source directories found inside the package.');
    log('warn', 'The package may be incomplete. Try: npm install --force get-shit-done-cc');
    console.log('');
    return;
  }

  console.log(`  GSD v${getPackageVersion()} installed successfully.`);
  console.log(`  ${totalCopied} file${totalCopied === 1 ? '' : 's'} copied, ${totalSkipped} skipped.`);
  console.log('');
  console.log('  Next steps:');
  console.log('    • Claude / Gemini / Cursor / OpenCode: run /gsd:new-project');
  console.log('    • Claude Code (.agent):                run /gsd-new-project');
  console.log('    • Codex:                               run $gsd-new-project');
  console.log('    • GitHub Copilot:                      run /gsd:new-project');
  console.log('');
  console.log('  Docs: https://github.com/fulgidus/pi-gsd#readme');
  console.log('');
}

/**
 * Read the version from this package's own package.json.
 * Gracefully returns 'unknown' if the file is unreadable.
 *
 * @returns {string}
 */
function getPackageVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')
    );
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

main();
