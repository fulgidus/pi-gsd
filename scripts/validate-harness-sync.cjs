#!/usr/bin/env node
/**
 * validate-harness-sync.cjs
 *
 * Regression test: verifies that all 8 AI harness installations of GSD remain
 * in sync with each other. Detects "harness drift" - the situation where one
 * harness gets updated but others are left behind.
 *
 * ── What it checks ──────────────────────────────────────────────────────────
 *
 *  1. BINARY CHECK  (.cjs files)
 *     Every harness copy of each CJS binary must be byte-identical to the
 *     canonical copy in .agent/. These files have NO harness-specific content
 *     and must stay identical across all installations.
 *
 *  2. WORKFLOW SEMANTIC CHECK  (workflows/*.md, agents/*.md, skills/[*]/SKILL.md,
 *                               references/*.md, templates/*.md)
 *     Markdown files contain harness-specific tokens:
 *       • Path tokens:     ".agent/"   ".claude/"  etc.
 *       • Command prefix:  "/gsd-"     "/gsd:"
 *       • Arguments var:   "$ARGUMENTS"  "{{GSD_ARGS}}"
 *     After normalising those tokens to a canonical form the content of each
 *     file must be identical across all harnesses (any remaining diff = drift).
 *
 *  3. FILE-SET CHECK  (structural completeness)
 *     Every harness must have exactly the file set declared in its own
 *     gsd-file-manifest.json. Missing or extra files are reported.
 *     Additionally, files that exist in the manifest of every harness must
 *     exist in every harness (cross-harness completeness).
 *
 *  4. VERSION CHECK
 *     get-shit-done/VERSION must be identical across all harnesses.
 *
 *  5. MANIFEST INTEGRITY CHECK
 *     Each harness gsd-file-manifest.json SHA-256 hash must match the file
 *     actually on disk (tamper / stale-manifest detection).
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/validate-harness-sync.cjs               # full check
 *   node scripts/validate-harness-sync.cjs --verbose     # include per-file OK lines
 *   node scripts/validate-harness-sync.cjs --quiet       # only errors + exit code
 *   node scripts/validate-harness-sync.cjs --check cjs   # one check type only
 *   node scripts/validate-harness-sync.cjs --check workflow
 *   node scripts/validate-harness-sync.cjs --check fileset
 *   node scripts/validate-harness-sync.cjs --check version
 *   node scripts/validate-harness-sync.cjs --check manifest
 *   node scripts/validate-harness-sync.cjs --harness claude,cursor
 *   node scripts/validate-harness-sync.cjs --json        # machine-readable output
 *   node scripts/validate-harness-sync.cjs --update-cache  # refresh .pi-lens cache
 *
 * ── Exit codes ──────────────────────────────────────────────────────────────
 *   0  - all checks passed
 *   1  - one or more drift / integrity failures detected
 *   2  - argument / configuration error
 *
 * ── Integration ─────────────────────────────────────────────────────────────
 *   Add to package.json:
 *     "scripts": { "lint:harness": "node scripts/validate-harness-sync.cjs" }
 *
 *   GitHub Actions (.github/workflows/harness-sync.yml):
 *     - run: node scripts/validate-harness-sync.cjs --quiet
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');

/** All harness directory names (no leading dot - we add it below). */
const ALL_HARNESSES = ['agent', 'claude', 'codex', 'cursor', 'gemini', 'github', 'opencode', 'windsurf'];

/** Canonical harness: all CJS binaries are verified against this one. */
const CANONICAL_HARNESS = 'agent';

/**
 * Per-harness metadata used for normalisation.
 *
 * cmdSep    - the command separator used in workflow markdown ("-" or ":")
 * argsVar   - the arguments variable token used in workflow markdown
 */
const HARNESS_META = {
    agent: { cmdSep: '-', argsVar: '$ARGUMENTS' },
    claude: { cmdSep: ':', argsVar: '$ARGUMENTS' },
    codex: { cmdSep: ':', argsVar: '{{GSD_ARGS}}' },
    cursor: { cmdSep: '-', argsVar: '{{GSD_ARGS}}' },
    gemini: { cmdSep: ':', argsVar: '$ARGUMENTS' },
    github: { cmdSep: '-', argsVar: '$ARGUMENTS' },
    opencode: { cmdSep: '-', argsVar: '$ARGUMENTS' },
    windsurf: { cmdSep: '-', argsVar: '{{GSD_ARGS}}' },
};

