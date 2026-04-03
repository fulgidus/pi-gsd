#!/usr/bin/env node
/**
 * build-harnesses.js - Assemble .gsd/harnesses/ for npm publish
 *
 * This script is the build pipeline that connects the canonical harness source
 * files scattered across the repo into the `.gsd/harnesses/<harness>/` trees
 * that `scripts/postinstall.js` expects to find inside the published package.
 *
 * ── Source layout (this repo) ─────────────────────────────────────────────────
 *
 *   .<harness>/
 *     get-shit-done/          ← harness-specific GSD content (references, etc.)
 *     hooks/                  ← per-harness hook scripts (agent/claude/gemini/opencode)
 *     skills/                 ← OpenCode skills directory
 *     gsd-file-manifest.json  ← integrity manifest
 *
 *   .gsd/bin/<harness>/lib/
 *     core.cjs                ← harness-specific CJS override (ALWAYS present)
 *     profile-output.cjs      ← agent-only; others use agent's version
 *
 *   .gsd/bin/agent/
 *     gsd-tools.cjs           ← shared CLI entry point (identical across harnesses)
 *     lib/core.cjs            ← agent's full core (with JSDoc types)
 *     lib/profile-output.cjs  ← agent-specific profiling output
 *
 *   .gsd/hooks/               ← canonical hook files (shared baseline)
 *
 * ── Target layout (.gsd/harnesses/) ──────────────────────────────────────────
 *
 *   .gsd/harnesses/<harness>/
 *     get-shit-done/           ← GSD content tree (bin/, workflows/, etc.)
 *       bin/
 *         gsd-tools.cjs        ← copied from .gsd/bin/agent/gsd-tools.cjs
 *         lib/
 *           core.cjs           ← per-harness from .gsd/bin/<harness>/lib/core.cjs
 *           profile-output.cjs ← per-harness (agent version for most)
 *           [other *.cjs]      ← from .<harness>/get-shit-done/bin/lib/ if present
 *       [other dirs]           ← from .<harness>/get-shit-done/ (refs, workflows…)
 *     skills/                  ← opencode only, from .opencode/skills/
 *     gsd-file-manifest.json   ← from .<harness>/gsd-file-manifest.json if present
 *
 * ── Assembly strategy ─────────────────────────────────────────────────────────
 *
 *   1. For each harness, create .gsd/harnesses/<harness>/get-shit-done/bin/lib/
 *   2. Lay down shared baseline: copy gsd-tools.cjs to bin/
 *   3. Apply per-harness CJS overrides: copy .gsd/bin/<harness>/lib/*.cjs
 *   4. Copy any additional content from .<harness>/get-shit-done/ (references, etc.)
 *   5. Copy opencode/skills → .gsd/harnesses/opencode/skills/
 *   6. Copy gsd-file-manifest.json from .<harness>/ if present
 *
 * ── Full-checkout mode vs. sparse-worktree mode ───────────────────────────────
 *
 *   In the full checkout, .<harness>/get-shit-done/ contains the complete tree
 *   (bin/lib/*.cjs, workflows/, templates/, commands/, agents/, VERSION, etc.).
 *   In this sparse worktree only fragments exist (references/, skills/).
 *
 *   The script handles both cases: it copies whatever IS present from
 *   .<harness>/get-shit-done/ and then applies CJS overrides on top.
 *
 * Usage:
 *   node scripts/build-harnesses.js           # dry-run (report only)
 *   node scripts/build-harnesses.js --write   # actually write files
 *   node scripts/build-harnesses.js --clean   # wipe output first, then write
 *   node scripts/build-harnesses.js --verbose # show every file operation
 *
 * npm scripts integration (add to package.json):
 *   "build:harnesses": "node scripts/build-harnesses.js --write",
 *   "prepublishOnly": "npm run build:harnesses && <existing checks>"
 *
 * @module build-harnesses
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── CLI flags ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write') || argv.includes('-w') || argv.includes('--clean') || argv.includes('-c');
const CLEAN = argv.includes('--clean') || argv.includes('-c');
const VERBOSE = argv.includes('--verbose') || argv.includes('-v');
const HELP = argv.includes('--help') || argv.includes('-h');

if (HELP) {
    console.log([
        '',
        '  build-harnesses.js - assemble .gsd/harnesses/ for npm publish',
        '',
        '  Usage:',
        '    node scripts/build-harnesses.js [options]',
        '',
        '  Options:',
        '    --write    Actually write files (default: dry-run / report only)',
        '    --clean    Remove output dir before writing (implies --write)',
        '    --verbose  Show every file operation',
        '    --help     Show this help',
        '',
        '  Examples:',
        '    node scripts/build-harnesses.js --write',
        '    node scripts/build-harnesses.js --clean --verbose',
        '',
    ].join('\n'));
    process.exit(0);
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const GSD_DIR = path.join(ROOT, '.gsd');
const BIN_DIR = path.join(GSD_DIR, 'bin');
const HOOKS_SRC = path.join(GSD_DIR, 'hooks');
const HARNESSES_OUT = path.join(GSD_DIR, 'harnesses');

// Shared files from the agent bin directory
const AGENT_BIN = path.join(BIN_DIR, 'agent');
const GSD_TOOLS = path.join(AGENT_BIN, 'gsd-tools.cjs');
const AGENT_LIB = path.join(AGENT_BIN, 'lib');

// ─── Harness definitions ──────────────────────────────────────────────────────

/**
 * Each entry describes one harness to build.
 *
 * @typedef {Object} HarnessDef
 * @property {string}  name    - harness key, e.g. 'agent'
 * @property {string}  srcDir  - root harness dir in the repo, e.g. '.agent'
 * @property {boolean} hooks   - whether to include hooks in the tarball harness
 * @property {boolean} skills  - whether to include an opencode-style skills dir
 */
