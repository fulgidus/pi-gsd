/**
 * Core - Shared utilities, constants, and internal helpers
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync, spawnSync } = require('child_process');
const { MODEL_PROFILES } = require('./model-profiles.cjs');

// ─── JSDoc type definitions ───────────────────────────────────────────────────

/**
 * @typedef {'sequential'|'custom'} PhaseNamingMode
 */

/**
 * @typedef {'quality'|'balanced'|'budget'|'inherit'} ModelProfile
 */

/**
 * @typedef {false|true|'omit'} ResolveModelIds
 * - false: return alias as-is
 * - true: map alias to full model ID
 * - 'omit': return '' so the runtime uses its own default
 */

/**
 * Resolved GSD project configuration, merged from config.json and defaults.
 *
 * @typedef {Object} GSDConfig
 * @property {ModelProfile}     model_profile              - Active model-profile key
 * @property {boolean}          commit_docs                - Whether to auto-commit .planning/ docs
 * @property {boolean}          search_gitignored          - Search .gitignored files in codebase scans
 * @property {'none'|'phase'|'milestone'|'workstream'} branching_strategy - Git branching strategy
 * @property {string}           phase_branch_template      - Template string for phase branch names
 * @property {string}           milestone_branch_template  - Template string for milestone branch names
 * @property {string|null}      quick_branch_template      - Template string for quick-task branches (null if unset)
 * @property {boolean}          research                   - Enable research workflow step
 * @property {boolean}          plan_checker               - Enable plan-checker agent
 * @property {boolean}          verifier                   - Enable verifier agent
 * @property {boolean}          nyquist_validation         - Enable Nyquist auditor
 * @property {boolean}          parallelization            - Enable parallel plan execution
 * @property {boolean}          brave_search               - Enable Brave Search tool integration
 * @property {boolean}          firecrawl                  - Enable Firecrawl web-scraping integration
 * @property {boolean}          exa_search                 - Enable Exa search integration
 * @property {boolean}          text_mode                  - Use plain-text numbered lists instead of AskUserQuestion menus
 * @property {string[]}         sub_repos                  - Sub-repository directory names inside the project root
 * @property {ResolveModelIds}  resolve_model_ids          - Controls how model aliases are returned
 * @property {number}           context_window             - Context-window size in tokens (e.g. 200000)
 * @property {PhaseNamingMode}  phase_naming               - Phase numbering mode
 * @property {Object<string,string>|null} model_overrides  - Per-agent model overrides keyed by agent name
 * @property {Object<string,*>} agent_skills               - Per-agent skill/capability overrides
 */

/**
 * Return value from {@link checkAgentsInstalled}.
 *
 * @typedef {Object} AgentsInstallStatus
 * @property {boolean}  agents_installed  - True when every expected agent file is present
 * @property {string[]} missing_agents    - Agent names that have no corresponding .md file
 * @property {string[]} installed_agents  - Agent names that are present on disk
 * @property {string}   agents_dir        - Absolute path of the agents directory that was checked
 */

/**
 * Full set of `.planning/` paths for a given CWD / workstream combination.
 *
 * @typedef {Object} PlanningPaths
 * @property {string} planning      - Base .planning/ directory (workstream-aware)
 * @property {string} state         - Path to STATE.md
 * @property {string} roadmap       - Path to ROADMAP.md
 * @property {string} project       - Path to PROJECT.md (always root .planning/, never workstream)
 * @property {string} config        - Path to config.json (always root .planning/, never workstream)
 * @property {string} phases        - Path to phases/ sub-directory
 * @property {string} requirements  - Path to REQUIREMENTS.md
 */

/**
 * Result object returned by {@link searchPhaseInDir} / {@link findPhaseInternal}.
 *
 * @typedef {Object} PhaseSearchResult
 * @property {true}         found            - Always true when a match is returned
 * @property {string}       directory        - Posix-relative path to the phase directory
 * @property {string}       phase_number     - Raw phase number string (e.g. '06', '06A', '06.1')
 * @property {string|null}  phase_name       - Human-readable phase name, or null
 * @property {string|null}  phase_slug       - URL-safe slug derived from phase_name, or null
 * @property {string[]}     plans            - Sorted list of PLAN.md filenames
 * @property {string[]}     summaries        - Sorted list of SUMMARY.md filenames
 * @property {string[]}     incomplete_plans - Plans that have no corresponding SUMMARY
 * @property {boolean}      has_research     - True if a RESEARCH.md exists in the phase dir
 * @property {boolean}      has_context      - True if a CONTEXT.md exists in the phase dir
 * @property {boolean}      has_verification - True if a VERIFICATION.md exists in the phase dir
 * @property {boolean}      has_reviews      - True if a REVIEWS.md exists in the phase dir
 * @property {string}       [archived]       - Present only for archived phases; the milestone version string (e.g. 'v2.0')
 */

/**
 * One entry in the archived-phases list returned by {@link getArchivedPhaseDirs}.
 *
 * @typedef {Object} ArchivedPhaseEntry
 * @property {string} name      - Directory name of the phase (e.g. '05-auth')
 * @property {string} milestone - Milestone version this phase belongs to (e.g. 'v2.0')
 * @property {string} basePath  - Relative base path (e.g. '.planning/milestones/v2.0-phases')
 * @property {string} fullPath  - Absolute filesystem path to the phase directory
 */

/**
 * Milestone version/name info returned by {@link getMilestoneInfo}.
 *
 * @typedef {Object} MilestoneInfo
 * @property {string} version - Version string (e.g. 'v2.1')
 * @property {string} name    - Human-readable milestone name (e.g. 'Belgium')
 */

/**
 * Return value from {@link getRoadmapPhaseInternal}.
 *
 * @typedef {Object} RoadmapPhaseResult
 * @property {true}        found        - Always true when returned
 * @property {string}      phase_number - Phase number as a string
 * @property {string}      phase_name   - Phase name extracted from the heading
 * @property {string|null} goal         - **Goal:** line content, or null if absent
 * @property {string}      section      - Full markdown section text for this phase
 */

/**
 * Low-level git execution result from {@link execGit}.
 *
 * @typedef {Object} GitResult
 * @property {number} exitCode - Numeric process exit code (0 = success)
 * @property {string} stdout   - Trimmed standard output
 * @property {string} stderr   - Trimmed standard error
 */

/**
 * Stats collected from a phase directory by {@link getPhaseFileStats}.
 *
 * @typedef {Object} PhaseFileStats
 * @property {string[]} plans           - PLAN.md filenames found in the directory
 * @property {string[]} summaries       - SUMMARY.md filenames found in the directory
 * @property {boolean}  hasResearch     - True if a RESEARCH.md is present
 * @property {boolean}  hasContext      - True if a CONTEXT.md is present
 * @property {boolean}  hasVerification - True if a VERIFICATION.md is present
 * @property {boolean}  hasReviews      - True if a REVIEWS.md is present
 */

/**
 * Options for {@link reapStaleTempFiles}.
 *
 * @typedef {Object} ReapOptions
 * @property {number}  [maxAgeMs=300000] - Maximum age in milliseconds before a temp file is removed
 * @property {boolean} [dirsOnly=false]  - When true, only removes directories, not regular files
 */

// ─── Path helpers ────────────────────────────────────────────────────────────

/**
 * Normalize a relative path to always use forward slashes (cross-platform).
 *
 * @param {string} p - File-system path (may use OS separator)
 * @returns {string} Path with all separators replaced by '/'
 */
