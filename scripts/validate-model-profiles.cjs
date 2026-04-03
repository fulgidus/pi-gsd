#!/usr/bin/env node
/**
 * validate-model-profiles.cjs
 *
 * Validates that every harness copy of `references/model-profiles.md` matches
 * what `generateModelProfilesMd()` would produce from MODEL_PROFILES in
 * `model-profiles.cjs` (the single source of truth).
 *
 * Usage:
 *   node scripts/validate-model-profiles.cjs           # check all harnesses
 *   node scripts/validate-model-profiles.cjs --fix     # regenerate out-of-sync files
 *   node scripts/validate-model-profiles.cjs --harness claude  # single harness only
 *   node scripts/validate-model-profiles.cjs --stdout  # print diff to stdout (CI-friendly)
 *
 * Exit codes:
 *   0  — all files are in sync (or --fix succeeded)
 *   1  — one or more files are out of sync  (without --fix)
 *   2  — argument / configuration error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Locate the canonical model-profiles.cjs ──────────────────────────────────
// This script lives at <repo-root>/scripts/; the source lives at
// .agent/get-shit-done/bin/lib/model-profiles.cjs
const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_CJS = path.join(
  REPO_ROOT,
  '.agent', 'get-shit-done', 'bin', 'lib', 'model-profiles.cjs'
);

if (!fs.existsSync(SOURCE_CJS)) {
  console.error(`ERROR: Cannot find source file:\n  ${SOURCE_CJS}`);
  console.error('Run this script from the pi-gsd repo root.');
  process.exit(2);
}

const { generateModelProfilesMd, HARNESS_CONFIG } = require(SOURCE_CJS);

// ── Harness → installed directory mapping ────────────────────────────────────
// Each key matches a HARNESS_CONFIG key; the value is the harness config dir
// relative to REPO_ROOT.
const HARNESS_DIRS = {
  agent:    '.agent',
  claude:   '.claude',
  codex:    '.codex',
  cursor:   '.cursor',
  gemini:   '.gemini',
  github:   '.github',
  opencode: '.opencode',
  windsurf: '.windsurf',
};

/**
 * Returns the expected path of model-profiles.md for a given harness.
 * @param {string} harness
 * @returns {string} absolute path
 */
function mdPathForHarness(harness) {
  const dir = HARNESS_DIRS[harness];
  if (!dir) {
    throw new Error(`Unknown harness "${harness}". Valid keys: ${Object.keys(HARNESS_DIRS).join(', ')}`);
  }
  return path.join(REPO_ROOT, dir, 'get-shit-done', 'references', 'model-profiles.md');
}

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const fixMode    = args.includes('--fix');
const verboseMode = args.includes('--verbose') || args.includes('-v');
const quietMode  = args.includes('--quiet')   || args.includes('-q');

const harnessIdx = args.indexOf('--harness');
const singleHarness = harnessIdx !== -1 ? args[harnessIdx + 1] : null;

if (singleHarness && !HARNESS_DIRS[singleHarness]) {
  console.error(`ERROR: Unknown harness "${singleHarness}".`);
  console.error(`Valid values: ${Object.keys(HARNESS_DIRS).join(', ')}`);
  process.exit(2);
}

const harnessesToCheck = singleHarness
  ? [singleHarness]
  : Object.keys(HARNESS_DIRS);

// ── Validation logic ──────────────────────────────────────────────────────────

/** ANSI helpers — gracefully degrade when stdout is not a TTY */
const isaTTY = process.stdout.isTTY;
const green  = (s) => isaTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red    = (s) => isaTTY ? `\x1b[31m${s}\x1b[0m` : s;
const yellow = (s) => isaTTY ? `\x1b[33m${s}\x1b[0m` : s;
const bold   = (s) => isaTTY ? `\x1b[1m${s}\x1b[0m`  : s;
const dim    = (s) => isaTTY ? `\x1b[2m${s}\x1b[0m`  : s;

/**
 * Produce a human-readable unified-diff-style summary of mismatches between
 * two strings, line by line.  Not a full `diff` implementation — shows the
 * first diverging line number and a short context window.
 *
 * @param {string} expected
 * @param {string} actual
 * @returns {string}
 */
