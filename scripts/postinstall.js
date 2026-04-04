#!/usr/bin/env node
/**
 * postinstall.js - GSD harness installer
 *
 * Runs automatically after `npm install pi-gsd`.
 * Copies the pi harness from this package's
 * \`.gsd/harnesses/pi/\` into the consumer project's \`.pi/gsd/\`
 * and installs the \`gsd-hooks.ts\` extension into \`.pi/extensions/\`.
 *
 * Safe to re-run — files are skipped if already present (unless GSD_FORCE=1).
 */

const fs = require("fs");
const path = require("path");

// ─── Constants ────────────────────────────────────────────────────────────────

const FORCE =
	process.env.GSD_FORCE_REINSTALL === "1" ||
	process.argv.includes("--force-reinstall");

/**
 * Directory that contains this package's files.
 * When executed via npm postinstall, __dirname is the package root.
 */
const PKG_DIR = path.resolve(__dirname, "..");

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
 *   src  - subdirectory under <package>/.gsd/harnesses/
 *   dest - directory in the consumer project root
 *   hooks - whether this platform supports GSD hooks (copied from .gsd/hooks/)
 */
const HARNESSES = [{ src: "pi", dest: ".pi", hooks: true, subdir: "gsd" }];

/**
 * Subdirectory name used inside each harness's dest folder for
 * GSD-specific content (workflows, bin, references, templates …).
 */