/**
 * CJS binary paths relative to the harness's get-shit-done/ directory.
 * These must be byte-for-byte identical across all harnesses.
 *
 * NOTE: Three files are intentionally NOT in this list because they have
 * legitimate per-harness differences:
 *
 *   bin/lib/core.cjs
 *     .agent ships with full JSDoc type annotations (1646 lines); all
 *     distribution harnesses strip those for payload size (1230 lines).
 *     Additionally, cursor/github/windsurf have a single harness-specific
 *     comment referencing their own tool's name.  Runtime behaviour is
 *     identical.
 *
 *   bin/lib/profile-output.cjs
 *     Each harness substitutes its own AI agent name ("Claude", "Cursor",
 *     "Windsurf", etc.) in user-facing profiling questions and targets a
 *     different output file (CLAUDE.md, .cursor/rules/, copilot-instructions.md,
 *     etc.).
 *
 *   bin/lib/profile-pipeline.cjs
 *     Each harness reads session history from a different platform-specific path
 *     (e.g. .agent/projects vs ~/.cursor/projects) and uses a different agent
 *     name in error messages.
 */
const CJS_REL_PATHS = [
    'bin/gsd-tools.cjs',
    'bin/lib/commands.cjs',
    'bin/lib/config.cjs',
    'bin/lib/frontmatter.cjs',
    'bin/lib/init.cjs',
    'bin/lib/milestone.cjs',
    'bin/lib/model-profiles.cjs',
    'bin/lib/phase.cjs',
    'bin/lib/roadmap.cjs',
    'bin/lib/security.cjs',
    'bin/lib/state.cjs',
    'bin/lib/template.cjs',
    'bin/lib/uat.cjs',
    'bin/lib/verify.cjs',
    'bin/lib/workstream.cjs',
];

/**
 * CJS files that are intentionally per-harness.
 * Listed here for documentation / audit purposes only - not checked by Check 1.
 * See §5 of HARNESS_DIFF.md for details.
 */
const HARNESS_SPECIFIC_CJS_PATHS = [
    'bin/lib/core.cjs',           // JSDoc stripping + harness-name comments
    'bin/lib/profile-output.cjs', // agent branding + output file path
    'bin/lib/profile-pipeline.cjs', // session history path + agent branding
];