function summariseDiff(expected, actual) {
  const eLines = expected.split('\n');
  const aLines = actual.split('\n');
  const maxLen = Math.max(eLines.length, aLines.length);

  /** Indices of all differing lines */
  const diffLines = [];
  for (let i = 0; i < maxLen; i++) {
    if (eLines[i] !== aLines[i]) diffLines.push(i);
  }

  if (diffLines.length === 0) return '  (no textual differences found — possible BOM/encoding issue)';

  const CONTEXT = 2;
  const lines   = [];

  // Build a set of lines to show (diff lines + surrounding context)
  const toShow = new Set();
  for (const idx of diffLines) {
    for (let c = Math.max(0, idx - CONTEXT); c <= Math.min(maxLen - 1, idx + CONTEXT); c++) {
      toShow.add(c);
    }
  }

  let prev = -1;
  for (const idx of [...toShow].sort((a, b) => a - b)) {
    if (prev !== -1 && idx > prev + 1) lines.push(dim('  ...'));
    const lineNum = String(idx + 1).padStart(4, ' ');
    const eLine   = eLines[idx] ?? '';
    const aLine   = aLines[idx] ?? '';
    if (eLine === aLine) {
      lines.push(dim(`  ${lineNum} | ${eLine}`));
    } else {
      if (eLine !== undefined) lines.push(green(`+ ${lineNum} | ${eLine}`) + dim('  ← expected (generated)'));
      if (aLine !== undefined) lines.push(red(`- ${lineNum} | ${aLine}`) + dim('  ← actual (on disk)'));
    }
    prev = idx;
  }

  const totalDiff = diffLines.length;
  if (totalDiff > (CONTEXT * 2 + 1) * diffLines.length) {
    lines.push(dim(`  ... (${totalDiff} differing lines total)`));
  }
  return lines.join('\n');
}

// ── Main run ──────────────────────────────────────────────────────────────────

let outOfSync  = [];
let missing    = [];
let fixed      = [];
let errors     = [];

if (!quietMode) {
  console.log(bold('\n── model-profiles sync check ─────────────────────────────────────────\n'));
  console.log(dim(`  Source:  ${SOURCE_CJS}`));
  console.log(dim(`  Targets: ${harnessesToCheck.length} harness(es)\n`));
}

for (const harness of harnessesToCheck) {
  const mdPath  = mdPathForHarness(harness);
  const relPath = path.relative(REPO_ROOT, mdPath);
  let expected;

  try {
    expected = generateModelProfilesMd(harness);
  } catch (err) {
    errors.push({ harness, mdPath, error: err.message });
    if (!quietMode) console.log(`  ${red('ERROR')}  ${relPath}\n         ${err.message}`);
    continue;
  }

  // File missing entirely
  if (!fs.existsSync(mdPath)) {
    if (fixMode) {
      try {
        fs.mkdirSync(path.dirname(mdPath), { recursive: true });
        fs.writeFileSync(mdPath, expected, 'utf8');
        fixed.push({ harness, mdPath });
        if (!quietMode) console.log(`  ${green('FIXED')}  ${relPath}  ${dim('(created)')}`);
      } catch (err) {
        errors.push({ harness, mdPath, error: err.message });
        if (!quietMode) console.log(`  ${red('ERROR')}  ${relPath}\n         Could not write: ${err.message}`);
      }
    } else {
      missing.push({ harness, mdPath });
      if (!quietMode) console.log(`  ${red('MISSING')} ${relPath}`);
    }
    continue;
  }

  const actual = fs.readFileSync(mdPath, 'utf8');

  if (actual === expected) {
    if (!quietMode) console.log(`  ${green('OK')}     ${relPath}`);
  } else {
    if (fixMode) {
      try {
        fs.writeFileSync(mdPath, expected, 'utf8');
        fixed.push({ harness, mdPath });
        if (!quietMode) console.log(`  ${green('FIXED')}  ${relPath}`);
      } catch (err) {
        errors.push({ harness, mdPath, error: err.message });
        if (!quietMode) console.log(`  ${red('ERROR')}  ${relPath}\n         Could not write: ${err.message}`);
      }
    } else {
      outOfSync.push({ harness, mdPath, expected, actual });
      if (!quietMode) {
        console.log(`  ${red('STALE')}  ${relPath}`);
        if (verboseMode) {
          console.log(summariseDiff(expected, actual));
        }
      }
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const totalBad = outOfSync.length + missing.length + errors.length;

if (!quietMode) {
  console.log('');
  if (fixMode) {
    const totalFixed = fixed.length;
    if (totalFixed > 0) {
      console.log(green(bold(`✔  Fixed ${totalFixed} file(s).`)));
    }
    if (errors.length > 0) {
      console.log(red(bold(`✘  ${errors.length} error(s) during fix — see above.`)));
    }
    if (totalFixed === 0 && errors.length === 0) {
      console.log(green(bold('✔  All files were already in sync.')));
    }
  } else {
    if (totalBad === 0) {
      console.log(green(bold('✔  All model-profiles.md files are in sync with model-profiles.cjs.')));
    } else {
      const parts = [];
      if (outOfSync.length) parts.push(`${outOfSync.length} stale`);
      if (missing.length)   parts.push(`${missing.length} missing`);
      if (errors.length)    parts.push(`${errors.length} error(s)`);
      console.log(red(bold(`✘  ${parts.join(', ')} — run with --fix to regenerate, or --verbose for diff details.`)));
      console.log('');
      console.log(yellow('  To fix:'));
      console.log(`    node scripts/validate-model-profiles.cjs ${yellow('--fix')}`);
      console.log('');
      console.log(yellow('  To see diffs:'));
      console.log(`    node scripts/validate-model-profiles.cjs ${yellow('--verbose')}`);
    }
  }
  console.log('');
}

process.exit(errors.length > 0 ? 2 : totalBad > 0 ? 1 : 0);