function toPosixPath(p) {
    return p.split(path.sep).join('/');
}

/**
 * Scan immediate child directories for separate git repos.
 * Returns a sorted array of directory names that have their own `.git`.
 * Excludes hidden directories and node_modules.
 *
 * @param {string} cwd - Root directory to scan
 * @returns {string[]} Sorted list of sub-directory names that contain a `.git` entry
 */
function detectSubRepos(cwd) {
    const results = [];
    try {
        const entries = fs.readdirSync(cwd, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const gitPath = path.join(cwd, entry.name, '.git');
            try {
                if (fs.existsSync(gitPath)) {
                    results.push(entry.name);
                }
            } catch { }
        }
    } catch { }
    return results.sort();
}

/**
 * Walk up from `startDir` to find the project root that owns `.planning/`.
 *
 * In multi-repo workspaces, the agent may open inside a sub-repo (e.g. `backend/`)
 * instead of the project root. This function prevents `.planning/` from being
 * created inside the sub-repo by locating the nearest ancestor that already has
 * a `.planning/` directory.
 *
 * Detection strategy (checked in order for each ancestor):
 * 1. Parent has `.planning/config.json` with `sub_repos` listing this directory
 * 2. Parent has `.planning/config.json` with `multiRepo: true` (legacy format)
 * 3. Parent has `.planning/` and current dir has its own `.git` (heuristic)
 *
 * Returns `startDir` unchanged when no ancestor `.planning/` is found (first-run
 * or single-repo projects).
 *
 * @param {string} startDir - Directory to start walking up from
 * @returns {string} Resolved project root directory
 */
function findProjectRoot(startDir) {
    const resolved = path.resolve(startDir);
    const root = path.parse(resolved).root;
    const homedir = require('os').homedir();

    // If startDir already contains .planning/, it IS the project root.
    // Do not walk up to a parent workspace that also has .planning/ (#1362).
    const ownPlanning = path.join(resolved, '.planning');
    if (fs.existsSync(ownPlanning) && fs.statSync(ownPlanning).isDirectory()) {
        return startDir;
    }

    // Check if startDir or any of its ancestors (up to AND including the
    // candidate project root) contains a .git directory. This handles both
    // `backend/` (direct sub-repo) and `backend/src/modules/` (nested inside),
    // as well as the common case where .git lives at the same level as .planning/.
    function isInsideGitRepo(candidateParent) {
        let d = resolved;
        while (d !== root) {
            if (fs.existsSync(path.join(d, '.git'))) return true;
            if (d === candidateParent) break;
            d = path.dirname(d);
        }
        return false;
    }

    let dir = resolved;
    while (dir !== root) {
        const parent = path.dirname(dir);
        if (parent === dir) break; // filesystem root
        if (parent === homedir) break; // never go above home

        const parentPlanning = path.join(parent, '.planning');
        if (fs.existsSync(parentPlanning) && fs.statSync(parentPlanning).isDirectory()) {
            const configPath = path.join(parentPlanning, 'config.json');
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                const subRepos = config.sub_repos || config.planning?.sub_repos || [];

                // Check explicit sub_repos list
                if (Array.isArray(subRepos) && subRepos.length > 0) {
                    const relPath = path.relative(parent, resolved);
                    const topSegment = relPath.split(path.sep)[0];
                    if (subRepos.includes(topSegment)) {
                        return parent;
                    }
                }

                // Check legacy multiRepo flag
                if (config.multiRepo === true && isInsideGitRepo(parent)) {
                    return parent;
                }
            } catch {
                // config.json missing or malformed - fall back to .git heuristic
            }

            // Heuristic: parent has .planning/ and we're inside a git repo
            if (isInsideGitRepo(parent)) {
                return parent;
            }
        }
        dir = parent;
    }
    return startDir;
}

// ─── Output helpers ───────────────────────────────────────────────────────────

/**
 * Remove stale gsd-* temp files/dirs older than maxAgeMs (default: 5 minutes).
 * Runs opportunistically before each new temp file write to prevent unbounded accumulation.
 *
 * @param {string}      [prefix='gsd-'] - Filename prefix to match (e.g. 'gsd-')
 * @param {ReapOptions} [opts={}]        - Configuration options
 * @returns {void}
 */
function reapStaleTempFiles(prefix = 'gsd-', { maxAgeMs = 5 * 60 * 1000, dirsOnly = false } = {}) {
    try {
        const tmpDir = require('os').tmpdir();
        const now = Date.now();
        const entries = fs.readdirSync(tmpDir);
        for (const entry of entries) {
            if (!entry.startsWith(prefix)) continue;
            const fullPath = path.join(tmpDir, entry);
            try {
                const stat = fs.statSync(fullPath);
                if (now - stat.mtimeMs > maxAgeMs) {
                    if (stat.isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } else if (!dirsOnly) {
                        fs.unlinkSync(fullPath);
                    }
                }
            } catch {
                // File may have been removed between readdir and stat - ignore
            }
        }
    } catch {
        // Non-critical - don't let cleanup failures break output
    }
}

/**
 * Serialize `result` as JSON and write to stdout, or write `rawValue` directly
 * when `raw` is true. Large JSON payloads (> 50 KB) are written to a temp file
 * and the path is prefixed with `@file:`.
 *
 * @param {*}      result              - Value to serialize as JSON
 * @param {boolean} [raw=false]        - When true, write rawValue to stdout instead
 * @param {*}      [rawValue]          - Raw string to write when raw is true
 * @returns {void}
 */
function output(result, raw, rawValue) {
    let data;
    if (raw && rawValue !== undefined) {
        data = String(rawValue);
    } else {
        const json = JSON.stringify(result, null, 2);
        // Large payloads exceed Claude Code's Bash tool buffer (~50KB).
        // Write to tmpfile and output the path prefixed with @file: so callers can detect it.
        if (json.length > 50000) {
            reapStaleTempFiles();
            const tmpPath = path.join(require('os').tmpdir(), `gsd-${Date.now()}.json`);
            fs.writeFileSync(tmpPath, json, 'utf-8');
            data = '@file:' + tmpPath;
        } else {
            data = json;
        }
    }
    // process.stdout.write() is async when stdout is a pipe - process.exit()
    // can tear down the process before the reader consumes the buffer.
    // fs.writeSync(1, ...) blocks until the kernel accepts the bytes, and
    // skipping process.exit() lets the event loop drain naturally.
    fs.writeSync(1, data);
}

/**
 * Write an error message to stderr and exit with code 1.
 *
 * @param {string} message - Human-readable error description
 * @returns {never}
 */
function error(message) {
    fs.writeSync(2, 'Error: ' + message + '\n');
    process.exit(1);
}

// ─── File & Config utilities ──────────────────────────────────────────────────

/**
 * Read a file as UTF-8, returning null on any I/O error.
 *
 * @param {string} filePath - Absolute or relative path to read
 * @returns {string|null} File contents, or null if the file could not be read
 */
function safeReadFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

/**
 * Load and merge the project's GSD config from `.planning/config.json`.
 *
 * Handles the following automatically:
 * - Migrates deprecated `depth` → `granularity` key
 * - Migrates legacy `multiRepo: true` → `sub_repos` array
 * - Keeps `sub_repos` in sync with the actual filesystem
 * - Auto-detects whether `.planning/` is gitignored to set `commit_docs`
 *
 * Falls back to built-in defaults when `config.json` is absent or malformed.
 *
 * @param {string} cwd - Project root directory
 * @returns {GSDConfig} Fully resolved configuration object
 */