/** Normalised canonical value for each harness-specific token after stripping. */
const CANONICAL_PATH_TOKEN = '__HARNESS__';
const CANONICAL_CMD_SEP = '-';       // use dash as canonical separator
const CANONICAL_ARGS_VAR = '$ARGUMENTS';

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
    green: (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
    red: (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
    yellow: (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
    cyan: (s) => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
    bold: (s) => isTTY ? `\x1b[1m${s}\x1b[0m` : s,
    dim: (s) => isTTY ? `\x1b[2m${s}\x1b[0m` : s,
    reset: (s) => isTTY ? `\x1b[0m${s}\x1b[0m` : s,
};

// ── Argument parsing ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

const flagIndex = (flag) => argv.indexOf(flag);
const hasFlag = (flag) => flagIndex(flag) !== -1;
const flagValue = (flag) => {
    const i = flagIndex(flag);
    return i !== -1 ? argv[i + 1] : null;
};

const VERBOSE = hasFlag('--verbose') || hasFlag('-v');
const QUIET = hasFlag('--quiet') || hasFlag('-q');
const JSON_OUTPUT = hasFlag('--json');
const UPDATE_CACHE = hasFlag('--update-cache');

const checkFilter = flagValue('--check');
const VALID_CHECKS = new Set(['cjs', 'workflow', 'fileset', 'version', 'manifest']);
if (checkFilter && !VALID_CHECKS.has(checkFilter)) {
    console.error(`ERROR: Unknown --check value "${checkFilter}". Valid: ${[...VALID_CHECKS].join(', ')}`);
    process.exit(2);
}

const harnessArg = flagValue('--harness');
const requestedHarnesses = harnessArg
    ? harnessArg.split(',').map((h) => h.trim())
    : ALL_HARNESSES;

for (const h of requestedHarnesses) {
    if (!HARNESS_META[h]) {
        console.error(`ERROR: Unknown harness "${h}". Valid: ${ALL_HARNESSES.join(', ')}`);
        process.exit(2);
    }
}

// When a harness subset is requested, always include the canonical one so CJS
// comparison has a baseline (unless the canonical is the only one - skip then).
const harnessesToCheck = requestedHarnesses.includes(CANONICAL_HARNESS)
    ? requestedHarnesses
    : [CANONICAL_HARNESS, ...requestedHarnesses];

// ── Utility helpers ───────────────────────────────────────────────────────────

/**
 * SHA-256 hash of a file's raw bytes.
 * Returns null if the file does not exist.
 * @param {string} filePath
 * @returns {string|null}
 */
function sha256File(filePath) {
    try {
        const buf = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(buf).digest('hex');
    } catch {
        return null;
    }
}

/**
 * Read a text file and return its content, or null if missing.
 * @param {string} filePath
 * @returns {string|null}
 */
function readText(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }
}

/**
 * Absolute path to a harness's GSD root directory.
 * @param {string} harness  e.g. "claude"
 * @returns {string}
 */
function harnessGsdDir(harness) {
    return path.join(REPO_ROOT, `.${harness}`, 'get-shit-done');
}

/**
 * Absolute path to a harness's root directory.
 * @param {string} harness
 * @returns {string}
 */
function harnessRootDir(harness) {
    return path.join(REPO_ROOT, `.${harness}`);
}

/**
 * Normalise harness-specific tokens in a markdown string so that semantically
 * equivalent content from different harnesses produces identical output.
 *
 * Normalised tokens:
 *   ".<harness>/get-shit-done/..."   →  "__HARNESS__/get-shit-done/..."
 *   /gsd:<cmd>                       →  /gsd-<cmd>
 *   {{GSD_ARGS}}                     →  $ARGUMENTS
 *
 * @param {string} content
 * @param {string} harness   e.g. "claude"
 * @returns {string}
 */
function normaliseWorkflow(content, harness) {
    const meta = HARNESS_META[harness];
    let out = content;

    // 1. Normalise harness path token  ".claude/get-shit-done" → "__HARNESS__/get-shit-done"
    //    Handles both quoted and unquoted occurrences.
    const pathPattern = new RegExp(`\\.${harness}\\/get-shit-done`, 'g');
    out = out.replace(pathPattern, `${CANONICAL_PATH_TOKEN}/get-shit-done`);

    // 2. Normalise command separator
    if (meta.cmdSep !== CANONICAL_CMD_SEP) {
        // Replace /gsd:<word> with /gsd-<word>  (avoid touching /gsd-tools refs)
        out = out.replace(/\/gsd:([a-z][a-z0-9-]*)/g, `/gsd-$1`);
    }

    // 3. Normalise arguments variable
    if (meta.argsVar !== CANONICAL_ARGS_VAR) {
        out = out.replace(/\{\{GSD_ARGS\}\}/g, CANONICAL_ARGS_VAR);
    }

    return out;
}

/**
 * Produce a compact human-readable diff summary (first N diverging lines).
 * @param {string} canonical   normalised content from canonical harness
 * @param {string} other       normalised content from target harness
 * @param {number} [maxLines]  max diff pairs to show (default 8)
 * @returns {string}
 */
function shortDiff(canonical, other, maxLines = 8) {
    const cLines = canonical.split('\n');
    const oLines = other.split('\n');
    const maxLen = Math.max(cLines.length, oLines.length);
    const diffs = [];

    for (let i = 0; i < maxLen && diffs.length < maxLines; i++) {
        if (cLines[i] !== oLines[i]) {
            const lineNo = String(i + 1).padStart(4, ' ');
            diffs.push(
                c.dim(`  ${lineNo} `) +
                c.green(`[canonical] ${cLines[i] ?? '(missing)'}`) + '\n' +
                c.dim(`  ${lineNo} `) +
                c.red(`[${other === oLines[i] ? 'harness  ' : 'harness  '}] ${oLines[i] ?? '(missing)'}`)
            );
        }
    }

    const totalDiffs = cLines.filter((l, i) => l !== oLines[i]).length +
        Math.abs(cLines.length - oLines.length);

    if (totalDiffs > maxLines) {
        diffs.push(c.dim(`  ... and ${totalDiffs - maxLines} more differing line(s)`));
    }
    return diffs.join('\n');
}

// ── Result accumulator ────────────────────────────────────────────────────────

const results = {
    cjs: { pass: [], fail: [], skip: [] },
    workflow: { pass: [], fail: [], skip: [] },
    fileset: { pass: [], fail: [], skip: [] },
    version: { pass: [], fail: [], skip: [] },
    manifest: { pass: [], fail: [], skip: [] },
};

function record(check, status, detail) {
    results[check][status].push(detail);
}

// ── Check 1: CJS binary integrity ────────────────────────────────────────────

function checkCjsBinaries() {
    if (!QUIET) console.log(c.bold('\n── 1/5  CJS binary check ─────────────────────────────────────────────\n'));

    const canonicalGsdDir = harnessGsdDir(CANONICAL_HARNESS);

    for (const relPath of CJS_REL_PATHS) {
        const canonicalFile = path.join(canonicalGsdDir, relPath);
        const canonicalHash = sha256File(canonicalFile);

        if (!canonicalHash) {
            const detail = { file: relPath, error: `canonical file missing: ${canonicalFile}` };
            record('cjs', 'fail', detail);
            if (!QUIET) console.log(`  ${c.red('MISSING')} ${c.dim(`[canonical]`)} ${relPath}`);
            continue;
        }

        let allOk = true;
        for (const harness of harnessesToCheck) {
            if (harness === CANONICAL_HARNESS) continue;

            // Skip harnesses not in requestedHarnesses (when subset requested)
            if (!requestedHarnesses.includes(harness)) continue;

            const targetFile = path.join(harnessGsdDir(harness), relPath);
            const targetHash = sha256File(targetFile);

            if (!targetHash) {
                record('cjs', 'fail', { harness, file: relPath, error: 'file missing' });
                if (!QUIET) console.log(`  ${c.red('MISSING')} [${harness.padEnd(8)}] ${relPath}`);
                allOk = false;
            } else if (targetHash !== canonicalHash) {
                record('cjs', 'fail', {
                    harness,
                    file: relPath,
                    canonicalHash: canonicalHash.slice(0, 12) + '…',
                    actualHash: targetHash.slice(0, 12) + '…',
                });
                if (!QUIET) {
                    console.log(`  ${c.red('DRIFT')}   [${harness.padEnd(8)}] ${relPath}`);
                    console.log(c.dim(`             canonical: ${canonicalHash.slice(0, 16)}…`));
                    console.log(c.dim(`             actual:    ${targetHash.slice(0, 16)}…`));
                }
                allOk = false;
            } else if (VERBOSE) {
                console.log(`  ${c.green('OK')}      [${harness.padEnd(8)}] ${relPath}`);
            }
        }

        if (allOk) {
            record('cjs', 'pass', { file: relPath });
            if (VERBOSE && !QUIET) {
                console.log(`  ${c.green('OK')}      [all harnesses] ${relPath}`);
            }
        }
    }
}

// ── Check 2: Workflow semantic equivalence ────────────────────────────────────

/**
 * Enumerate markdown files that should be semantically equivalent across all
 * harnesses (after normalisation).
 *
 * Returns relative paths from the harness GSD root (e.g. "workflows/do.md").
 */
function enumerateMarkdownFiles(harness) {
    const gsdDir = harnessGsdDir(harness);
    const results = [];

    const scanDir = (dir, prefix) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // Don't descend into bin/ - those are CJS files handled separately
                if (entry.name !== 'bin') scanDir(full, rel);
            } else if (entry.name.endsWith('.md')) {
                results.push(rel);
            }
        }
    };

    scanDir(gsdDir, '');
    return results.sort();
}

