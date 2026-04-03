#!/usr/bin/env node
/**
 * audit-harness-sync.cjs
 *
 * Cross-harness GSD installation consistency auditor.
 *
 * Compares SHA256 hashes recorded in each harness's gsd-file-manifest.json
 * and reports any files that differ across harnesses so that partial update
 * failures are caught immediately.
 *
 * Usage:
 *   node scripts/audit-harness-sync.cjs [options]
 *
 * Options:
 *   --filter <glob>   Only audit files matching this prefix  (e.g. "get-shit-done/bin/lib/")
 *   --json            Emit machine-readable JSON instead of a human report
 *   --strict          Exit with code 1 when any divergence is found
 *   --help            Show this message
 *
 * Examples:
 *   node scripts/audit-harness-sync.cjs
 *   node scripts/audit-harness-sync.cjs --filter "get-shit-done/bin/"
 *   node scripts/audit-harness-sync.cjs --json | jq '.divergent | keys'
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const c = {
  reset:  isTTY ? '\x1b[0m'  : '',
  bold:   isTTY ? '\x1b[1m'  : '',
  dim:    isTTY ? '\x1b[2m'  : '',
  red:    isTTY ? '\x1b[31m' : '',
  green:  isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan:   isTTY ? '\x1b[36m' : '',
};
const ok   = `${c.green}✔${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const fail = `${c.red}✘${c.reset}`;
const info = `${c.cyan}ℹ${c.reset}`;

// ─── CLI arg parsing ──────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
let   filter  = null;   // prefix / substring filter
let   jsonOut = false;
let   strict  = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--filter': filter  = args[++i]; break;
    case '--json':   jsonOut = true;      break;
    case '--strict': strict  = true;      break;
    case '--help':   printHelp(); process.exit(0); break;
    default:
      console.error(`Unknown argument: ${args[i]}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
Usage: node scripts/audit-harness-sync.cjs [options]

Options:
  --filter <prefix>   Only check files whose path starts with <prefix>
  --json              Output machine-readable JSON
  --strict            Exit with code 1 when divergence is found
  --help              Show this help message

Examples:
  node scripts/audit-harness-sync.cjs
  node scripts/audit-harness-sync.cjs --filter "get-shit-done/bin/lib/"
  node scripts/audit-harness-sync.cjs --json | jq .summary
`);
}

// ─── Harness discovery ────────────────────────────────────────────────────────
// Resolve relative to the repo root (two directories up from scripts/)
const REPO_ROOT = path.resolve(__dirname, '..');

const HARNESS_DIRS = [
  '.agent',
  '.claude',
  '.codex',
  '.cursor',
  '.gemini',
  '.github',
  '.opencode',
  '.windsurf',
];

const MANIFEST_FILENAME = 'gsd-file-manifest.json';

/**
 * Load all manifests that exist on disk.
 * Returns an array of  { harness, version, timestamp, files }
 */
function loadManifests() {
  const results = [];
  for (const dir of HARNESS_DIRS) {
    const manifestPath = path.join(REPO_ROOT, dir, MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) continue;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.warn(`${warn} Could not parse ${manifestPath}: ${err.message}`);
      continue;
    }
    results.push({
      harness:   dir,
      version:   raw.version   || '(unknown)',
      timestamp: raw.timestamp || '(unknown)',
      files:     raw.files     || {},
    });
  }
  return results;
}

// ─── Core comparison logic ────────────────────────────────────────────────────
/**
 * Build a universe of { file → { harness → hash } } maps.
 *
 * @param {Array}  manifests  Output of loadManifests()
 * @param {string|null} filterPrefix  If set, skip files not starting with this prefix
 * @returns {{ byFile: Map, harnesses: string[] }}
 */