const HARNESSES = [
    { name: 'agent', srcDir: '.agent', hooks: true, skills: false },
    { name: 'claude', srcDir: '.claude', hooks: true, skills: false },
    { name: 'codex', srcDir: '.codex', hooks: false, skills: false },
    { name: 'cursor', srcDir: '.cursor', hooks: false, skills: false },
    { name: 'gemini', srcDir: '.gemini', hooks: true, skills: false },
    { name: 'github', srcDir: '.github', hooks: false, skills: false },
    { name: 'opencode', srcDir: '.opencode', hooks: true, skills: true },
    { name: 'windsurf', srcDir: '.windsurf', hooks: false, skills: false },
];

// ─── Counters ─────────────────────────────────────────────────────────────────

let totalCopied = 0;
let totalSkipped = 0;
let totalMissing = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** @param {string} msg */
function info(msg) { console.log(`  ${msg}`); }
/** @param {string} msg */
function ok(msg) { console.log(`  ✓ ${msg}`); }
/** @param {string} msg */
function warn(msg) { console.log(`  ⚠ ${msg}`); }
/** @param {string} msg */
function skip(msg) { if (VERBOSE) console.log(`  – ${msg}`); }
/** @param {string} msg */
function verbose(msg) { if (VERBOSE) console.log(`    ${msg}`); }

/**
 * Copy a single file src → dest.
 * In dry-run mode just records what would happen.
 *
 * @param {string} src
 * @param {string} dest
 * @param {string} label  - short label for reporting
 */
function copyFile(src, dest, label) {
    if (!fs.existsSync(src)) {
        warn(`MISSING source: ${label}`);
        totalMissing++;
        return;
    }
    if (WRITE) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        // Preserve executable bit for .cjs entry points
        if (src.endsWith('.cjs') || src.endsWith('.js')) {
            try {
                const srcMode = fs.statSync(src).mode;
                fs.chmodSync(dest, srcMode);
            } catch { /* non-fatal */ }
        }
    }
    verbose(`copy  ${path.relative(ROOT, src)}  →  ${path.relative(ROOT, dest)}`);
    totalCopied++;
}

/**
 * Recursively copy a directory tree src → dest.
 * Skips files that have already been registered in `overrideSet` (by relative path
 * within dest) - used to let CJS overrides "win" over baseline copies.
 *
 * @param {string} src
 * @param {string} dest
 * @param {Set<string>|null} [overrideSet]  - dest-relative paths that must not be clobbered
 */
function copyDir(src, dest, overrideSet) {
    if (!fs.existsSync(src)) {
        skip(`skip  (absent) ${path.relative(ROOT, src)}`);
        return;
    }

    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        const relDest = path.relative(ROOT, destPath);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath, overrideSet);
        } else if (entry.isFile()) {
            if (overrideSet && overrideSet.has(relDest)) {
                skip(`skip  (overridden) ${path.relative(ROOT, srcPath)}`);
                totalSkipped++;
                continue;
            }
            copyFile(srcPath, destPath, path.relative(ROOT, srcPath));
        }
    }
}

// ─── Clean ────────────────────────────────────────────────────────────────────