// subdir is now per-harness (see harness config above)

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
	let copied = 0;
	let skipped = 0;

	if (!fs.existsSync(src)) return { copied, skipped };

	fs.mkdirSync(dest, { recursive: true });

	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
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
		ok: isTTY ? "\x1b[32m✓\x1b[0m" : "✓",
		skip: isTTY ? "\x1b[33m–\x1b[0m" : "–",
		warn: isTTY ? "\x1b[33m⚠\x1b[0m" : "⚠",
		err: isTTY ? "\x1b[31m✗\x1b[0m" : "✗",
	};
	console.log(`  ${colours[level] || " "} ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
	// Skip when running inside the package's own development tree
	// (i.e. when INIT_CWD === the package directory itself).
	if (path.resolve(PROJECT_ROOT) === path.resolve(PKG_DIR)) {
		log(
			"skip",
			"Running inside package source tree - skipping harness install.",
		);
		return;
	}

	// Skip when explicitly opted out
	if (process.env.GSD_SKIP_INSTALL === "1") {
		log("skip", "GSD_SKIP_INSTALL=1 - skipping harness install.");
		return;
	}

	const harnessesRoot = path.join(PKG_DIR, ".gsd", "harnesses");
	const hooksRoot = path.join(PKG_DIR, ".gsd", "hooks");

	console.log("");
	console.log("  GSD - installing harness files into your project…");
	if (FORCE)
		console.log("  (force-reinstall mode: existing files will be overwritten)");
	console.log("");

	let totalCopied = 0;
	let totalSkipped = 0;
	let installed = 0;

	for (const harness of HARNESSES) {
		const srcHarness = path.join(harnessesRoot, harness.src);
		const destHarness = path.join(PROJECT_ROOT, harness.dest);

		// ── get-shit-done/ content ──────────────────────────────────────────────
		const srcGsd = path.join(srcHarness, harness.subdir);
		const destGsd = path.join(destHarness, harness.subdir);

		if (!fs.existsSync(srcHarness)) {
			log(
				"skip",
				`${harness.dest}/${harness.subdir}  (source absent - skipped)`,
			);
			continue;
		}

		const { copied, skipped } = copyDir(srcGsd, destGsd, FORCE);
		totalCopied += copied;
		totalSkipped += skipped;

		if (copied > 0 || skipped === 0) {
			log(
				"ok",
				`${harness.dest}/${harness.subdir}  (${copied} file${copied === 1 ? "" : "s"} installed)`,
			);
		} else {
			log(
				"skip",
				`${harness.dest}/${harness.subdir}  (already up-to-date, ${skipped} file${skipped === 1 ? "" : "s"} skipped)`,
			);
		}

		// ── gsd-file-manifest.json ──────────────────────────────────────────────
		const manifestSrc = path.join(srcHarness, "gsd-file-manifest.json");
		const manifestDest = path.join(destHarness, "gsd-file-manifest.json");

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
			const destHooks = path.join(destHarness, "hooks");
			const h = copyDir(hooksRoot, destHooks, FORCE);
			totalCopied += h.copied;
			totalSkipped += h.skipped;

			if (h.copied > 0) {
				log(
					"ok",
					`${harness.dest}/hooks  (${h.copied} hook${h.copied === 1 ? "" : "s"} installed)`,
				);
			}
		}

		// ── skills/ (opencode only - present in .gsd/harnesses/opencode/skills) ─
		const srcSkills = path.join(srcHarness, "skills");
		const destSkills = path.join(destHarness, "skills");

		if (fs.existsSync(srcSkills)) {
			const s = copyDir(srcSkills, destSkills, FORCE);
			totalCopied += s.copied;
			totalSkipped += s.skipped;

			if (s.copied > 0) {
				log(
					"ok",
					`${harness.dest}/skills  (${s.copied} skill file${s.copied === 1 ? "" : "s"} installed)`,
				);
			}
		}

		installed++;
	}

	// ── Pi extension (.pi/extensions/gsd-hooks.ts) ─────────────────────────────
	// Install the GSD pi lifecycle extension (session_start, tool_call, tool_result hooks).
	// The extension is auto-discovered by pi from .pi/extensions/ - no manual wiring needed.
	installPiExtension(PROJECT_ROOT, PKG_DIR, FORCE, (copied) => {
		if (copied) totalCopied++;
		else totalSkipped++;
	});

	// ── Pi prompt templates — cleanup stale local copies ───────────────────────
	// Prompts are served directly from the npm package (user scope).
	// Local copies in .pi/prompts/ cause collision warnings on every pi update.
	// Remove any gsd-*.md files previously installed there.
	const promptsDest = path.join(PROJECT_ROOT, ".pi", "prompts");
	if (fs.existsSync(promptsDest)) {
		const stale = fs
			.readdirSync(promptsDest)
			.filter((f) => f.startsWith("gsd-") && f.endsWith(".md"));
		if (stale.length > 0) {
			for (const f of stale) fs.rmSync(path.join(promptsDest, f));
			log(
				"ok",
				`.pi/prompts  (removed ${stale.length} stale local gsd-*.md — served from package instead)`,
			);
		}
	}

	console.log("");

	if (installed === 0) {
		log("warn", "No harness source directories found inside the package.");
		log(
			"warn",
			"The package may be incomplete. Try: npm install --force get-shit-done-cc",
		);
		console.log("");
		return;
	}

	console.log(`  GSD v${getPackageVersion()} installed successfully.`);
	console.log(
		`  ${totalCopied} file${totalCopied === 1 ? "" : "s"} copied, ${totalSkipped} skipped.`,
	);
	console.log("");
	console.log("  Next steps:");
	console.log("    Run /gsd-new-project to initialise a project.");
	console.log("");
	console.log("  Docs: https://github.com/fulgidus/pi-gsd#readme");
	console.log("");
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
			fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8"),
		);
		return pkg.version || "unknown";
	} catch {
		return "unknown";
	}
}

/**
 * Install the GSD pi extension into the consumer project's .pi/extensions/ directory.
 * Also updates .pi/settings.json to include the extension in the extensions array.
 *
 * The extension registers three non-blocking pi lifecycle hooks:
 *   session_start  → background GSD update check
 *   tool_call      → workflow guard advisory (write/edit outside GSD context)
 *   tool_result    → context usage monitor
 *
 * @param {string} projectRoot  Consumer project root
 * @param {string} pkgDir       This package's root directory
 * @param {boolean} force       Overwrite existing files
 * @param {function} callback   Called with (copied: boolean)
 */
function installPiExtension(projectRoot, pkgDir, force, callback) {
	const piDir = path.join(projectRoot, ".pi");
	const extDir = path.join(piDir, "extensions");
	const extDest = path.join(extDir, "gsd-hooks.ts");
	const extSrc = path.join(pkgDir, ".gsd", "extensions", "gsd-hooks.ts");

	if (!fs.existsSync(extSrc)) {
		log("warn", ".pi/extensions/gsd-hooks.ts  (source absent - skipped)");
		callback(false);
		return;
	}

	// Always update the extension — it is owned by pi-gsd, not the user.
	// Compare gsd-extension-version comments to detect staleness.
	const extractVersion = (file) => {
		try {
			const match = fs.readFileSync(file, "utf8").match(/gsd-extension-version:\s*([\d.]+)/);
			return match ? match[1] : null;
		} catch { return null; }
	};
	const srcVersion = extractVersion(extSrc);
	const destVersion = fs.existsSync(extDest) ? extractVersion(extDest) : null;
	const needsUpdate = force || !destVersion || destVersion !== srcVersion;

	if (!needsUpdate) {
		log("skip", `.pi/extensions/gsd-hooks.ts  (up-to-date v${destVersion})`);
		callback(false);
	} else {
		try {
			fs.mkdirSync(extDir, { recursive: true });
			fs.copyFileSync(extSrc, extDest);
			log(
				"ok",
				".pi/extensions/gsd-hooks.ts  (GSD lifecycle extension installed)",
			);
			callback(true);
		} catch (e) {
			log(
				"warn",
				".pi/extensions/gsd-hooks.ts  (install failed: " + e.message + ")",
			);
			callback(false);
			return;
		}
	}

	// Update .pi/settings.json to include the extension path in the extensions array.
	// The file is already auto-discovered from .pi/extensions/, but explicit registration
	// is added as a belt-and-suspenders measure.
	const settingsFile = path.join(piDir, "settings.json");
	try {
		let settings = {};
		if (fs.existsSync(settingsFile)) {
			try {
				settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
			} catch {
				// Unreadable settings - start fresh object
			}
		}

		const extensions = Array.isArray(settings.extensions)
			? settings.extensions
			: [];

		// Avoid duplicate entries
		if (!extensions.includes(extDest)) {
			settings.extensions = [...extensions, extDest];
			fs.mkdirSync(piDir, { recursive: true });
			fs.writeFileSync(
				settingsFile,
				JSON.stringify(settings, null, "\t"),
				"utf8",
			);
			log("ok", ".pi/settings.json  (extensions array updated)");
		}
	} catch (e) {
		log("warn", ".pi/settings.json  (could not update: " + e.message + ")");
	}
}

main();