function checkWorkflowSemantics() {
    if (!QUIET) console.log(c.bold('\n── 2/5  Workflow semantic check ──────────────────────────────────────\n'));

    // Build the union of all markdown files across checked harnesses.
    const fileUnion = new Set();
    for (const h of requestedHarnesses) {
        for (const f of enumerateMarkdownFiles(h)) fileUnion.add(f);
    }

    // For each file, normalise content from every harness and compare.
    for (const relPath of [...fileUnion].sort()) {
        // Read and normalise canonical content
        const canonicalContent = readText(path.join(harnessGsdDir(CANONICAL_HARNESS), relPath));
        if (!canonicalContent) {
            // Canonical doesn't have this file - note as informational, not a drift failure
            // (it may be a harness-exclusive file)
            continue;
        }
        const canonicalNorm = normaliseWorkflow(canonicalContent, CANONICAL_HARNESS);

        let fileOk = true;
        for (const harness of requestedHarnesses) {
            if (harness === CANONICAL_HARNESS) continue;

            const targetContent = readText(path.join(harnessGsdDir(harness), relPath));
            if (!targetContent) {
                // File is present in canonical but missing in this harness - handled
                // by the fileset check; skip here to avoid double-reporting.
                continue;
            }

            const targetNorm = normaliseWorkflow(targetContent, harness);

            if (targetNorm !== canonicalNorm) {
                record('workflow', 'fail', { harness, file: relPath });
                if (!QUIET) {
                    console.log(`  ${c.red('DRIFT')}   [${harness.padEnd(8)}] ${relPath}`);
                    if (VERBOSE) {
                        console.log(shortDiff(canonicalNorm, targetNorm));
                    }
                }
                fileOk = false;
            } else if (VERBOSE) {
                console.log(`  ${c.green('OK')}      [${harness.padEnd(8)}] ${relPath}`);
            }
        }

        if (fileOk) {
            record('workflow', 'pass', { file: relPath });
            if (VERBOSE && !QUIET && requestedHarnesses.length > 1) {
                // Already printed per-harness above; summary line only if quiet-ish
            }
        }
    }
}

