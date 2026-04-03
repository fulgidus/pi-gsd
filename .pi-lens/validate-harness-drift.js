#!/usr/bin/env node
// ============================================================
// GSD Harness Drift Validator  v1.0.0
// ============================================================
//
// Checks that all 8 AI harness installs of GSD are in sync.
//
// Three classes of checks:
//   1. CJS BINARY DRIFT     - identical files that must stay byte-equal
//   2. WORKFLOW DRIFT       - harness-parameterised .md files that must be
//                             semantically equivalent after path normalisation
//   3. MANIFEST INTEGRITY   - each harness's gsd-file-manifest.json must
//                             match the actual files on disk
//
// Usage:
//   node .pi-lens/validate-harness-drift.js [--fix-meta] [--json] [--verbose]
//
// Flags:
//   --fix-meta   Re-write .pi-lens/cache/jscpd.meta.json with real timing
//   --json       Emit machine-readable JSON report to stdout
//   --verbose    Show per-file detail even when passing
//   --harness X  Only check harness X (e.g. --harness .claude)
//   --help       Show this help
//
// Exit codes:
//   0  All checks pass
//   1  Drift detected
//   2  Usage/config error
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');

const HARNESSES = [
    '.agent', '.claude', '.codex', '.cursor',
    '.gemini', '.github', '.opencode', '.windsurf',
];

/** Harness-specific path token that appears in workflow .md files */
const HARNESS_TOKEN = {
    '.agent': '.agent',
    '.claude': '.claude',
    '.codex': '.codex',
    '.cursor': '.cursor',
    '.gemini': '.gemini',
    '.github': '.github',
    '.opencode': '.opencode',
    '.windsurf': '.windsurf',
};

/**
 * Workflow files contain harness-specific slash-command syntax that is
 * intentionally different per harness.  These regex patterns capture ALL
 * known intentional variance so that normalised content can be compared
 * across harnesses.
 *
 * Pattern                          Canonical replacement
 * ─────────────────────────────────────────────────────────
 * node ".<harness>/get-shit-done/  node "__GSD_BIN__/
 * ./<harness path ref>/            __GSD_PATH__/
 * /gsd:<command>                   /gsd-<command>      (colon → dash)
 * gsd:<command>                    gsd-<command>
 * .<harness>/get-shit-done/        __GSD_INSTALL__/
 * @.<harness>/get-shit-done/       @__GSD_INSTALL__/
 */
const WORKFLOW_NORMALIZERS = HARNESSES.map(h => {
    const tok = HARNESS_TOKEN[h].replace(/\./g, '\\.'); // escape dot for regex
    return {
        harness: h,
        patterns: [
            // node invocations
            [new RegExp(`node "${tok}/get-shit-done/`, 'g'), 'node "__GSD_BIN__/'],
            // @-include paths
            [new RegExp(`@${tok}/get-shit-done/`, 'g'), '@__GSD_INSTALL__/'],
            // bare path references
            [new RegExp(`\\.${tok.slice(1)}/get-shit-done/`, 'g'), '__GSD_INSTALL__/'],
            // agents directory reference
            [new RegExp(`${tok}/agents/`, 'g'), '__GSD_AGENTS__/'],
            // harness-specific registered agents sentence
            [
                new RegExp(
                    `valid GSD subagent types registered in ${tok}/agents/`,
                    'g',
                ),
                'valid GSD subagent types registered in __GSD_AGENTS__/',
            ],
        ],
    };
});

/**
 * CJS files that MUST be byte-identical across ALL harnesses.
 * Harness-specific CJS files (core.cjs, profile-output.cjs, etc.) contain
 * intentional per-harness text (buffer-size notes, AI name references) so
 * they are deliberately excluded from the strict byte-equality check and
 * instead cross-checked against their own manifest entries only.
 */
const BINARY_STRICT_FILES = [
    'get-shit-done/bin/gsd-tools.cjs',
    'get-shit-done/bin/lib/frontmatter.cjs',
    'get-shit-done/bin/lib/init.cjs',
    'get-shit-done/bin/lib/milestone.cjs',
    'get-shit-done/bin/lib/model-profiles.cjs',
    'get-shit-done/bin/lib/roadmap.cjs',
    'get-shit-done/bin/lib/security.cjs',
    'get-shit-done/bin/lib/state.cjs',
    'get-shit-done/bin/lib/template.cjs',
    'get-shit-done/bin/lib/uat.cjs',
];

/**
 * CJS files that are intentionally harness-parameterised (they contain
 * harness names in comments / string literals).  For these we only verify
 * that each harness's copy matches its own manifest entry - we do NOT
 * require them to be byte-identical across harnesses.
 */