function buildFileMap(manifests, filterPrefix) {
  const harnesses = manifests.map(m => m.harness);
  // file path → Map< harness, hash >
  const byFile = new Map();

  for (const { harness, files } of manifests) {
    for (const [filePath, hash] of Object.entries(files)) {
      if (filterPrefix && !filePath.startsWith(filterPrefix)) continue;
      if (!byFile.has(filePath)) byFile.set(filePath, new Map());
      byFile.get(filePath).set(harness, hash);
    }
  }
  return { byFile, harnesses };
}

/**
 * Categorise every file path as:
 *   - synced     : all harnesses that carry this file agree on the hash
 *   - divergent  : at least two harnesses disagree
 *   - partial    : the file is absent from one or more harnesses
 *                  (but only those harnesses that *should* share it do share it)
 *
 * A harness "should" have a file only if it's present in at least one other
 * harness — i.e. we don't flag harness-exclusive files as partial unless
 * another harness claims the same path.
 */
function analyseFiles({ byFile, harnesses }) {
  const synced    = [];   // file paths where every present harness agrees
  const divergent = {};   // file path → { hashes: Map<harness,hash>, groups: {hash:[harness[]]} }
  const partial   = {};   // file path → { present: string[], absent: string[] }

  for (const [filePath, hashMap] of byFile) {
    const present = [...hashMap.keys()];
    const absent  = harnesses.filter(h => !hashMap.has(h));

    // Unique hash values among present harnesses
    const uniqueHashes = new Set(hashMap.values());

    if (uniqueHashes.size === 1 && absent.length === 0) {
      // Perfect: everyone has it and agrees
      synced.push(filePath);
    } else if (uniqueHashes.size > 1) {
      // Hash mismatch — divergent regardless of presence
      const groups = {};
      for (const [h, hash] of hashMap) {
        if (!groups[hash]) groups[hash] = [];
        groups[hash].push(h);
      }
      divergent[filePath] = {
        hashes: Object.fromEntries(hashMap),
        groups,
        absent,
      };
    } else {
      // uniqueHashes.size === 1 but some harnesses are missing this file
      if (present.length > 1 && absent.length > 0) {
        partial[filePath] = { present, absent };
      } else {
        // Only one harness has it — treat as synced (harness-exclusive)
        synced.push(filePath);
      }
    }
  }

  return { synced, divergent, partial };
}