// ── Check 3: File-set completeness ────────────────────────────────────────────

function checkFileSets() {
    if (!QUIET) console.log(c.bold('\n── 3/5  File-set completeness check ─────────────────────────────────\n'));

    for (const harness of requestedHarnesses) {
        const harnessRoot = harnessRootDir(harness);
        const manifestPath = path.join(harnessRoot, 'gsd-file-manifest.json');
        const manifestText = readText(manifestPath);

        if (!manifestText) {
            record('fileset', 'fail', { harness, error: `manifest not found: ${manifestPath}` });
            if (!QUIET) console.log(`  ${c.red('ERROR')}   [${harness.padEnd(8)}] gsd-file-manifest.json not found`);
            continue;
        }

        let manifest;
        try {
            manifest = JSON.parse(manifestText);
        } catch (e) {
            record('fileset', 'fail', { harness, error: `manifest parse error: ${e.message}` });
            if (!QUIET) console.log(`  ${c.red('ERROR')}   [${harness.padEnd(8)}] gsd-file-manifest.json is invalid JSON`);
            continue;
        }

        const declaredFiles = Object.keys(manifest.files || {});
        const missing = [];
        const extra = [];

        // Check every declared file actually exists
        for (const relFile of declaredFiles) {
            const abs = path.join(harnessRoot, relFile);
            if (!fs.existsSync(abs)) missing.push(relFile);
        }

        // Check for extra .md files under get-shit-done/ not in manifest
        // (bin/*.cjs are expected to not appear in manifests of some harnesses)
        const actualMdFiles = enumerateMarkdownFiles(harness).map((f) => `get-shit-done/${f}`);
        const declaredSet = new Set(declaredFiles);
        for (const f of actualMdFiles) {
            if (!declaredSet.has(f)) extra.push(f);
        }

        if (missing.length === 0 && extra.length === 0) {
            record('fileset', 'pass', { harness, count: declaredFiles.length });
            if (!QUIET) {
                const msg = `  ${c.green('OK')}      [${harness.padEnd(8)}] ${declaredFiles.length} declared files all present`;
                console.log(msg);
            }
        } else {
            if (missing.length > 0) {
                record('fileset', 'fail', { harness, missing });
                if (!QUIET) {
                    console.log(`  ${c.red('MISSING')} [${harness.padEnd(8)}] ${missing.length} file(s) declared in manifest but absent from disk:`);
                    if (VERBOSE) missing.forEach((f) => console.log(c.dim(`             • ${f}`)));
                    else missing.slice(0, 3).forEach((f) => console.log(c.dim(`             • ${f}`)));
                    if (!VERBOSE && missing.length > 3) console.log(c.dim(`             … and ${missing.length - 3} more (--verbose to see all)`));
                }
            }
            if (extra.length > 0) {
                record('fileset', 'fail', { harness, extra });
                if (!QUIET) {
                    console.log(`  ${c.yellow('EXTRA')}   [${harness.padEnd(8)}] ${extra.length} .md file(s) on disk not in manifest:`);
                    if (VERBOSE) extra.forEach((f) => console.log(c.dim(`             • ${f}`)));
                    else extra.slice(0, 3).forEach((f) => console.log(c.dim(`             • ${f}`)));
                    if (!VERBOSE && extra.length > 3) console.log(c.dim(`             … and ${extra.length - 3} more (--verbose to see all)`));
                }
            }
        }
    }
}