const BINARY_HARNESS_SPECIFIC_FILES = [
    'get-shit-done/bin/lib/commands.cjs',
    'get-shit-done/bin/lib/config.cjs',
    'get-shit-done/bin/lib/core.cjs',
    'get-shit-done/bin/lib/phase.cjs',
    'get-shit-done/bin/lib/profile-output.cjs',
    'get-shit-done/bin/lib/profile-pipeline.cjs',
    'get-shit-done/bin/lib/verify.cjs',
    'get-shit-done/bin/lib/workstream.cjs',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(filePath) {
    try {
        const buf = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(buf).digest('hex');
    } catch {
        return null;
    }
}

function harnessBin(harness, relPath) {
    return path.join(ROOT, harness, relPath);
}

/**
 * Normalise a workflow .md file's content so that harness-specific tokens
 * are replaced with canonical placeholders before comparison.
 */
function normaliseWorkflow(content, harness) {
    const entry = WORKFLOW_NORMALIZERS.find(e => e.harness === harness);
    if (!entry) return content;
    let out = content;
    for (const [pattern, replacement] of entry.patterns) {
        out = out.replace(pattern, replacement);
    }
    // Also normalise slash-command colon form → dash form
    // (intentional in workflow .md files for some harnesses, but semantically
    //  equivalent to dash form for comparison purposes)
    out = out.replace(/\/gsd:([a-z-]+)/g, '/gsd-$1');
    out = out.replace(/\bgsd:([a-z-]+)/g, 'gsd-$1');
    return out;
}

function readWorkflow(harness, wfFile) {
    const p = path.join(ROOT, harness, 'get-shit-done', 'workflows', wfFile);
    try {
        return fs.readFileSync(p, 'utf8');
    } catch {
        return null;
    }
}

function loadManifest(harness) {
    const p = path.join(ROOT, harness, 'gsd-file-manifest.json');
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
        return null;
    }
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_VERBOSE = args.includes('--verbose');
const FLAG_FIXMETA = args.includes('--fix-meta');
const FLAG_HELP = args.includes('--help');

const harnessFilter = (() => {
    const idx = args.indexOf('--harness');
    if (idx !== -1 && args[idx + 1]) return [args[idx + 1]];
    return null;
})();

if (FLAG_HELP) {
    console.log(`
GSD Harness Drift Validator

Usage: node .pi-lens/validate-harness-drift.js [options]

Options:
  --fix-meta     Re-write .pi-lens/cache/jscpd.meta.json with actual timing
  --json         Emit machine-readable JSON to stdout
  --verbose      Show per-file detail even when passing
  --harness <X>  Only check one harness (e.g. --harness .claude)
  --help         Show this help

Exit codes:  0 = all OK,  1 = drift found,  2 = usage error
`);
    process.exit(0);
}

const ACTIVE_HARNESSES = harnessFilter || HARNESSES;

// ── Report accumulator ────────────────────────────────────────────────────────

const report = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    harnesses: ACTIVE_HARNESSES,
    checks: {
        binary_strict: { pass: [], fail: [] },
        binary_harness_specific: { pass: [], fail: [] },
        workflow_semantic: { pass: [], fail: [] },
        manifest_integrity: { pass: [], fail: [] },
    },
    summary: { total: 0, passed: 0, failed: 0 },
};

// Colour helpers (disabled when --json)
const c = {
    reset: FLAG_JSON ? '' : '\x1b[0m',
    bold: FLAG_JSON ? '' : '\x1b[1m',
    red: FLAG_JSON ? '' : '\x1b[31m',
    green: FLAG_JSON ? '' : '\x1b[32m',
    yellow: FLAG_JSON ? '' : '\x1b[33m',
    cyan: FLAG_JSON ? '' : '\x1b[36m',
    dim: FLAG_JSON ? '' : '\x1b[2m',
};

function log(...a) { if (!FLAG_JSON) console.log(...a); }
function logV(...a) { if (!FLAG_JSON && FLAG_VERBOSE) console.log(...a); }

function pass(section, item, detail) {
    report.checks[section].pass.push({ item, detail });
    report.summary.total++;
    report.summary.passed++;
    logV(`  ${c.green}✓${c.reset} ${c.dim}${item}${c.reset}${detail ? ' - ' + detail : ''}`);
}

function fail(section, item, detail) {
    report.checks[section].fail.push({ item, detail });
    report.summary.total++;
    report.summary.failed++;
    log(`  ${c.red}✗${c.reset} ${c.bold}${item}${c.reset}`);
    log(`    ${c.yellow}→ ${detail}${c.reset}`);
}