if (CLEAN && WRITE) {
    if (fs.existsSync(HARNESSES_OUT)) {
        info(`Cleaning ${path.relative(ROOT, HARNESSES_OUT)} …`);
        fs.rmSync(HARNESSES_OUT, { recursive: true, force: true });
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('');
console.log(`  build-harnesses.js - assembling .gsd/harnesses/`);
if (!WRITE) console.log('  [DRY RUN] Pass --write to actually write files.');
console.log('');

// Verify required shared files exist
const requiredShared = [GSD_TOOLS, path.join(AGENT_LIB, 'core.cjs')];
for (const f of requiredShared) {
    if (!fs.existsSync(f)) {
        console.error(`  ✗ ERROR: required shared file missing: ${path.relative(ROOT, f)}`);
        console.error('    Cannot build harnesses without this file.');
        process.exit(1);
    }
}

for (const harness of HARNESSES) {
    const srcRoot = path.join(ROOT, harness.srcDir);            // e.g. /repo/.agent
    const outRoot = path.join(HARNESSES_OUT, harness.name);     // e.g. .gsd/harnesses/agent
    const outGsd = path.join(outRoot, 'get-shit-done');        // …/get-shit-done/
    const outBin = path.join(outGsd, 'bin');                   // …/get-shit-done/bin/
    const outLib = path.join(outBin, 'lib');                   // …/get-shit-done/bin/lib/

    const perHarnessBinLib = path.join(BIN_DIR, harness.name, 'lib'); // .gsd/bin/<harness>/lib/

    info(`── ${harness.srcDir}/  →  .gsd/harnesses/${harness.name}/`);

    // ── 1. Copy gsd-tools.cjs shim (shared entry point) ───────────────────────
    copyFile(
        GSD_TOOLS,
        path.join(outBin, 'gsd-tools.cjs'),
        `gsd-tools.cjs → ${harness.name}/get-shit-done/bin/gsd-tools.cjs`,
    );

    // ── 2. Build the overrideSet: paths that will be written by per-harness CJS ─
    //    We collect these first so copyDir (step 4) knows which files to skip.
    const overrideSet = new Set();

    if (fs.existsSync(perHarnessBinLib)) {
        for (const entry of fs.readdirSync(perHarnessBinLib, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.cjs')) {
                const destFile = path.join(outLib, entry.name);
                overrideSet.add(path.relative(ROOT, destFile));
            }
        }
    } else {
        warn(`No .gsd/bin/${harness.name}/lib/ found - will use agent CJS baseline for all lib files`);
    }

    // Always mark gsd-tools.cjs as overridden (we copy it from the shared source,
    // not from the harness-specific dir)
    overrideSet.add(path.relative(ROOT, path.join(outBin, 'gsd-tools.cjs')));

    // ── 3. Copy full get-shit-done/ content from .<harness>/get-shit-done/ ─────
    //    In a full checkout this is the complete tree. In a sparse worktree only
    //    fragments (references/) exist - we still copy what's there.
    const srcGsd = path.join(srcRoot, 'get-shit-done');
    if (fs.existsSync(srcGsd)) {
        copyDir(srcGsd, outGsd, overrideSet);
    } else {
        // No harness-specific content; that's OK for harnesses that don't have a
        // separate get-shit-done/ dir in the repo root (e.g. .cursor, .windsurf)
        skip(`${harness.srcDir}/get-shit-done/ absent - skipping baseline copy`);
    }

    // ── 4. Apply per-harness CJS overrides ────────────────────────────────────
    if (fs.existsSync(perHarnessBinLib)) {
        for (const entry of fs.readdirSync(perHarnessBinLib, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.cjs')) {
                copyFile(
                    path.join(perHarnessBinLib, entry.name),
                    path.join(outLib, entry.name),
                    `.gsd/bin/${harness.name}/lib/${entry.name}`,
                );
            }
        }
        ok(`bin/lib/ CJS overrides applied (${harness.name})`);
    } else if (harness.name !== 'agent') {
        // For non-agent harnesses without their own lib/ dir, copy agent baseline
        warn(`${harness.name}: no per-harness lib/ overrides - falling back to agent baseline`);
        if (fs.existsSync(AGENT_LIB)) {
            copyDir(AGENT_LIB, outLib, null);
        }
    } else {
        // agent: lib/ comes from .gsd/bin/agent/lib/
        if (fs.existsSync(AGENT_LIB)) {
            for (const entry of fs.readdirSync(AGENT_LIB, { withFileTypes: true })) {
                if (entry.isFile() && entry.name.endsWith('.cjs')) {
                    copyFile(
                        path.join(AGENT_LIB, entry.name),
                        path.join(outLib, entry.name),
                        `agent lib: ${entry.name}`,
                    );
                }
            }
        }
    }

    // ── 4b. Copy shared agent lib files not provided by per-harness override ──
    //   All harnesses share the same dependency graph from core.cjs:
    //   core.cjs → model-profiles.cjs (and potentially other shared files).
    //   After applying per-harness overrides above, copy any AGENT_LIB files
    //   not already present in the output lib/ dir.
    if (harness.name !== 'agent' && fs.existsSync(AGENT_LIB)) {
        for (const entry of fs.readdirSync(AGENT_LIB, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.cjs')) {
                const destFile = path.join(outLib, entry.name);
                // Only copy if this file is not already there (per-harness override wins)
                if (!fs.existsSync(destFile)) {
                    copyFile(
                        path.join(AGENT_LIB, entry.name),
                        destFile,
                        `shared lib: ${entry.name} → ${harness.name}`,
                    );
                } else {
                    skip(`skip  (already present) shared lib/${entry.name} for ${harness.name}`);
                }
            }
        }
    }

    // ── 5. Copy hooks ─────────────────────────────────────────────────────────
    //    Prefer per-harness hooks (.<harness>/hooks/) over .gsd/hooks/ baseline.
    if (harness.hooks) {
        const harnessHooks = path.join(srcRoot, 'hooks');
        const outHooks = path.join(outRoot, 'hooks');

        const hooksSrc = fs.existsSync(harnessHooks) ? harnessHooks : HOOKS_SRC;

        if (fs.existsSync(hooksSrc)) {
            copyDir(hooksSrc, outHooks, null);
            ok(`hooks/ (${harness.name}) ← ${path.relative(ROOT, hooksSrc)}`);
        } else {
            warn(`${harness.name}: no hooks source found (tried ${path.relative(ROOT, harnessHooks)} and .gsd/hooks/)`);
        }
    }

    // ── 6. Copy skills (opencode only) ────────────────────────────────────────
    if (harness.skills) {
        const srcSkills = path.join(srcRoot, 'skills');
        const outSkills = path.join(outRoot, 'skills');

        if (fs.existsSync(srcSkills)) {
            copyDir(srcSkills, outSkills, null);
            const count = countFiles(srcSkills);
            ok(`skills/ (${harness.name}) - ${count} file${count === 1 ? '' : 's'}`);
        } else {
            warn(`${harness.name}: skills/ absent at ${path.relative(ROOT, srcSkills)}`);
        }
    }

    // ── 7. Copy gsd-file-manifest.json ────────────────────────────────────────
    const manifestSrc = path.join(srcRoot, 'gsd-file-manifest.json');
    const manifestDest = path.join(outRoot, 'gsd-file-manifest.json');

    if (fs.existsSync(manifestSrc)) {
        copyFile(manifestSrc, manifestDest, `${harness.srcDir}/gsd-file-manifest.json`);
        ok(`gsd-file-manifest.json (${harness.name})`);
    } else {
        skip(`${harness.srcDir}/gsd-file-manifest.json absent - skipping`);
    }

    console.log('');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('  ────────────────────────────────────────────────');
if (!WRITE) {
    console.log(`  DRY RUN complete.`);
    console.log(`  Would copy:   ${totalCopied} file(s)`);
    console.log(`  Would skip:   ${totalSkipped} file(s) (overridden)`);
    if (totalMissing > 0) {
        console.log(`  Missing src:  ${totalMissing} file(s)  ← these won't be in the tarball`);
    }
    console.log('');
    console.log('  Run with --write to actually write files.');
} else {
    console.log(`  Build complete.`);
    console.log(`  Copied:   ${totalCopied} file(s)`);
    console.log(`  Skipped:  ${totalSkipped} file(s) (overridden)`);
    if (totalMissing > 0) {
        console.log(`  Missing:  ${totalMissing} file(s) source not found`);
        console.log('');
        console.log('  ⚠  Some source files were missing. The harness may be incomplete.');
        console.log('     This is expected in a sparse worktree. Run in the full checkout');
        console.log('     (where .agent/get-shit-done/bin/, workflows/, etc. are present)');
        console.log('     to get a complete build before publishing.');
    }
}
console.log('');

// Exit with error code if critical files were missing AND we wrote
if (WRITE && totalMissing > 0 && totalCopied === 0) {
    process.exit(1);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Count files recursively in a directory.
 * @param {string} dir
 * @returns {number}
 */
function countFiles(dir) {
    if (!fs.existsSync(dir)) return 0;
    let n = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) n += countFiles(path.join(dir, entry.name));
        else if (entry.isFile()) n++;
    }
    return n;
}