// ── Check 4: VERSION consistency ──────────────────────────────────────────────

function checkVersions() {
    if (!QUIET) console.log(c.bold('\n── 4/5  VERSION consistency check ───────────────────────────────────\n'));

    const versions = {};
    for (const harness of requestedHarnesses) {
        const versionFile = path.join(harnessGsdDir(harness), 'VERSION');
        const content = readText(versionFile);
        versions[harness] = content ? content.trim() : null;
    }

    const uniqueVersions = [...new Set(Object.values(versions).filter(Boolean))];
    const missingHarnesses = requestedHarnesses.filter((h) => !versions[h]);

    if (missingHarnesses.length > 0) {
        record('version', 'fail', { missing: missingHarnesses });
        if (!QUIET) {
            missingHarnesses.forEach((h) =>
                console.log(`  ${c.red('MISSING')} [${h.padEnd(8)}] get-shit-done/VERSION`)
            );
        }
    }

    if (uniqueVersions.length <= 1 && missingHarnesses.length === 0) {
        record('version', 'pass', { version: uniqueVersions[0] });
        if (!QUIET) {
            console.log(`  ${c.green('OK')}      All checked harnesses on version ${c.cyan(uniqueVersions[0])}`);
        }
    } else if (uniqueVersions.length > 1) {
        record('version', 'fail', { versions });
        if (!QUIET) {
            console.log(`  ${c.red('MISMATCH')} VERSION differs across harnesses:`);
            for (const [h, v] of Object.entries(versions)) {
                const marker = uniqueVersions.length > 1 ? c.red('✘') : c.green('✔');
                console.log(`  ${marker}  [${h.padEnd(8)}] ${v ?? c.red('(missing)')}`);
            }
        }
    }
}

// ── Check 5: Manifest integrity (SHA-256 verification) ───────────────────────

function checkManifestIntegrity() {
    if (!QUIET) console.log(c.bold('\n── 5/5  Manifest integrity check ────────────────────────────────────\n'));

    for (const harness of requestedHarnesses) {
        const harnessRoot = harnessRootDir(harness);
        const manifestPath = path.join(harnessRoot, 'gsd-file-manifest.json');
        const manifestText = readText(manifestPath);

        if (!manifestText) {
            record('manifest', 'skip', { harness, reason: 'manifest not found (reported in fileset check)' });
            continue;
        }

        let manifest;
        try {
            manifest = JSON.parse(manifestText);
        } catch {
            record('manifest', 'skip', { harness, reason: 'invalid JSON (reported in fileset check)' });
            continue;
        }

        const fileEntries = Object.entries(manifest.files || {});
        const failures = [];
        let checked = 0;

        for (const [relFile, expectedHash] of fileEntries) {
            const abs = path.join(harnessRoot, relFile);
            const actualHash = sha256File(abs);

            if (!actualHash) {
                // Missing file reported by fileset check - skip here
                continue;
            }

            checked++;
            if (actualHash !== expectedHash) {
                failures.push({ file: relFile, expected: expectedHash.slice(0, 12) + '…', actual: actualHash.slice(0, 12) + '…' });
            }
        }

        if (failures.length === 0) {
            record('manifest', 'pass', { harness, checked });
            if (!QUIET) {
                console.log(`  ${c.green('OK')}      [${harness.padEnd(8)}] ${checked} file(s) match manifest hashes`);
            }
        } else {
            record('manifest', 'fail', { harness, failures });
            if (!QUIET) {
                console.log(`  ${c.red('TAMPERED')} [${harness.padEnd(8)}] ${failures.length} file(s) do not match manifest SHA-256:`);
                const show = VERBOSE ? failures : failures.slice(0, 3);
                show.forEach((f) =>
                    console.log(c.dim(`             • ${f.file}`) +
                        c.red(`\n               expected: ${f.expected}`) +
                        c.yellow(`\n               actual:   ${f.actual}`))
                );
                if (!VERBOSE && failures.length > 3) {
                    console.log(c.dim(`             … and ${failures.length - 3} more (--verbose to see all)`));
                }
            }
        }
    }
}