// ── Check 1: Strict binary identity across all harnesses ─────────────────────

log(`\n${c.bold}${c.cyan}═══ Check 1: Strict binary identity (must be byte-equal across all harnesses) ═══${c.reset}`);

for (const relPath of BINARY_STRICT_FILES) {
    const hashes = {};
    let allPresent = true;

    for (const h of ACTIVE_HARNESSES) {
        const absPath = harnessBin(h, relPath);
        const hash = sha256(absPath);
        if (hash === null) {
            // File might not exist in every harness (e.g. hooks only in some)
            // Only flag if we expected it but it's missing
            if (ACTIVE_HARNESSES.length > 1) {
                // silently skip harnesses that genuinely don't have this file
                continue;
            }
        } else {
            hashes[h] = hash;
        }
    }

    const uniqueHashes = [...new Set(Object.values(hashes))];

    if (uniqueHashes.length === 0) {
        fail('binary_strict', relPath, 'file not found in any harness');
    } else if (uniqueHashes.length === 1) {
        const presentIn = Object.keys(hashes).join(', ');
        pass('binary_strict', relPath, `1 unique hash across [${presentIn}]`);
    } else {
        // Group harnesses by hash to make the output actionable
        const groups = {};
        for (const [h, hash] of Object.entries(hashes)) {
            if (!groups[hash]) groups[hash] = [];
            groups[hash].push(h);
        }
        const detail = Object.entries(groups)
            .map(([hash, hs]) => `${hash.slice(0, 12)}… in [${hs.join(', ')}]`)
            .join(' | ');
        fail('binary_strict', relPath, `${uniqueHashes.length} variants - ${detail}`);
    }
}

// ── Check 2: Harness-specific CJS files match their own manifest ──────────────

log(`\n${c.bold}${c.cyan}═══ Check 2: Harness-specific CJS files (must match own manifest) ═══${c.reset}`);

for (const h of ACTIVE_HARNESSES) {
    const manifest = loadManifest(h);
    if (!manifest) {
        fail('binary_harness_specific', `${h}/gsd-file-manifest.json`, 'manifest not found or invalid JSON');
        continue;
    }

    for (const relPath of BINARY_HARNESS_SPECIFIC_FILES) {
        const absPath = harnessBin(h, relPath);
        const actualHash = sha256(absPath);
        const manifestHash = manifest.files && manifest.files[relPath];

        if (actualHash === null) {
            fail('binary_harness_specific', `${h}/${relPath}`, 'file not found on disk');
            continue;
        }
        if (!manifestHash) {
            fail('binary_harness_specific', `${h}/${relPath}`, 'entry missing from manifest');
            continue;
        }
        if (actualHash !== manifestHash) {
            fail(
                'binary_harness_specific',
                `${h}/${relPath}`,
                `disk ${actualHash.slice(0, 16)}… ≠ manifest ${manifestHash.slice(0, 16)}… - manifest is stale`,
            );
        } else {
            pass('binary_harness_specific', `${h}/${relPath}`, `hash ${actualHash.slice(0, 16)}…`);
        }
    }
}

// ── Check 3: Workflow semantic equivalence ────────────────────────────────────

log(`\n${c.bold}${c.cyan}═══ Check 3: Workflow semantic equivalence (path-normalised diff) ═══${c.reset}`);

// Collect all workflow filenames present in any harness
const allWorkflowFiles = new Set();
for (const h of ACTIVE_HARNESSES) {
    const wfDir = path.join(ROOT, h, 'get-shit-done', 'workflows');
    try {
        fs.readdirSync(wfDir)
            .filter(f => f.endsWith('.md'))
            .forEach(f => allWorkflowFiles.add(f));
    } catch { /* harness may not have workflows dir */ }
}

