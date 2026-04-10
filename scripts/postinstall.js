#!/usr/bin/env node
/**
 * postinstall.js - GSD harness installer
 *
 * Runs automatically after `npm install pi-gsd` (or `pi install npm:pi-gsd`).
 * Copies runtime harness content from this package's `gsd/` into the consumer
 * project's `.pi/gsd/`, and hook scripts into `.pi/hooks/`.
 *
 * Version detection: each installed .md file carries a `<gsd-version v="X.Y.Z" />`
 * tag stamped with the npm package version that wrote it. On reinstall we read
 * that tag from a sample file; if it doesn't match the current package version we
 * overwrite everything so workflow/template fixes always reach installed projects.
 * Files tagged `do-not-update` are never overwritten (user customisations).
 *
 * Excluded from the `.pi/gsd/` copy:
 *   gsd/prompts/  → served from npm package via pi.prompts (not installed locally)
 *   gsd/hooks/    → copied to .pi/hooks/ instead
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Constants ────────────────────────────────────────────────────────────────

const FORCE =
    process.env.GSD_FORCE_REINSTALL === "1" ||
    process.argv.includes("--force-reinstall");

/** Directory that contains this package's files. */
const PKG_DIR = path.resolve(__dirname, "..");

/**
 * The consuming project's root.
 * npm sets INIT_CWD to the directory where `npm install` was run.
 */
const PROJECT_ROOT = process.env.INIT_CWD || process.cwd();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPackageVersion() {
    try {
        return JSON.parse(fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8")).version || "0.0.0";
    } catch { return "0.0.0"; }
}

/**
 * Read the `<gsd-version v="..." />` tag from a file.
 * Returns { version, doNotUpdate } or null.
 */
function readGsdVersion(filePath) {
    try {
        const head = fs.readFileSync(filePath, "utf8").slice(0, 256);
        const m = /<gsd-version\s+v="([^"]+)"(\s+do-not-update)?\s*\/>/.exec(head);
        return m ? { version: m[1], doNotUpdate: Boolean(m[2]) } : null;
    } catch { return null; }
}

/**
 * Recursively copy src → dest, stamping each .md file with `pkgVersion`
 * in its `<gsd-version>` tag (unless `do-not-update` is set).
 * Skips top-level subdirs in `exclude`. Skips existing files when !overwrite
 * (except: always updates if installed version tag differs from pkgVersion).
 */
function copyDir(src, dest, overwrite, exclude, pkgVersion) {
    let copied = 0, skipped = 0;
    if (!fs.existsSync(src)) return { copied, skipped };
    fs.mkdirSync(dest, { recursive: true });

    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (exclude && exclude.includes(entry.name)) continue;
        const srcEntry  = path.join(src,  entry.name);
        const destEntry = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            const sub = copyDir(srcEntry, destEntry, overwrite, null, pkgVersion);
            copied  += sub.copied;
            skipped += sub.skipped;
        } else if (entry.isFile()) {
            const isMd = entry.name.endsWith(".md");

            if (!overwrite && fs.existsSync(destEntry)) {
                // Even in no-overwrite mode, update .md files whose version tag
                // doesn't match the current package (the whole point of this system).
                if (isMd) {
                    const installed = readGsdVersion(destEntry);
                    if (!installed || installed.doNotUpdate || installed.version === pkgVersion) {
                        skipped++;
                        continue;
                    }
                    // Fall through — version mismatch, needs update
                } else {
                    skipped++;
                    continue;
                }
            }

            if (isMd) {
                // Stamp with current package version
                let content = fs.readFileSync(srcEntry, "utf8");
                content = content.replace(
                    /<gsd-version\s+v="[^"]*"(\s+do-not-update)?\s*\/>/,
                    (_, dnu) => dnu ? `<gsd-version v="${pkgVersion}" do-not-update />` : `<gsd-version v="${pkgVersion}" />`,
                );
                fs.writeFileSync(destEntry, content, "utf8");
            } else {
                fs.copyFileSync(srcEntry, destEntry);
            }
            copied++;
        }
    }
    return { copied, skipped };
}