// ─── Reporting ────────────────────────────────────────────────────────────────
function printHumanReport(manifests, analysis, filterPrefix) {
  const { synced, divergent, partial } = analysis;
  const harnessNames = manifests.map(m => m.harness);

  console.log(`\n${c.bold}═══ GSD Cross-Harness Sync Audit ═══${c.reset}`);
  console.log(`${info} Repo root  : ${REPO_ROOT}`);
  console.log(`${info} Harnesses  : ${harnessNames.join('  ')}`);
  if (filterPrefix) {
    console.log(`${info} Filter     : ${c.yellow}${filterPrefix}${c.reset}`);
  }
  console.log('');

  // Version table
  console.log(`${c.bold}Harness versions:${c.reset}`);
  for (const { harness, version, timestamp } of manifests) {
    console.log(`  ${harness.padEnd(12)}  v${version}  (${timestamp})`);
  }
  console.log('');

  // Summary counts
  const totalFiles     = synced.length + Object.keys(divergent).length + Object.keys(partial).length;
  const divergentCount = Object.keys(divergent).length;
  const partialCount   = Object.keys(partial).length;

  console.log(`${c.bold}Summary:${c.reset}`);
  console.log(`  ${ok} Synced     : ${c.green}${synced.length}${c.reset} file${synced.length !== 1 ? 's' : ''}`);
  console.log(`  ${fail} Divergent  : ${divergentCount > 0 ? c.red : c.green}${divergentCount}${c.reset} file${divergentCount !== 1 ? 's' : ''}`);
  console.log(`  ${warn} Partial    : ${partialCount   > 0 ? c.yellow : c.green}${partialCount}${c.reset} file${partialCount !== 1 ? 's' : ''}`);
  console.log(`       Total     : ${totalFiles} files examined`);

  // ── Divergent files ──────────────────────────────────────────────────────
  if (divergentCount > 0) {
    console.log(`\n${c.bold}${c.red}Divergent files (hash mismatch):${c.reset}`);
    for (const [filePath, info_] of Object.entries(divergent)) {
      console.log(`\n  ${fail} ${c.bold}${filePath}${c.reset}`);
      // Group harnesses by the hash they hold
      const sortedGroups = Object.entries(info_.groups)
        .sort(([,a],[,b]) => b.length - a.length);  // majority first

      for (const [hash, harnessGroup] of sortedGroups) {
        const shortHash = hash.slice(0, 16) + '…';
        console.log(`       ${shortHash}  →  ${harnessGroup.map(h => c.cyan + h + c.reset).join(', ')}`);
      }
      if (info_.absent.length > 0) {
        console.log(`       ${c.dim}(absent from: ${info_.absent.join(', ')})${c.reset}`);
      }
    }
  }

  // ── Partial files ────────────────────────────────────────────────────────
  if (partialCount > 0) {
    console.log(`\n${c.bold}${c.yellow}Partial deployments (file missing from some harnesses):${c.reset}`);
    for (const [filePath, { present, absent }] of Object.entries(partial)) {
      console.log(`\n  ${warn} ${c.bold}${filePath}${c.reset}`);
      console.log(`       present in : ${present.map(h => c.cyan + h + c.reset).join(', ')}`);
      console.log(`       absent from: ${c.yellow}${absent.join(', ')}${c.reset}`);
    }
  }

  // ── Quick-copy helper ────────────────────────────────────────────────────
  if (divergentCount > 0 || partialCount > 0) {
    console.log(`\n${c.bold}${c.dim}Tip: re-install GSD to bring all harnesses in sync:${c.reset}`);
    console.log(`  ${c.dim}npx get-shit-done-cc --force-reinstall${c.reset}`);
    console.log('');
  } else {
    console.log(`\n${ok} ${c.green}All harnesses are perfectly in sync.${c.reset}\n`);
  }
}

function printJsonReport(manifests, analysis) {
  const { synced, divergent, partial } = analysis;
  const output = {
    generatedAt: new Date().toISOString(),
    harnesses: manifests.map(({ harness, version, timestamp }) => ({
      harness, version, timestamp,
    })),
    summary: {
      totalExamined: synced.length + Object.keys(divergent).length + Object.keys(partial).length,
      synced:        synced.length,
      divergent:     Object.keys(divergent).length,
      partial:       Object.keys(partial).length,
    },
    synced,
    divergent,
    partial,
  };
  console.log(JSON.stringify(output, null, 2));
}

// ─── Entry point ─────────────────────────────────────────────────────────────
function main() {
  const manifests = loadManifests();

  if (manifests.length === 0) {
    console.error(`${fail} No manifests found. Are you running from the repo root?`);
    process.exit(2);
  }

  if (!jsonOut) {
    // Sanity: warn about harness dirs that have no manifest
    const present = new Set(manifests.map(m => m.harness));
    const missing = HARNESS_DIRS.filter(d => !present.has(d));
    if (missing.length > 0 && !jsonOut) {
      console.warn(`\n${warn} No manifest found for: ${missing.join(', ')}`);
    }
  }

  const { byFile, harnesses } = buildFileMap(manifests, filter);
  const analysis = analyseFiles({ byFile, harnesses });

  if (jsonOut) {
    printJsonReport(manifests, analysis);
  } else {
    printHumanReport(manifests, analysis, filter);
  }

  // Exit code for CI use
  const hasProblem = Object.keys(analysis.divergent).length > 0
                  || Object.keys(analysis.partial).length   > 0;

  if (strict && hasProblem) {
    process.exit(1);
  }
}

main();