function loadConfig(cwd) {
    const configPath = path.join(cwd, '.planning', 'config.json');
    const defaults = {
        model_profile: 'balanced',
        commit_docs: true,
        search_gitignored: false,
        branching_strategy: 'none',
        phase_branch_template: 'gsd/phase-{phase}-{slug}',
        milestone_branch_template: 'gsd/{milestone}-{slug}',
        quick_branch_template: null,
        research: true,
        plan_checker: true,
        verifier: true,
        nyquist_validation: true,
        parallelization: true,
        brave_search: false,
        firecrawl: false,
        exa_search: false,
        text_mode: false, // when true, use plain-text numbered lists instead of AskUserQuestion menus
        sub_repos: [],
        resolve_model_ids: false, // false: return alias as-is | true: map to full the agent model ID | "omit": return '' (runtime uses its default)
        context_window: 200000, // default 200k; set to 1000000 for Opus/Sonnet 4.6 1M models
        phase_naming: 'sequential', // 'sequential' (default, auto-increment) or 'custom' (arbitrary string IDs)
    };

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);

        // Migrate deprecated "depth" key to "granularity" with value mapping
        if ('depth' in parsed && !('granularity' in parsed)) {
            const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };
            parsed.granularity = depthToGranularity[parsed.depth] || parsed.depth;
            delete parsed.depth;
            try { fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf-8'); } catch { /* intentionally empty */ }
        }

        // Auto-detect and sync sub_repos: scan for child directories with .git
        let configDirty = false;

        // Migrate legacy "multiRepo: true" boolean → sub_repos array
        if (parsed.multiRepo === true && !parsed.sub_repos && !parsed.planning?.sub_repos) {
            const detected = detectSubRepos(cwd);
            if (detected.length > 0) {
                parsed.sub_repos = detected;
                if (!parsed.planning) parsed.planning = {};
                parsed.planning.commit_docs = false;
                delete parsed.multiRepo;
                configDirty = true;
            }
        }

        // Keep sub_repos in sync with actual filesystem
        const currentSubRepos = parsed.sub_repos || parsed.planning?.sub_repos || [];
        if (Array.isArray(currentSubRepos) && currentSubRepos.length > 0) {
            const detected = detectSubRepos(cwd);
            if (detected.length > 0) {
                const sorted = [...currentSubRepos].sort();
                if (JSON.stringify(sorted) !== JSON.stringify(detected)) {
                    parsed.sub_repos = detected;
                    configDirty = true;
                }
            }
        }

        // Persist sub_repos changes (migration or sync)
        if (configDirty) {
            try { fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf-8'); } catch { }
        }

        const get = (key, nested) => {
            if (parsed[key] !== undefined) return parsed[key];
            if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
                return parsed[nested.section][nested.field];
            }
            return undefined;
        };

        const parallelization = (() => {
            const val = get('parallelization');
            if (typeof val === 'boolean') return val;
            if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
            return defaults.parallelization;
        })();

        return {
            model_profile: get('model_profile') ?? defaults.model_profile,
            commit_docs: (() => {
                const explicit = get('commit_docs', { section: 'planning', field: 'commit_docs' });
                // If explicitly set in config, respect the user's choice
                if (explicit !== undefined) return explicit;
                // Auto-detection: when no explicit value and .planning/ is gitignored,
                // default to false instead of true
                if (isGitIgnored(cwd, '.planning/')) return false;
                return defaults.commit_docs;
            })(),
            search_gitignored: get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? defaults.search_gitignored,
            branching_strategy: get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? defaults.branching_strategy,
            phase_branch_template: get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ?? defaults.phase_branch_template,
            milestone_branch_template: get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? defaults.milestone_branch_template,
            quick_branch_template: get('quick_branch_template', { section: 'git', field: 'quick_branch_template' }) ?? defaults.quick_branch_template,
            research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
            plan_checker: get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? defaults.plan_checker,
            verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
            nyquist_validation: get('nyquist_validation', { section: 'workflow', field: 'nyquist_validation' }) ?? defaults.nyquist_validation,
            parallelization,
            brave_search: get('brave_search') ?? defaults.brave_search,
            firecrawl: get('firecrawl') ?? defaults.firecrawl,
            exa_search: get('exa_search') ?? defaults.exa_search,
            text_mode: get('text_mode', { section: 'workflow', field: 'text_mode' }) ?? defaults.text_mode,
            sub_repos: get('sub_repos', { section: 'planning', field: 'sub_repos' }) ?? defaults.sub_repos,
            resolve_model_ids: get('resolve_model_ids') ?? defaults.resolve_model_ids,
            context_window: get('context_window') ?? defaults.context_window,
            phase_naming: get('phase_naming') ?? defaults.phase_naming,
            model_overrides: parsed.model_overrides || null,
            agent_skills: parsed.agent_skills || {},
        };
    } catch {
        return defaults;
    }
}

// ─── Git utilities ────────────────────────────────────────────────────────────

/**
 * Check whether a path is ignored by git, regardless of tracking status.
 *
 * Uses `git check-ignore --no-index` so that previously-committed paths that
 * are now listed in `.gitignore` are correctly detected as ignored.
 *
 * @param {string} cwd        - Project root (passed as git working directory)
 * @param {string} targetPath - Path to check (relative to `cwd`)
 * @returns {boolean} True when git considers the path ignored
 */
function isGitIgnored(cwd, targetPath) {
    try {
        // --no-index checks .gitignore rules regardless of whether the file is tracked.
        // Without it, git check-ignore returns "not ignored" for tracked files even when
        // .gitignore explicitly lists them - a common source of confusion when .planning/
        // was committed before being added to .gitignore.
        // Use execFileSync (array args) to prevent shell interpretation of special characters
        // in file paths - avoids command injection via crafted path names.
        execFileSync('git', ['check-ignore', '-q', '--no-index', '--', targetPath], {
            cwd,
            stdio: 'pipe',
        });
        return true;
    } catch {
        return false;
    }
}

// ─── Markdown normalization ─────────────────────────────────────────────────

/**
 * Normalize markdown to fix common markdownlint violations.
 * Applied at write points so GSD-generated .planning/ files are IDE-friendly.
 *
 * Rules enforced:
 *   MD022 - Blank lines around headings
 *   MD031 - Blank lines around fenced code blocks
 *   MD032 - Blank lines around lists
 *   MD012 - No multiple consecutive blank lines (collapsed to 2 max)
 *   MD047 - Files end with a single newline
 *
 * @param {string} content - Raw markdown string to normalize
 * @returns {string} Normalized markdown string
 */