// ── Cache update (.pi-lens) ───────────────────────────────────────────────────

function updatePiLensCache(summary) {
    const cachePath = path.join(REPO_ROOT, '.pi-lens', 'cache', 'jscpd.meta.json');
    try {
        const cacheDir = path.dirname(cachePath);
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

        const meta = {
            timestamp: new Date().toISOString(),
            scanDurationMs: summary.durationMs,
            tool: 'validate-harness-sync',
            version: '1.0.0',
            harnessesChecked: requestedHarnesses,
            checksRun: summary.checksRun,
            totalFailures: summary.totalFailures,
            totalPasses: summary.totalPasses,
        };

        fs.writeFileSync(cachePath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
        if (!QUIET) console.log(c.dim(`\n  Cache updated: ${path.relative(REPO_ROOT, cachePath)}`));
    } catch (e) {
        if (!QUIET) console.log(c.yellow(`\n  Warning: could not update cache: ${e.message}`));
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const startTime = Date.now();

if (!QUIET && !JSON_OUTPUT) {
    const ts = new Date().toISOString();
    console.log(c.bold(`\n╔══════════════════════════════════════════════════════════════════════╗`));
    console.log(c.bold(`║           GSD Harness Drift Detector  •  ${ts.slice(0, 10)}              ║`));
    console.log(c.bold(`╚══════════════════════════════════════════════════════════════════════╝`));
    console.log(c.dim(`  Root:     ${REPO_ROOT}`));
    console.log(c.dim(`  Harnesses: ${requestedHarnesses.join(', ')}`));
    if (checkFilter) console.log(c.dim(`  Check:    ${checkFilter} only`));
}

const RUN_ALL = !checkFilter;

if (RUN_ALL || checkFilter === 'cjs') checkCjsBinaries();
if (RUN_ALL || checkFilter === 'workflow') checkWorkflowSemantics();
if (RUN_ALL || checkFilter === 'fileset') checkFileSets();
if (RUN_ALL || checkFilter === 'version') checkVersions();
if (RUN_ALL || checkFilter === 'manifest') checkManifestIntegrity();

const durationMs = Date.now() - startTime;

// ── Summary ───────────────────────────────────────────────────────────────────

const totalPass = Object.values(results).reduce((n, r) => n + r.pass.length, 0);
const totalFail = Object.values(results).reduce((n, r) => n + r.fail.length, 0);
const totalSkip = Object.values(results).reduce((n, r) => n + r.skip.length, 0);

const summary = {
    durationMs,
    checksRun: checkFilter ? [checkFilter] : [...VALID_CHECKS],
    harnessesChecked: requestedHarnesses,
    totalPasses: totalPass,
    totalFailures: totalFail,
    totalSkipped: totalSkip,
    details: results,
};

if (JSON_OUTPUT) {
    console.log(JSON.stringify(summary, null, 2));
} else if (!QUIET) {
    const bar = '─'.repeat(70);
    console.log(`\n${bar}`);
    if (totalFail === 0) {
        console.log(c.green(c.bold(`✔  All checks passed  (${totalPass} assertions, ${durationMs}ms)`)));
    } else {
        const failBreakdown = Object.entries(results)
            .filter(([, r]) => r.fail.length > 0)
            .map(([check, r]) => `${r.fail.length} ${check}`)
            .join(', ');
        console.log(c.red(c.bold(`✘  Drift detected: ${failBreakdown}`)));
        console.log(c.dim(`   ${totalPass} passed · ${totalFail} failed · ${totalSkip} skipped · ${durationMs}ms`));
        console.log('');
        console.log(c.yellow('  Next steps:'));
        console.log(c.dim('    • Run with --verbose to see full diff details'));
        console.log(c.dim('    • Re-run the GSD install/update script to re-sync harnesses'));
        console.log(c.dim('    • Check HOOKS_ARCHITECTURE.md for harness-specific file guidance'));
    }
    console.log('');
}

if (UPDATE_CACHE) {
    updatePiLensCache(summary);
}

process.exit(totalFail > 0 ? 1 : 0);