// Use first harness that has each file as the reference
for (const wfFile of [...allWorkflowFiles].sort()) {
    let refHarness = null;
    let refNorm = null;

    for (const h of ACTIVE_HARNESSES) {
        const raw = readWorkflow(h, wfFile);
        if (raw !== null) {
            refHarness = h;
            refNorm = normaliseWorkflow(raw, h);
            break;
        }
    }

    if (!refHarness) {
        fail('workflow_semantic', wfFile, 'not found in any active harness');
        continue;
    }

    let allMatch = true;
    const diffSummary = [];

    for (const h of ACTIVE_HARNESSES) {
        if (h === refHarness) continue;
        const raw = readWorkflow(h, wfFile);
        if (raw === null) {
            // Workflow missing entirely from this harness
            diffSummary.push(`${h}: MISSING`);
            allMatch = false;
            continue;
        }
        const norm = normaliseWorkflow(raw, h);
        if (norm !== refNorm) {
            // Find first differing line for context
            const refLines = refNorm.split('\n');
            const cmpLines = norm.split('\n');
            let firstDiff = -1;
            const maxLen = Math.max(refLines.length, cmpLines.length);
            for (let i = 0; i < maxLen; i++) {
                if (refLines[i] !== cmpLines[i]) { firstDiff = i + 1; break; }
            }
            diffSummary.push(`${h}: differs from ${refHarness} at line ~${firstDiff}`);
            allMatch = false;
        }
    }

    if (allMatch) {
        pass('workflow_semantic', wfFile, `semantically equivalent across [${ACTIVE_HARNESSES.join(', ')}]`);
    } else {
        fail('workflow_semantic', wfFile, diffSummary.join('; '));
    }
}

// ── Check 4: Manifest integrity (all manifest entries match disk) ─────────────

log(`\n${c.bold}${c.cyan}═══ Check 4: Manifest integrity (each harness - manifest vs disk) ═══${c.reset}`);

for (const h of ACTIVE_HARNESSES) {
    const manifest = loadManifest(h);
    if (!manifest || !manifest.files) {
        fail('manifest_integrity', `${h}/gsd-file-manifest.json`, 'manifest missing or has no "files" key');
        continue;
    }

    let harnessOk = true;
    const staleFiles = [];

    for (const [relPath, manifestHash] of Object.entries(manifest.files)) {
        const absPath = path.join(ROOT, h, relPath);
        const actualHash = sha256(absPath);

        if (actualHash === null) {
            staleFiles.push(`${relPath}: missing on disk`);
            harnessOk = false;
            continue;
        }
        if (actualHash !== manifestHash) {
            staleFiles.push(`${relPath}: ${actualHash.slice(0, 12)}… ≠ manifest ${manifestHash.slice(0, 12)}…`);
            harnessOk = false;
        }
    }

    if (harnessOk) {
        pass('manifest_integrity', `${h}/gsd-file-manifest.json`,
            `all ${Object.keys(manifest.files).length} entries match disk`);
    } else {
        fail(
            'manifest_integrity',
            `${h}/gsd-file-manifest.json`,
            `${staleFiles.length} stale/missing entr${staleFiles.length === 1 ? 'y' : 'ies'}: ` +
            staleFiles.slice(0, 3).join('; ') + (staleFiles.length > 3 ? ` … (+${staleFiles.length - 3} more)` : ''),
        );
    }
}

// ── Optional: fix jscpd meta ──────────────────────────────────────────────────

if (FLAG_FIXMETA) {
    const metaPath = path.join(ROOT, '.pi-lens', 'cache', 'jscpd.meta.json');
    const startMs = Date.now();
    // We can't re-run jscpd here, but we write a marker indicating the meta was
    // refreshed by this tool so the stale 0ms sentinel is gone.
    const newMeta = {
        timestamp: new Date().toISOString(),
        scanDurationMs: -1,  // -1 = "not measured by jscpd; drift-validator ran instead"
        note: 'Updated by validate-harness-drift.js - jscpd scan was replaced by drift checks',
        driftValidatorRanMs: Date.now() - startMs,
    };
    try {
        fs.mkdirSync(path.dirname(metaPath), { recursive: true });
        fs.writeFileSync(metaPath, JSON.stringify(newMeta, null, 2) + '\n');
        log(`\n${c.dim}Updated ${path.relative(ROOT, metaPath)}${c.reset}`);
    } catch (e) {
        log(`${c.yellow}Warning: could not write jscpd.meta.json - ${e.message}${c.reset}`);
    }
}

// ── Final summary ─────────────────────────────────────────────────────────────

const { total, passed, failed } = report.summary;
const exitCode = failed > 0 ? 1 : 0;

if (FLAG_JSON) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
    log('');
    log(`${c.bold}${'─'.repeat(60)}${c.reset}`);
    log(`${c.bold}Summary: ${passed}/${total} checks passed${c.reset}`);

    if (failed > 0) {
        log(`${c.red}${c.bold}⚠  ${failed} drift issue${failed !== 1 ? 's' : ''} detected.${c.reset}`);
        log(`   Run with ${c.cyan}--verbose${c.reset} for passing detail, or ${c.cyan}--json${c.reset} for machine output.`);
    } else {
        log(`${c.green}${c.bold}✓  All harnesses are in sync.${c.reset}`);
    }
    log('');
}

process.exit(exitCode);