function normalizeMd(content) {
    if (!content || typeof content !== 'string') return content;

    // Normalize line endings to LF for consistent processing
    let text = content.replace(/\r\n/g, '\n');

    const lines = text.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prev = i > 0 ? lines[i - 1] : '';
        const prevTrimmed = prev.trimEnd();
        const trimmed = line.trimEnd();

        // MD022: Blank line before headings (skip first line and frontmatter delimiters)
        if (/^#{1,6}\s/.test(trimmed) && i > 0 && prevTrimmed !== '' && prevTrimmed !== '---') {
            result.push('');
        }

        // MD031: Blank line before fenced code blocks
        if (/^```/.test(trimmed) && i > 0 && prevTrimmed !== '' && !isInsideFencedBlock(lines, i)) {
            result.push('');
        }

        // MD032: Blank line before lists (- item, * item, N. item, - [ ] item)
        if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) && i > 0 &&
            prevTrimmed !== '' && !/^(\s*[-*+]\s|\s*\d+\.\s)/.test(prev) &&
            prevTrimmed !== '---') {
            result.push('');
        }

        result.push(line);

        // MD022: Blank line after headings
        if (/^#{1,6}\s/.test(trimmed) && i < lines.length - 1) {
            const next = lines[i + 1];
            if (next !== undefined && next.trimEnd() !== '') {
                result.push('');
            }
        }

        // MD031: Blank line after closing fenced code blocks
        if (/^```\s*$/.test(trimmed) && isClosingFence(lines, i) && i < lines.length - 1) {
            const next = lines[i + 1];
            if (next !== undefined && next.trimEnd() !== '') {
                result.push('');
            }
        }

        // MD032: Blank line after last list item in a block
        if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) && i < lines.length - 1) {
            const next = lines[i + 1];
            if (next !== undefined && next.trimEnd() !== '' &&
                !/^(\s*[-*+]\s|\s*\d+\.\s)/.test(next) &&
                !/^\s/.test(next)) {
                // Only add blank line if next line is not a continuation/indented line
                result.push('');
            }
        }
    }

    text = result.join('\n');

    // MD012: Collapse 3+ consecutive blank lines to 2
    text = text.replace(/\n{3,}/g, '\n\n');

    // MD047: Ensure file ends with exactly one newline
    text = text.replace(/\n*$/, '\n');

    return text;
}

/**
 * Check if line index `i` is inside an already-open fenced code block.
 *
 * @param {string[]} lines - All lines of the document
 * @param {number}   i     - Zero-based index of the line to test
 * @returns {boolean} True when inside an open fence
 */