function log(level, msg) {
    const isTTY = process.stdout.isTTY;
    const sym = { ok: isTTY ? "\x1b[32m✓\x1b[0m" : "✓", skip: isTTY ? "\x1b[33m–\x1b[0m" : "–", warn: isTTY ? "\x1b[33m⚠\x1b[0m" : "⚠" };
    console.log(`  ${sym[level] || " "} ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    if (process.env.GSD_SKIP_INSTALL === "1") {
        log("skip", "GSD_SKIP_INSTALL=1 - skipping harness install.");
        return;
    }

    const pkgVersion = getPackageVersion();
    const gsdSrc    = path.join(PKG_DIR, "gsd");
    const gsdDest   = path.join(PROJECT_ROOT, ".pi", "gsd");
    const hooksSrc  = path.join(gsdSrc, "hooks");
    const hooksDest = path.join(PROJECT_ROOT, ".pi", "hooks");

    // Detect installed version from a sample file's <gsd-version> tag.
    const sample = path.join(gsdDest, "workflows", "plan-phase.md");
    const installedTag = readGsdVersion(sample);
    const installedVersion = installedTag?.version ?? null;
    const versionChanged = installedVersion !== pkgVersion;

    // In no-force mode, copyDir still updates individual files whose version
    // tag doesn't match — so we only need to force-overwrite non-.md files
    // (config.json, VERSION, hooks) when the version changes.
    const overwriteAll = FORCE || versionChanged;

    console.log("");
    console.log(`  GSD v${pkgVersion} - installing into project…`);
    if (versionChanged && installedVersion) {
        console.log(`  (updating from v${installedVersion} → v${pkgVersion})`);
    } else if (FORCE) {
        console.log("  (force-reinstall: existing files will be overwritten)");
    }
    console.log("");

    // ── Runtime harness → .pi/gsd/ ────────────────────────────────────────────
    const { copied: gsdCopied, skipped: gsdSkipped } = copyDir(
        gsdSrc, gsdDest, overwriteAll, ["prompts", "hooks"], pkgVersion,
    );

    if (gsdCopied > 0) {
        log("ok", `.pi/gsd  (${gsdCopied} file${gsdCopied === 1 ? "" : "s"} updated to v${pkgVersion})`);
    } else {
        log("skip", `.pi/gsd  (v${pkgVersion} already installed, ${gsdSkipped} files skipped)`);
    }

    // ── Hook scripts → .pi/hooks/ ─────────────────────────────────────────────
    if (fs.existsSync(hooksSrc)) {
        const { copied: hCopied } = copyDir(hooksSrc, hooksDest, overwriteAll, null, pkgVersion);
        if (hCopied > 0) {
            log("ok", `.pi/hooks  (${hCopied} hook${hCopied === 1 ? "" : "s"} installed)`);
        }
    }

    // ── Cleanup: stale files from old install layouts ──────────────────────────
    const extDir = path.join(PROJECT_ROOT, ".pi", "extensions");
    for (const name of ["gsd-hooks.ts", "pi-gsd-hooks.ts"]) {
        const stale = path.join(extDir, name);
        if (fs.existsSync(stale)) {
            fs.rmSync(stale);
            log("ok", `.pi/extensions/${name}  (removed - extension now served from package)`);
        }
    }
    const settingsFile = path.join(PROJECT_ROOT, ".pi", "settings.json");
    if (fs.existsSync(settingsFile)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
            if (Array.isArray(settings.extensions)) {
                const staleNames = ["gsd-hooks.ts", "pi-gsd-hooks.ts"];
                const cleaned = settings.extensions.filter((e) => !staleNames.some((n) => e.endsWith(n)));
                if (cleaned.length !== settings.extensions.length) {
                    settings.extensions = cleaned;
                    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, "\t"), "utf8");
                    log("ok", ".pi/settings.json  (removed stale extension entries)");
                }
            }
        } catch { /* ignore */ }
    }

    console.log("");
    console.log(`  GSD v${pkgVersion} installed successfully.`);
    console.log(`  ${gsdCopied} file${gsdCopied === 1 ? "" : "s"} written.`);
    console.log("");
    console.log("  Next steps:");
    console.log("    Run /gsd-new-project to initialise a project.");
    console.log("");
    console.log("  Docs: https://github.com/fulgidus/pi-gsd#readme");
    console.log("");
}

main();
