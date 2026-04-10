#!/usr/bin/env node
/**
 * postinstall.js - GSD harness installer
 *
 * Runs automatically after `npm install pi-gsd` (or `pi install npm:pi-gsd`).
 * Copies runtime harness content from this package's `gsd/` into the consumer
 * project's `.pi/gsd/`, and hook scripts into `.pi/hooks/`.
 *
 * Excluded from the `.pi/gsd/` copy (different destinations or served directly):
 *   gsd/prompts/  → served from npm package via pi.prompts (not installed locally)
 *   gsd/hooks/    → copied to .pi/hooks/ instead
 *
 * Safe to re-run - files are skipped if already present (unless GSD_FORCE=1).
 */

"use strict";

const fs = require("fs");
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
 * Fall back to process.cwd() for programmatic / npx usage.
 */
const PROJECT_ROOT = process.env.INIT_CWD || process.cwd();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively copy a directory tree from `src` to `dest`.
 * Skips subdirectories listed in `exclude` (by name, top-level only).
 * If `overwrite` is false (default), existing files are left untouched.
 *
 * @param {string}   src      Absolute source path
 * @param {string}   dest     Absolute destination path
 * @param {boolean}  overwrite Replace existing files when true
 * @param {string[]} exclude  Top-level subdirectory names to skip
 * @returns {{ copied: number, skipped: number }}
 */
function copyDir(src, dest, overwrite = false, exclude = []) {
    let copied = 0;
    let skipped = 0;

    if (!fs.existsSync(src)) return { copied, skipped };

    fs.mkdirSync(dest, { recursive: true });

    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (exclude.includes(entry.name)) continue;

        const srcEntry = path.join(src, entry.name);
        const destEntry = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            const sub = copyDir(srcEntry, destEntry, overwrite);
            copied += sub.copied;
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

function log(level, msg) {
    const isTTY = process.stdout.isTTY;
    const colours = {
        ok:   isTTY ? "\x1b[32m✓\x1b[0m" : "✓",
        skip: isTTY ? "\x1b[33m–\x1b[0m" : "–",
        warn: isTTY ? "\x1b[33m⚠\x1b[0m" : "⚠",
        err:  isTTY ? "\x1b[31m✗\x1b[0m" : "✗",
    };
    console.log(`  ${colours[level] || " "} ${msg}`);
}

function getPackageVersion() {
    try {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8"),
        );
        return pkg.version || "unknown";
    } catch {
        return "unknown";
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    if (process.env.GSD_SKIP_INSTALL === "1") {
        log("skip", "GSD_SKIP_INSTALL=1 - skipping harness install.");
        return;
    }

    const gsdSrc  = path.join(PKG_DIR, "gsd");
    const gsdDest = path.join(PROJECT_ROOT, ".pi", "gsd");
    const hooksSrc  = path.join(gsdSrc, "hooks");
    const hooksDest = path.join(PROJECT_ROOT, ".pi", "hooks");

    console.log("");
    console.log(`  GSD v${getPackageVersion()} - installing into project…`);
    if (FORCE) console.log("  (force-reinstall: existing files will be overwritten)");
    console.log("");

    // ── Runtime harness → .pi/gsd/ ────────────────────────────────────────────
    // Excludes prompts/ (served from package) and hooks/ (different dest below).
    const { copied: gsdCopied, skipped: gsdSkipped } = copyDir(
        gsdSrc,
        gsdDest,
        FORCE,
        ["prompts", "hooks"],
    );

    if (gsdCopied > 0) {
        log("ok", `.pi/gsd  (${gsdCopied} file${gsdCopied === 1 ? "" : "s"} installed)`);
    } else {
        log("skip", `.pi/gsd  (already up-to-date, ${gsdSkipped} file${gsdSkipped === 1 ? "" : "s"} skipped)`);
    }

    // ── Hook scripts → .pi/hooks/ ─────────────────────────────────────────────
    if (fs.existsSync(hooksSrc)) {
        const { copied: hCopied } = copyDir(hooksSrc, hooksDest, FORCE);
        if (hCopied > 0) {
            log("ok", `.pi/hooks  (${hCopied} hook${hCopied === 1 ? "" : "s"} installed)`);
        }
    }

    // ── Cleanup: stale files from old install layouts ──────────────────────────
    // Extension is now served directly from npm package via pi.extensions.
    // Remove any stale local copies from previous versions.
    const extDir = path.join(PROJECT_ROOT, ".pi", "extensions");
    for (const name of ["gsd-hooks.ts", "pi-gsd-hooks.ts"]) {
        const stale = path.join(extDir, name);
        if (fs.existsSync(stale)) {
            fs.rmSync(stale);
            log("ok", `.pi/extensions/${name}  (removed - extension now served from package)`);
        }
    }

    // Remove stale extension entries from .pi/settings.json
    const settingsFile = path.join(PROJECT_ROOT, ".pi", "settings.json");
    if (fs.existsSync(settingsFile)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
            if (Array.isArray(settings.extensions)) {
                const staleNames = ["gsd-hooks.ts", "pi-gsd-hooks.ts"];
                const cleaned = settings.extensions.filter(
                    (e) => !staleNames.some((n) => e.endsWith(n)),
                );
                if (cleaned.length !== settings.extensions.length) {
                    settings.extensions = cleaned;
                    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, "\t"), "utf8");
                    log("ok", ".pi/settings.json  (removed stale extension entries)");
                }
            }
        } catch { /* ignore */ }
    }

    const total = gsdCopied;
    console.log("");
    console.log(`  GSD v${getPackageVersion()} installed successfully.`);
    console.log(`  ${total} file${total === 1 ? "" : "s"} copied.`);
    console.log("");
    console.log("  Next steps:");
    console.log("    Run /gsd-new-project to initialise a project.");
    console.log("");
    console.log("  Docs: https://github.com/fulgidus/pi-gsd#readme");
    console.log("");
}

main();