function isInsideFencedBlock(lines, i) {
    let fenceCount = 0;
    for (let j = 0; j < i; j++) {
        if (/^```/.test(lines[j].trimEnd())) fenceCount++;
    }
    return fenceCount % 2 === 1;
}

/**
 * Check if a ` ``` ` line at index `i` is a closing fence.
 * (An odd total fence count up to and including this line means it is closing.)
 *
 * @param {string[]} lines - All lines of the document
 * @param {number}   i     - Zero-based index of the fence line to test
 * @returns {boolean} True when this fence closes an open block
 */
function isClosingFence(lines, i) {
    let fenceCount = 0;
    for (let j = 0; j <= i; j++) {
        if (/^```/.test(lines[j].trimEnd())) fenceCount++;
    }
    return fenceCount % 2 === 0;
}

/**
 * Run a git command in the given directory using `spawnSync`.
 *
 * @param {string}   cwd  - Working directory for the git process
 * @param {string[]} args - Argument list passed to git (e.g. `['rev-parse', '--git-dir']`)
 * @returns {GitResult} Object containing exitCode, stdout, and stderr strings
 */
function execGit(cwd, args) {
    const result = spawnSync('git', args, {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
    });
    return {
        exitCode: result.status ?? 1,
        stdout: (result.stdout ?? '').toString().trim(),
        stderr: (result.stderr ?? '').toString().trim(),
    };
}

// ─── Common path helpers ──────────────────────────────────────────────────────

/**
 * Resolve the main worktree root when running inside a git worktree.
 *
 * In a linked worktree, `.planning/` lives in the main worktree, not in the
 * linked one. Returns the main worktree path, or `cwd` if not in a worktree.
 *
 * Special case: when the linked worktree already has its own `.planning/`
 * directory (independent Conductor workspaces), that directory is respected.
 *
 * @param {string} cwd - Directory to start from (typically `process.cwd()`)
 * @returns {string} Absolute path to the main worktree root (or `cwd`)
 */
function resolveWorktreeRoot(cwd) {
    // If the current directory already has its own .planning/, respect it.
    // This handles linked worktrees with independent planning state (e.g., Conductor workspaces).
    if (fs.existsSync(path.join(cwd, '.planning'))) {
        return cwd;
    }

    // Check if we're in a linked worktree
    const gitDir = execGit(cwd, ['rev-parse', '--git-dir']);
    const commonDir = execGit(cwd, ['rev-parse', '--git-common-dir']);

    if (gitDir.exitCode !== 0 || commonDir.exitCode !== 0) return cwd;

    // In a linked worktree, .git is a file pointing to .git/worktrees/<name>
    // and git-common-dir points to the main repo's .git directory
    const gitDirResolved = path.resolve(cwd, gitDir.stdout);
    const commonDirResolved = path.resolve(cwd, commonDir.stdout);

    if (gitDirResolved !== commonDirResolved) {
        // We're in a linked worktree - resolve main worktree root
        // The common dir is the main repo's .git, so its parent is the main worktree root
        return path.dirname(commonDirResolved);
    }

    return cwd;
}

/**
 * Acquire a file-based lock for `.planning/` writes.
 *
 * Prevents concurrent worktrees from corrupting shared planning files.
 * The lock is automatically released after `fn` completes (or throws).
 * Times out after 10 seconds, then force-acquires to prevent deadlocks.
 *
 * @template T
 * @param {string}    cwd - Project root (used to resolve the lock path)
 * @param {() => T}   fn  - Callback to execute while holding the lock
 * @returns {T} The return value of `fn`
 */
function withPlanningLock(cwd, fn) {
    const lockPath = path.join(planningDir(cwd), '.lock');
    const lockTimeout = 10000; // 10 seconds
    const retryDelay = 100;
    const start = Date.now();

    // Ensure .planning/ exists
    try { fs.mkdirSync(planningDir(cwd), { recursive: true }); } catch { /* ok */ }

    while (Date.now() - start < lockTimeout) {
        try {
            // Atomic create - fails if file exists
            fs.writeFileSync(lockPath, JSON.stringify({
                pid: process.pid,
                cwd,
                acquired: new Date().toISOString(),
            }), { flag: 'wx' });

            // Lock acquired - run the function
            try {
                return fn();
            } finally {
                try { fs.unlinkSync(lockPath); } catch { /* already released */ }
            }
        } catch (err) {
            if (err.code === 'EEXIST') {
                // Lock exists - check if stale (>30s old)
                try {
                    const stat = fs.statSync(lockPath);
                    if (Date.now() - stat.mtimeMs > 30000) {
                        fs.unlinkSync(lockPath);
                        continue; // retry
                    }
                } catch { continue; }

                // Wait and retry
                spawnSync('sleep', ['0.1'], { stdio: 'ignore' });
                continue;
            }
            throw err;
        }
    }
    // Timeout - force acquire (stale lock recovery)
    try { fs.unlinkSync(lockPath); } catch { /* ok */ }
    return fn();
}

/**
 * Get the `.planning` directory path, workstream-aware.
 *
 * When a workstream is active (via explicit `ws` arg or `GSD_WORKSTREAM` env var),
 * returns `.planning/workstreams/{ws}/`. Otherwise returns `.planning/`.
 *
 * @param {string}  cwd  - Project root
 * @param {string} [ws]  - Explicit workstream name; if omitted, checks `GSD_WORKSTREAM` env var
 * @returns {string} Absolute path to the active planning directory
 */
function planningDir(cwd, ws) {
    if (ws === undefined) ws = process.env.GSD_WORKSTREAM || null;
    if (!ws) return path.join(cwd, '.planning');
    return path.join(cwd, '.planning', 'workstreams', ws);
}

/**
 * Always returns the root `.planning/` path, ignoring workstreams.
 * Use for shared resources (config.json, PROJECT.md) that must not be scoped.
 *
 * @param {string} cwd - Project root
 * @returns {string} Absolute path to `.planning/`
 */
function planningRoot(cwd) {
    return path.join(cwd, '.planning');
}

/**
 * Get common `.planning` file paths, workstream-aware.
 *
 * Scoped paths (state, roadmap, phases, requirements) resolve to the active
 * workstream directory. Shared paths (project, config) always resolve to the
 * root `.planning/` regardless of the active workstream.
 *
 * @param {string}  cwd  - Project root
 * @param {string} [ws]  - Explicit workstream name (falls back to `GSD_WORKSTREAM`)
 * @returns {PlanningPaths} Object of named absolute file/directory paths
 */
function planningPaths(cwd, ws) {
    const base = planningDir(cwd, ws);
    const root = path.join(cwd, '.planning');
    return {
        planning: base,
        state: path.join(base, 'STATE.md'),
        roadmap: path.join(base, 'ROADMAP.md'),
        project: path.join(root, 'PROJECT.md'),
        config: path.join(root, 'config.json'),
        phases: path.join(base, 'phases'),
        requirements: path.join(base, 'REQUIREMENTS.md'),
    };
}

// ─── Active Workstream Detection ─────────────────────────────────────────────

/**
 * Get the active workstream name from `.planning/active-workstream`.
 *
 * @param {string} cwd - Project root
 * @returns {string|null} Active workstream name, or null if none is set or the
 *   workstream directory does not exist on disk
 */
function getActiveWorkstream(cwd) {
    const filePath = path.join(planningRoot(cwd), 'active-workstream');
    try {
        const name = fs.readFileSync(filePath, 'utf-8').trim();
        if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return null;
        const wsDir = path.join(planningRoot(cwd), 'workstreams', name);
        if (!fs.existsSync(wsDir)) return null;
        return name;
    } catch {
        return null;
    }
}

/**
 * Set the active workstream by writing `.planning/active-workstream`.
 * Pass `null` to clear the active workstream (deletes the file).
 *
 * @param {string}      cwd  - Project root
 * @param {string|null} name - Workstream name to activate, or null to clear
 * @returns {void}
 * @throws {Error} When name contains characters other than alphanumeric, hyphens, and underscores
 */
function setActiveWorkstream(cwd, name) {
    const filePath = path.join(planningRoot(cwd), 'active-workstream');
    if (!name) {
        try { fs.unlinkSync(filePath); } catch { }
        return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error('Invalid workstream name: must be alphanumeric, hyphens, and underscores only');
    }
    fs.writeFileSync(filePath, name + '\n', 'utf-8');
}

// ─── Phase utilities ──────────────────────────────────────────────────────────

/**
 * Escape a string for safe use inside a `RegExp` constructor.
 *
 * @param {string|number} value - Value whose special regex characters should be escaped
 * @returns {string} Escaped string safe for `new RegExp(escaped)`
 */
function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize a phase identifier to a canonical zero-padded string.
 *
 * Examples:
 * - `'1'`     → `'01'`
 * - `'12A'`   → `'12A'`
 * - `'12.1'`  → `'12.1'`
 * - `'PROJ-42'` → `'PROJ-42'` (custom IDs returned as-is)
 *
 * @param {string|number} phase - Raw phase identifier
 * @returns {string} Normalized phase string
 */
function normalizePhaseName(phase) {
    const str = String(phase);
    // Standard numeric phases: 1, 01, 12A, 12.1
    const match = str.match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
    if (match) {
        const padded = match[1].padStart(2, '0');
        const letter = match[2] ? match[2].toUpperCase() : '';
        const decimal = match[3] || '';
        return padded + letter + decimal;
    }
    // Custom phase IDs (e.g. PROJ-42, AUTH-101): return as-is
    return str;
}

/**
 * Compare two phase identifiers for numeric sort ordering.
 *
 * Handles integers, letter suffixes (12A < 12B), and decimal sub-phases
 * (12 < 12.1 < 12.1.2 < 12.2). Custom string IDs fall back to
 * `String.localeCompare`.
 *
 * @param {string|number} a - First phase identifier
 * @param {string|number} b - Second phase identifier
 * @returns {number} Negative when a < b, positive when a > b, zero when equal
 */
function comparePhaseNum(a, b) {
    const pa = String(a).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
    const pb = String(b).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
    // If either is non-numeric (custom ID), fall back to string comparison
    if (!pa || !pb) return String(a).localeCompare(String(b));
    const intDiff = parseInt(pa[1], 10) - parseInt(pb[1], 10);
    if (intDiff !== 0) return intDiff;
    // No letter sorts before letter: 12 < 12A < 12B
    const la = (pa[2] || '').toUpperCase();
    const lb = (pb[2] || '').toUpperCase();
    if (la !== lb) {
        if (!la) return -1;
        if (!lb) return 1;
        return la < lb ? -1 : 1;
    }
    // Segment-by-segment decimal comparison: 12A < 12A.1 < 12A.1.2 < 12A.2
    const aDecParts = pa[3] ? pa[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
    const bDecParts = pb[3] ? pb[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
    const maxLen = Math.max(aDecParts.length, bDecParts.length);
    if (aDecParts.length === 0 && bDecParts.length > 0) return -1;
    if (bDecParts.length === 0 && aDecParts.length > 0) return 1;
    for (let i = 0; i < maxLen; i++) {
        const av = Number.isFinite(aDecParts[i]) ? aDecParts[i] : 0;
        const bv = Number.isFinite(bDecParts[i]) ? bDecParts[i] : 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}

/**
 * Search a specific phase directory for a phase matching `normalized`.
 *
 * Used internally by {@link findPhaseInternal} to search both the current
 * phases directory and archived milestone directories.
 *
 * @param {string} baseDir    - Absolute path to the directory to search
 * @param {string} relBase    - Posix-relative path used to build the returned `directory` field
 * @param {string} normalized - Normalized phase identifier (from {@link normalizePhaseName})
 * @returns {PhaseSearchResult|null} Match result, or null when no match is found
 */
function searchPhaseInDir(baseDir, relBase, normalized) {
    try {
        const dirs = readSubdirectories(baseDir, true);
        // Match: starts with normalized (numeric) OR contains normalized as prefix segment (custom ID)
        const match = dirs.find(d => {
            if (d.startsWith(normalized)) return true;
            // For custom IDs like PROJ-42, match case-insensitively
            if (d.toUpperCase().startsWith(normalized.toUpperCase())) return true;
            return false;
        });
        if (!match) return null;

        // Extract phase number and name - supports both numeric (01-name) and custom (PROJ-42-name)
        const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i)
            || match.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-(.+)/i)
            || [null, match, null];
        const phaseNumber = dirMatch ? dirMatch[1] : normalized;
        const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
        const phaseDir = path.join(baseDir, match);
        const { plans: unsortedPlans, summaries: unsortedSummaries, hasResearch, hasContext, hasVerification, hasReviews } = getPhaseFileStats(phaseDir);
        const plans = unsortedPlans.sort();
        const summaries = unsortedSummaries.sort();

        const completedPlanIds = new Set(
            summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
        );
        const incompletePlans = plans.filter(p => {
            const planId = p.replace('-PLAN.md', '').replace('PLAN.md', '');
            return !completedPlanIds.has(planId);
        });

        return {
            found: true,
            directory: toPosixPath(path.join(relBase, match)),
            phase_number: phaseNumber,
            phase_name: phaseName,
            phase_slug: phaseName ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
            plans,
            summaries,
            incomplete_plans: incompletePlans,
            has_research: hasResearch,
            has_context: hasContext,
            has_verification: hasVerification,
            has_reviews: hasReviews,
        };
    } catch {
        return null;
    }
}

/**
 * Find a phase by number/ID, searching both current and archived milestone
 * phase directories. Searches newest archived milestone first.
 *
 * @param {string}      cwd   - Project root
 * @param {string|null} phase - Phase identifier (e.g. '1', '12A', 'PROJ-42')
 * @returns {PhaseSearchResult|null} Match result, or null when not found
 */
function findPhaseInternal(cwd, phase) {
    if (!phase) return null;

    const phasesDir = path.join(planningDir(cwd), 'phases');
    const normalized = normalizePhaseName(phase);

    // Search current phases first
    const relPhasesDir = toPosixPath(path.relative(cwd, phasesDir));
    const current = searchPhaseInDir(phasesDir, relPhasesDir, normalized);
    if (current) return current;

    // Search archived milestone phases (newest first)
    const milestonesDir = path.join(cwd, '.planning', 'milestones');
    if (!fs.existsSync(milestonesDir)) return null;

    try {
        const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
        const archiveDirs = milestoneEntries
            .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
            .map(e => e.name)
            .sort()
            .reverse();

        for (const archiveName of archiveDirs) {
            const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
            const archivePath = path.join(milestonesDir, archiveName);
            const relBase = '.planning/milestones/' + archiveName;
            const result = searchPhaseInDir(archivePath, relBase, normalized);
            if (result) {
                result.archived = version;
                return result;
            }
        }
    } catch { /* intentionally empty */ }

    return null;
}

/**
 * Return a flat list of all archived phase directory entries across all
 * milestone archives, sorted newest milestone first.
 *
 * @param {string} cwd - Project root
 * @returns {ArchivedPhaseEntry[]} Archived phase entries (empty array if none exist)
 */
function getArchivedPhaseDirs(cwd) {
    const milestonesDir = path.join(cwd, '.planning', 'milestones');
    const results = [];

    if (!fs.existsSync(milestonesDir)) return results;

    try {
        const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
        // Find v*-phases directories, sort newest first
        const phaseDirs = milestoneEntries
            .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
            .map(e => e.name)
            .sort()
            .reverse();

        for (const archiveName of phaseDirs) {
            const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
            const archivePath = path.join(milestonesDir, archiveName);
            const dirs = readSubdirectories(archivePath, true);

            for (const dir of dirs) {
                results.push({
                    name: dir,
                    milestone: version,
                    basePath: path.join('.planning', 'milestones', archiveName),
                    fullPath: path.join(archivePath, dir),
                });
            }
        }
    } catch { /* intentionally empty */ }

    return results;
}

// ─── Roadmap milestone scoping ───────────────────────────────────────────────

/**
 * Strip shipped milestone content wrapped in `<details>` blocks from a
 * ROADMAP.md string. Used to isolate current milestone phases when searching
 * for headings or checkboxes.
 *
 * @param {string} content - Raw ROADMAP.md content
 * @returns {string} Content with all `<details>…</details>` blocks removed
 */
function stripShippedMilestones(content) {
    return content.replace(/<details>[\s\S]*?<\/details>/gi, '');
}

/**
 * Extract the current milestone section from ROADMAP.md by positive lookup.
 *
 * Instead of stripping `<details>` blocks (negative heuristic that breaks if
 * agents wrap the current milestone in `<details>`), this finds the section
 * matching the current milestone version and returns only that content.
 *
 * Falls back to {@link stripShippedMilestones} if:
 * - `cwd` is not provided
 * - STATE.md doesn't exist or has no milestone field
 * - Version can't be found in ROADMAP.md
 *
 * @param {string}  content - Full ROADMAP.md content
 * @param {string} [cwd]    - Working directory for reading STATE.md
 * @returns {string} Content scoped to the current milestone section
 */
function extractCurrentMilestone(content, cwd) {
    if (!cwd) return stripShippedMilestones(content);

    // 1. Get current milestone version from STATE.md frontmatter
    let version = null;
    try {
        const statePath = path.join(planningDir(cwd), 'STATE.md');
        if (fs.existsSync(statePath)) {
            const stateRaw = fs.readFileSync(statePath, 'utf-8');
            const milestoneMatch = stateRaw.match(/^milestone:\s*(.+)/m);
            if (milestoneMatch) {
                version = milestoneMatch[1].trim();
            }
        }
    } catch { }

    // 2. Fallback: derive version from getMilestoneInfo pattern in ROADMAP.md itself
    if (!version) {
        // Check for 🚧 in-progress marker
        const inProgressMatch = content.match(/🚧\s*\*\*v(\d+\.\d+)\s/);
        if (inProgressMatch) {
            version = 'v' + inProgressMatch[1];
        }
    }

    if (!version) return stripShippedMilestones(content);

    // 3. Find the section matching this version
    // Match headings like: ## Roadmap v3.0: Name, ## v3.0 Name, etc.
    const escapedVersion = escapeRegex(version);
    const sectionPattern = new RegExp(
        `(^#{1,3}\\s+.*${escapedVersion}[^\\n]*)`,
        'mi'
    );
    const sectionMatch = content.match(sectionPattern);

    if (!sectionMatch) return stripShippedMilestones(content);

    const sectionStart = sectionMatch.index;

    // Find the end: next milestone heading at same or higher level, or EOF
    // Milestone headings look like: ## v2.0, ## Roadmap v2.0, ## ✅ v1.0, etc.
    const headingLevel = sectionMatch[1].match(/^(#{1,3})\s/)[1].length;
    const restContent = content.slice(sectionStart + sectionMatch[0].length);
    const nextMilestonePattern = new RegExp(
        `^#{1,${headingLevel}}\\s+(?:.*v\\d+\\.\\d+|✅|📋|🚧)`,
        'mi'
    );
    const nextMatch = restContent.match(nextMilestonePattern);

    let sectionEnd;
    if (nextMatch) {
        sectionEnd = sectionStart + sectionMatch[0].length + nextMatch.index;
    } else {
        sectionEnd = content.length;
    }

    // Return everything before the current milestone section (non-milestone content
    // like title, overview) plus the current milestone section
    const beforeMilestones = content.slice(0, sectionStart);
    const currentSection = content.slice(sectionStart, sectionEnd);

    // Also include any content before the first milestone heading (title, overview, etc.)
    // but strip any <details> blocks in it (these are definitely shipped)
    const preamble = beforeMilestones.replace(/<details>[\s\S]*?<\/details>/gi, '');

    return preamble + currentSection;
}

/**
 * Replace a regex pattern only within the current milestone section of
 * ROADMAP.md (everything after the last `</details>` tag). Guards against
 * accidentally modifying archived milestone checkboxes or tables.
 *
 * @param {string}          content     - Full ROADMAP.md content
 * @param {RegExp}          pattern     - Pattern to replace
 * @param {string|Function} replacement - Replacement string or function (same API as `String.prototype.replace`)
 * @returns {string} Updated ROADMAP.md content
 */
function replaceInCurrentMilestone(content, pattern, replacement) {
    const lastDetailsClose = content.lastIndexOf('</details>');
    if (lastDetailsClose === -1) {
        return content.replace(pattern, replacement);
    }
    const offset = lastDetailsClose + '</details>'.length;
    const before = content.slice(0, offset);
    const after = content.slice(offset);
    return before + after.replace(pattern, replacement);
}

// ─── Roadmap & model utilities ────────────────────────────────────────────────

/**
 * Extract phase metadata from ROADMAP.md for a given phase number.
 *
 * Scopes the search to the current milestone section via
 * {@link extractCurrentMilestone} to prevent cross-milestone false matches.
 *
 * @param {string}      cwd      - Project root
 * @param {string|null} phaseNum - Phase identifier to look up
 * @returns {RoadmapPhaseResult|null} Phase metadata, or null when not found
 */
function getRoadmapPhaseInternal(cwd, phaseNum) {
    if (!phaseNum) return null;
    const roadmapPath = path.join(planningDir(cwd), 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) return null;

    try {
        const content = extractCurrentMilestone(fs.readFileSync(roadmapPath, 'utf-8'), cwd);
        const escapedPhase = escapeRegex(phaseNum.toString());
        // Match both numeric (Phase 1:) and custom (Phase PROJ-42:) headers
        const phasePattern = new RegExp(`#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
        const headerMatch = content.match(phasePattern);
        if (!headerMatch) return null;

        const phaseName = headerMatch[1].trim();
        const headerIndex = headerMatch.index;
        const restOfContent = content.slice(headerIndex);
        const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+[\w]/i);
        const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : content.length;
        const section = content.slice(headerIndex, sectionEnd).trim();

        const goalMatch = section.match(/\*\*Goal(?:\*\*:|\*?\*?:\*\*)\s*([^\n]+)/i);
        const goal = goalMatch ? goalMatch[1].trim() : null;

        return {
            found: true,
            phase_number: phaseNum.toString(),
            phase_name: phaseName,
            goal,
            section,
        };
    } catch {
        return null;
    }
}

// ─── Agent installation validation (#1371) ───────────────────────────────────

/**
 * Resolve the agents directory from the GSD install location.
 *
 * `gsd-tools.cjs` lives at `<configDir>/get-shit-done/bin/gsd-tools.cjs`,
 * so `agents/` is at `<configDir>/agents/`.
 *
 * @returns {string} Absolute path to the agents directory
 */
function getAgentsDir() {
    // __dirname is get-shit-done/bin/lib/ → go up 3 levels to configDir
    return path.join(__dirname, '..', '..', '..', 'agents');
}

/**
 * Check which GSD agents are installed on disk.
 *
 * An agent is considered installed when a `<name>.md` file exists inside the
 * agents directory. The set of expected agents is derived from the keys of
 * {@link MODEL_PROFILES}.
 *
 * @returns {AgentsInstallStatus} Installation status and per-agent details
 */
function checkAgentsInstalled() {
    const agentsDir = getAgentsDir();
    const expectedAgents = Object.keys(MODEL_PROFILES);
    const installed = [];
    const missing = [];

    if (!fs.existsSync(agentsDir)) {
        return {
            agents_installed: false,
            missing_agents: expectedAgents,
            installed_agents: [],
            agents_dir: agentsDir,
        };
    }

    for (const agent of expectedAgents) {
        const agentFile = path.join(agentsDir, `${agent}.md`);
        if (fs.existsSync(agentFile)) {
            installed.push(agent);
        } else {
            missing.push(agent);
        }
    }

    return {
        agents_installed: installed.length > 0 && missing.length === 0,
        missing_agents: missing,
        installed_agents: installed,
        agents_dir: agentsDir,
    };
}

// ─── Model alias resolution ───────────────────────────────────────────────────

/**
 * Map short model aliases to full model IDs.
 *
 * Updated each release to match current model versions. Users can override
 * individual entries with `model_overrides` in `config.json` for custom or
 * latest models.
 *
 * @type {Object<string, string>}
 */
const MODEL_ALIAS_MAP = {
    'opus': 'claude-opus-4-6',
    'sonnet': 'claude-sonnet-4-6',
    'haiku': 'claude-haiku-4-5',
};

/**
 * Resolve the model string to use for a given agent type.
 *
 * Resolution order:
 * 1. Per-agent override from `config.model_overrides[agentType]`
 * 2. `resolve_model_ids === 'omit'` → returns `''` (runtime uses its default)
 * 3. Profile lookup from {@link MODEL_PROFILES} and the active model profile
 * 4. `resolve_model_ids === true` → maps the alias to the full model ID via {@link MODEL_ALIAS_MAP}
 * 5. Returns the alias string as-is
 *
 * @param {string} cwd       - Project root (used to load config)
 * @param {string} agentType - Agent name key (e.g. `'gsd-executor'`)
 * @returns {string} Model string to pass to the agent runtime
 */
function resolveModelInternal(cwd, agentType) {
    const config = loadConfig(cwd);

    // Check per-agent override first - always respected regardless of resolve_model_ids.
    // Users who set fully-qualified model IDs (e.g., "openai/gpt-5.4") get exactly that.
    const override = config.model_overrides?.[agentType];
    if (override) {
        return override;
    }

    // resolve_model_ids: "omit" - return empty string so the runtime uses its configured
    // default model. For non-the agent runtimes (OpenCode, Codex, etc.) that don't recognize
    // the agent aliases (opus/sonnet/haiku/inherit). Set automatically during install. See #1156.
    if (config.resolve_model_ids === 'omit') {
        return '';
    }

    // Fall back to profile lookup
    const profile = String(config.model_profile || 'balanced').toLowerCase();
    const agentModels = MODEL_PROFILES[agentType];
    if (!agentModels) return 'sonnet';
    if (profile === 'inherit') return 'inherit';
    const alias = agentModels[profile] || agentModels['balanced'] || 'sonnet';

    // resolve_model_ids: true - map alias to full the agent model ID
    // Prevents 404s when the Task tool passes aliases directly to the API
    if (config.resolve_model_ids) {
        return MODEL_ALIAS_MAP[alias] || alias;
    }

    return alias;
}

// ─── Summary body helpers ─────────────────────────────────────────────────

/**
 * Extract a one-liner from the summary body when it is not present in frontmatter.
 *
 * The summary template defines the one-liner as a bold markdown line immediately
 * after the heading:
 * ```
 * # Phase X: Name Summary
 * **[substantive one-liner text]**
 * ```
 *
 * @param {string|null} content - Raw summary file content (may be null)
 * @returns {string|null} One-liner text, or null if not found
 */
function extractOneLinerFromBody(content) {
    if (!content) return null;
    // Strip frontmatter first
    const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
    // Find the first **...** line after a # heading
    const match = body.match(/^#[^\n]*\n+\*\*([^*]+)\*\*/m);
    return match ? match[1].trim() : null;
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

/**
 * Check whether a path exists on disk.
 *
 * @param {string} cwd        - Project root (used to resolve relative paths)
 * @param {string} targetPath - Absolute or project-root-relative path to check
 * @returns {boolean} True when the path exists (file or directory)
 */
function pathExistsInternal(cwd, targetPath) {
    const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
    try {
        fs.statSync(fullPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Generate a URL-safe slug from a human-readable text string.
 *
 * Converts to lower-case, replaces non-alphanumeric runs with `-`, and trims
 * leading/trailing hyphens.
 *
 * @param {string|null} text - Text to convert (e.g. a phase description)
 * @returns {string|null} URL-safe slug, or null when text is falsy
 */
function generateSlugInternal(text) {
    if (!text) return null;
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Read the current milestone version and name from ROADMAP.md.
 *
 * Detection strategy (in order):
 * 1. `🚧 **vX.Y name**` list-format in-progress marker
 * 2. `## vX.Y: name` heading-format after stripping shipped milestones
 * 3. Bare `vX.Y` version string anywhere in the stripped content
 *
 * Falls back to `{ version: 'v1.0', name: 'milestone' }` on any error.
 *
 * @param {string} cwd - Project root
 * @returns {MilestoneInfo} Current milestone version and name
 */
function getMilestoneInfo(cwd) {
    try {
        const roadmap = fs.readFileSync(path.join(planningDir(cwd), 'ROADMAP.md'), 'utf-8');

        // First: check for list-format roadmaps using 🚧 (in-progress) marker
        // e.g. "- 🚧 **v2.1 Belgium** - Phases 24-28 (in progress)"
        // e.g. "- 🚧 **v1.2.1 Tech Debt** - Phases 1-8 (in progress)"
        const inProgressMatch = roadmap.match(/🚧\s*\*\*v(\d+(?:\.\d+)+)\s+([^*]+)\*\*/);
        if (inProgressMatch) {
            return {
                version: 'v' + inProgressMatch[1],
                name: inProgressMatch[2].trim(),
            };
        }

        // Second: heading-format roadmaps - strip shipped milestones in <details> blocks
        const cleaned = stripShippedMilestones(roadmap);
        // Extract version and name from the same ## heading for consistency
        // Supports 2+ segment versions: v1.2, v1.2.1, v2.0.1, etc.
        const headingMatch = cleaned.match(/## .*v(\d+(?:\.\d+)+)[:\s]+([^\n(]+)/);
        if (headingMatch) {
            return {
                version: 'v' + headingMatch[1],
                name: headingMatch[2].trim(),
            };
        }
        // Fallback: try bare version match (greedy - capture longest version string)
        const versionMatch = cleaned.match(/v(\d+(?:\.\d+)+)/);
        return {
            version: versionMatch ? versionMatch[0] : 'v1.0',
            name: 'milestone',
        };
    } catch {
        return { version: 'v1.0', name: 'milestone' };
    }
}

/**
 * Build a filter function that returns true only for phase directories that
 * belong to the current milestone (as defined by ROADMAP.md phase headings).
 *
 * The returned function has an additional `phaseCount` property indicating
 * how many phases were found in the current milestone (0 when no ROADMAP exists).
 *
 * When no ROADMAP exists or no phases are listed, returns a pass-all filter
 * (every directory is accepted) with `phaseCount === 0`.
 *
 * @param {string} cwd - Project root
 * @returns {((dirName: string) => boolean) & { phaseCount: number }}
 *   Filter function with attached `phaseCount` metadata
 */
function getMilestonePhaseFilter(cwd) {
    const milestonePhaseNums = new Set();
    try {
        const roadmap = extractCurrentMilestone(fs.readFileSync(path.join(planningDir(cwd), 'ROADMAP.md'), 'utf-8'), cwd);
        // Match both numeric phases (Phase 1:) and custom IDs (Phase PROJ-42:)
        const phasePattern = /#{2,4}\s*Phase\s+([\w][\w.-]*)\s*:/gi;
        let m;
        while ((m = phasePattern.exec(roadmap)) !== null) {
            milestonePhaseNums.add(m[1]);
        }
    } catch { /* intentionally empty */ }

    if (milestonePhaseNums.size === 0) {
        const passAll = () => true;
        passAll.phaseCount = 0;
        return passAll;
    }

    const normalized = new Set(
        [...milestonePhaseNums].map(n => (n.replace(/^0+/, '') || '0').toLowerCase())
    );

    function isDirInMilestone(dirName) {
        // Try numeric match first
        const m = dirName.match(/^0*(\d+[A-Za-z]?(?:\.\d+)*)/);
        if (m && normalized.has(m[1].toLowerCase())) return true;
        // Try custom ID match (e.g. PROJ-42-description → PROJ-42)
        const customMatch = dirName.match(/^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)/);
        if (customMatch && normalized.has(customMatch[1].toLowerCase())) return true;
        return false;
    }
    isDirInMilestone.phaseCount = milestonePhaseNums.size;
    return isDirInMilestone;
}

// ─── Phase file helpers ──────────────────────────────────────────────────────

/**
 * Filter a file list to just `PLAN.md` / `*-PLAN.md` entries.
 *
 * @param {string[]} files - Filenames to filter
 * @returns {string[]} Only the plan file names
 */
function filterPlanFiles(files) {
    return files.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
}

/**
 * Filter a file list to just `SUMMARY.md` / `*-SUMMARY.md` entries.
 *
 * @param {string[]} files - Filenames to filter
 * @returns {string[]} Only the summary file names
 */
function filterSummaryFiles(files) {
    return files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
}

/**
 * Read a phase directory and return counts/flags for common file types.
 *
 * @param {string} phaseDir - Absolute path to the phase directory
 * @returns {PhaseFileStats} Counts and boolean flags for each file category
 */
function getPhaseFileStats(phaseDir) {
    const files = fs.readdirSync(phaseDir);
    return {
        plans: filterPlanFiles(files),
        summaries: filterSummaryFiles(files),
        hasResearch: files.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md'),
        hasContext: files.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md'),
        hasVerification: files.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md'),
        hasReviews: files.some(f => f.endsWith('-REVIEWS.md') || f === 'REVIEWS.md'),
    };
}

/**
 * Read immediate child directories from a path.
 *
 * @param {string}  dirPath   - Absolute path to scan
 * @param {boolean} [sort=false] - When true, sort entries using {@link comparePhaseNum} ordering
 * @returns {string[]} Directory names (empty array when path does not exist or cannot be read)
 */
function readSubdirectories(dirPath, sort = false) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        return sort ? dirs.sort((a, b) => comparePhaseNum(a, b)) : dirs;
    } catch {
        return [];
    }
}

module.exports = {
    output,
    error,
    safeReadFile,
    loadConfig,
    isGitIgnored,
    execGit,
    normalizeMd,
    escapeRegex,
    normalizePhaseName,
    comparePhaseNum,
    searchPhaseInDir,
    findPhaseInternal,
    getArchivedPhaseDirs,
    getRoadmapPhaseInternal,
    resolveModelInternal,
    pathExistsInternal,
    generateSlugInternal,
    getMilestoneInfo,
    getMilestonePhaseFilter,
    stripShippedMilestones,
    extractCurrentMilestone,
    replaceInCurrentMilestone,
    toPosixPath,
    extractOneLinerFromBody,
    resolveWorktreeRoot,
    withPlanningLock,
    findProjectRoot,
    detectSubRepos,
    reapStaleTempFiles,
    MODEL_ALIAS_MAP,
    planningDir,
    planningRoot,
    planningPaths,
    getActiveWorkstream,
    setActiveWorkstream,
    filterPlanFiles,
    filterSummaryFiles,
    getPhaseFileStats,
    readSubdirectories,
    getAgentsDir,
    checkAgentsInstalled,
};
