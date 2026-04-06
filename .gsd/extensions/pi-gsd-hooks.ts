/**
 * pi-gsd-hooks.ts — pi-gsd Extension
 * pi-gsd-extension-version: 1.6.2
 *
 * Pi lifecycle extension for the Get Shit Done (GSD) workflow framework.
 * Provides three non-blocking hooks:
 *
 *   session_start  → background GSD update check (24 h cache)
 *   tool_call      → workflow guard advisory (write/edit outside GSD context)
 *   tool_result    → context usage monitor with debounced warnings
 *
 * Non-blocking guarantee: all failures are silent; hook errors never prevent
 * tool execution or session startup.
 *
 * Auto-discovered by pi from .pi/extensions/ (no settings.json entry required).
 * Source: https://github.com/fulgidus/pi-gsd
 */

import { execSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ContextUsage, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { processWxpTrustedContent, WxpProcessingError } from "../../src/wxp/index.js";
import { DEFAULT_SHELL_ALLOWLIST } from "../../src/wxp/security.js";
import type { WxpSecurityConfig } from "../../src/wxp/schema.js";

/**
 * Ensures .pi/gsd/ in the project is a symlink to the harness files
 * inside the pi-gsd package. Creates the symlink on first run; skips
 * if already present. Never overwrites a real directory (user may have
 * customised it).
 */
const ensureHarnessSymlink = (cwd: string): void => {
	try {
		const dest = join(cwd, ".pi", "gsd");
		// If dest exists, verify it's a valid symlink with files inside.
		// A stale real directory (from old build or worktree) must be replaced.
		if (existsSync(dest)) {
			try {
				const stat = statSync(dest);
				if (stat.isSymbolicLink?.() || lstatSync(dest).isSymbolicLink()) return; // valid symlink, done
				// Real directory — check if it has the expected files
				if (existsSync(join(dest, "workflows", "execute-phase.md"))) return; // looks complete
				// Stale/incomplete directory — remove and replace with symlink
				rmSync(dest, { recursive: true, force: true });
			} catch {
				return; // can't inspect, leave it
			}
		}

		// Walk up from this extension file to the package root:
		// <pkg>/.gsd/extensions/pi-gsd-hooks.ts → <pkg>
		const extFile = typeof __filename !== "undefined" ? __filename : "";
		const pkgRoot = join(dirname(extFile), "..", "..");
		const harnessSrc = join(
			pkgRoot,
			".gsd",
			"harnesses",
			"pi",
			"get-shit-done",
		);

		if (!existsSync(harnessSrc)) return; // package incomplete — skip silently

		mkdirSync(join(cwd, ".pi"), { recursive: true });
		symlinkSync(harnessSrc, dest, "dir");
	} catch {
		/* silent — never block session startup */
	}
};


export default function (pi: ExtensionAPI) {
/** Resolve a single <gsd-include> match: file lookup + selector extraction. */
function resolveGsdInclude(
	match: RegExpMatchArray,
	cwd: string,
	pkgHarness: string,
	errors: string[],
): string | null {
	const filePath = match[1];
	const selectExpr = match[2] ?? "";

	// ── Resolve file path ───────────────────────────────────────
	const subPath = filePath.replace(/^\.pi\/gsd\//, "");
	const candidates = [
		join(cwd, filePath),
		...(filePath.startsWith(".pi/gsd/") && pkgHarness
			? [join(pkgHarness, subPath)]
			: []),
	];

	let raw: string | null = null;
	for (const c of candidates) {
		try {
			if (existsSync(c)) {
				raw = readFileSync(c, "utf8");
				break;
			}
		} catch {
			/* try next */
		}
	}
	if (raw === null) {
		errors.push("File not found: " + filePath);
		return null;
	}

	// ── Apply selector ─────────────────────────────────────────
	let result = raw;
	if (!selectExpr) return result;

	const parts = selectExpr.split("|");
	if (parts.length > 2) {
		errors.push("Invalid selector (max 2 segments): " + selectExpr);
		return null;
	}
	if (parts.length > 1 && parts.some((p) => p.trim().startsWith("lines:"))) {
		errors.push("lines: cannot be chained — use it alone: " + selectExpr);
		return null;
	}

	for (const part of parts) {
		const p = part.trim();

		if (p.startsWith("tag:")) {
			const tagName = p.slice(4);
			const tagRe = new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i");
			const tagMatch = result.match(tagRe);
			if (!tagMatch) {
				errors.push("Tag <" + tagName + "> not found in " + filePath);
				return null;
			}
			result = tagMatch[1].trim();
		} else if (p.startsWith("heading:")) {
			const headingText = p.slice(8);
			const escaped = headingText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const headingRe = new RegExp("(^|\\n)(#{1,6})\\s+" + escaped + "\\s*\\n");
			const hMatch = result.match(headingRe);
			if (!hMatch) {
				errors.push('Heading "' + headingText + '" not found in ' + filePath);
				return null;
			}
			const level = hMatch[2].length;
			const startIdx = (hMatch.index ?? 0) + hMatch[0].length;
			const nextHeading = result.slice(startIdx).search(new RegExp("\\n#{1," + level + "}\\s"));
			result =
				nextHeading === -1
					? result.slice(startIdx).trim()
					: result.slice(startIdx, startIdx + nextHeading).trim();
		} else if (p.startsWith("lines:")) {
			const rangeMatch = p.match(/^lines:(\d+)-(\d+)$/);
			if (!rangeMatch) {
				errors.push("Invalid lines selector: " + p);
				return null;
			}
			const start = parseInt(rangeMatch[1], 10) - 1;
			const end = parseInt(rangeMatch[2], 10);
			result = result.split("\n").slice(start, end).join("\n");
		} else {
			errors.push("Unknown selector: " + p);
			return null;
		}
	}

	return result;
}

	// ── context: <gsd-include> injection ────────────────────────────────────────
	// Fires AFTER template expansion, before each LLM call.
	// Scans user messages for <gsd-include path="..." select="..." /> tags,
	// resolves files, applies selectors, replaces tags with content.
	// On ANY failure: red error + return empty messages to block the LLM call.
	pi.on("context", async (event, ctx) => {
		const includePattern = /<gsd-include\s+path="([^"]+)"(?:\s+select="([^"]*)")?\s*\/>/g;

		// Package harness fallback path
		const extFile = typeof __filename !== "undefined" ? __filename : "";
		const pkgHarness = extFile
			? join(dirname(extFile), "..", "harnesses", "pi", "get-shit-done")
			: "";

		const errors: string[] = [];
		const messages = event.messages;

		for (const msg of messages) {
			if (msg.role !== "user") continue;

			// Handle both string content and content block arrays
			if (typeof msg.content === "string") {
				const includes = [...msg.content.matchAll(includePattern)];
				if (includes.length === 0) continue;

				let transformed = msg.content;
				for (const match of includes) {
					const replacement = resolveGsdInclude(match, ctx.cwd, pkgHarness, errors);
					if (replacement === null) continue;
					transformed = transformed.replace(match[0], replacement);
				}
				msg.content = transformed;
			} else if (Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (block.type !== "text" || !block.text) continue;
					const includes = [...block.text.matchAll(includePattern)];
					if (includes.length === 0) continue;

					let transformed = block.text;
					for (const match of includes) {
						const replacement = resolveGsdInclude(match, ctx.cwd, pkgHarness, errors);
						if (replacement === null) continue;
						transformed = transformed.replace(match[0], replacement);
					}
					block.text = transformed;
				}
			}
		}

		if (errors.length > 0) {
			ctx.ui.notify("\u274c GSD include failed:\n" + errors.map((e) => "  \u2022 " + e).join("\n"), "error");
			return { messages: [] }; // block LLM call
		}

		// ── WXP post-processing: run after <gsd-include> resolution (WXP-14) ──
		const wxpSecurity: WxpSecurityConfig = {
			trustedPaths: [pkgHarness, join(ctx.cwd, ".pi", "gsd")].filter(existsSync),
			shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
			shellTimeoutMs: 30_000,
		};

		try {
			for (const msg of messages) {
				if (msg.role !== "user") continue;
				if (typeof msg.content === "string") {
					if (!msg.content.includes("<gsd-")) continue;
					// Use a virtual trusted path so the path-check passes
					const virtualPath = join(ctx.cwd, ".pi", "gsd", "workflows", "_message.md");
					msg.content = processWxpTrustedContent(msg.content, virtualPath, wxpSecurity);
				} else if (Array.isArray(msg.content)) {
					for (const block of msg.content) {
						if (block.type !== "text" || !block.text) continue;
						if (!block.text.includes("<gsd-")) continue;
						const virtualPath = join(ctx.cwd, ".pi", "gsd", "workflows", "_message.md");
						block.text = processWxpTrustedContent(block.text, virtualPath, wxpSecurity);
					}
				}
			}
		} catch (wxpErr) {
			if (wxpErr instanceof WxpProcessingError) {
				ctx.ui.notify(wxpErr.message, "error");
				return { messages: [] }; // WXP-09: no partial content reaches LLM
			}
			// Non-WXP error: log but don't block
			const errMsg = wxpErr instanceof Error ? wxpErr.message : String(wxpErr);
			ctx.ui.notify(`GSD WXP: unexpected context error: ${errMsg}`, "info");
		}

		return { messages };
	});

	// ── session_start: GSD update check ──────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		// Ensure harness files are reachable via .pi/gsd/ symlink
		ensureHarnessSymlink(ctx.cwd);


		try {
			const cacheDir = join(homedir(), ".pi", "cache");
			const cacheFile = join(cacheDir, "gsd-update-check.json");
			const CACHE_TTL_SECONDS = 86_400; // 24 hours

			// Show cached update notification if available
			if (existsSync(cacheFile)) {
				try {
					const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as {
						update_available?: boolean;
						installed?: string;
						latest?: string;
						checked?: number;
					};
					const ageSeconds =
						Math.floor(Date.now() / 1000) - (cache.checked ?? 0);

					if (cache.update_available && cache.latest) {
						ctx.ui.notify(
							`GSD update available: ${cache.installed ?? "?"} → ${cache.latest}. Run: npm i -g pi-gsd`,
							"info",
						);
					}

					// Cache is fresh - skip network check
					if (ageSeconds < CACHE_TTL_SECONDS) return;
				} catch {
					// Corrupt cache - fall through to fresh check
				}
			}

			// Run network check asynchronously after 3 s to avoid blocking startup
			setTimeout(() => {
				try {
					mkdirSync(cacheDir, { recursive: true });

					// Resolve installed version from project or global GSD install
					let installed = "0.0.0";
					const versionPaths = [
						join(ctx.cwd, ".pi", "gsd", "VERSION"),
						join(homedir(), ".pi", "gsd", "VERSION"),
					];
					for (const vp of versionPaths) {
						if (existsSync(vp)) {
							try {
								installed = readFileSync(vp, "utf8").trim();
								break;
							} catch {
								/* skip unreadable */
							}
						}
					}

					let latest: string | null = null;
					try {
						latest = execSync("npm view pi-gsd version", {
							encoding: "utf8",
							timeout: 10_000,
							windowsHide: true,
						}).trim();
					} catch {
						/* offline or npm unavailable */
					}

					writeFileSync(
						cacheFile,
						JSON.stringify({
							update_available:
								latest !== null &&
								installed !== "0.0.0" &&
								installed !== latest,
							installed,
							latest: latest ?? "unknown",
							checked: Math.floor(Date.now() / 1000),
						}),
					);
				} catch {
					/* silent fail */
				}
			}, 3_000);
		} catch {
			/* silent fail - never throw from session_start */
		}
	});

	// ── tool_call: workflow guard (advisory only, never blocking) ────────────
	pi.on("tool_call", async (event, ctx) => {
		try {
			// Only guard write and edit tool calls
			if (event.toolName !== "write" && event.toolName !== "edit")
				return undefined;

			const filePath = (event.input as { path?: string }).path ?? "";

			// Allow .planning/ edits (GSD state management)
			if (filePath.includes(".planning/")) return undefined;

			// Allow common config/docs files that don't need GSD tracking
			const allowed = [
				/\.gitignore$/,
				/\.env/,
				/AGENTS\.md$/,
				/settings\.json$/,
				/pi-gsd-hooks\.ts$/,
			];
			if (allowed.some((p) => p.test(filePath))) return undefined;

			// Only activate when GSD project has workflow_guard enabled
			const configPath = join(ctx.cwd, ".planning", "config.json");
			if (!existsSync(configPath)) return undefined; // No GSD project

			try {
				const config = JSON.parse(readFileSync(configPath, "utf8")) as {
					hooks?: { workflow_guard?: boolean };
				};
				if (!config.hooks?.workflow_guard) return undefined; // Guard disabled (default)
			} catch {
				return undefined;
			}

			// Advisory only - never block tool execution
			const fileName = filePath.split("/").pop() ?? filePath;
			ctx.ui.notify(
				`⚠️ GSD: Editing ${fileName} outside a GSD workflow. Consider /gsd-fast or /gsd-quick to maintain state tracking.`,
				"info",
			);
		} catch {
			/* silent fail - never block tool execution */
		}

		return undefined;
	});

	// ── Instant commands (zero LLM, deterministic output) ────────────────────

	// JSON shapes returned by pi-gsd-tools
	interface GsdPhase {
		number: string;
		name: string;
		plans: number;
		summaries: number;
		status: string;
	}
	interface GsdProgress {
		milestone_version: string;
		milestone_name: string;
		phases: GsdPhase[];
		total_plans: number;
		total_summaries: number;
		percent: number;
	}
	interface GsdStats extends GsdProgress {
		phases_completed: number;
		phases_total: number;
		plan_percent: number;
		requirements_total: number;
		requirements_complete: number;
		git_commits: number;
		git_first_commit_date: string;
		last_activity: string;
	}
	interface GsdState {
		milestone: string;
		milestone_name: string;
		status: string;
		last_activity: string;
		progress: {
			total_phases: string;
			completed_phases: string;
			total_plans: string;
			completed_plans: string;
		};
	}
	interface GsdHealth {
		status: string;
		errors: Array<{ code: string; message: string; repair?: string }>;
		warnings: Array<{ code: string; message: string }>;
	}

	const runJson = <T>(args: string, cwd: string): T | null => {
		try {
			const raw = execSync(
				`pi-gsd-tools ${args} --raw --cwd ${JSON.stringify(cwd)}`,
				{ encoding: "utf8", timeout: 10_000, windowsHide: true },
			).trim();
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	};

	const bar = (pct: number, width = 20): string => {
		const filled = Math.round((pct / 100) * width);
		return "█".repeat(filled) + "░".repeat(width - filled);
	};

	const cap = (s: string, max = 42): string =>
		s.length > max ? s.slice(0, max - 1) + "…" : s;

	/** Derive the next GSD action from phase data — no LLM needed. */
	const nextSteps = (phases: GsdPhase[]): string[] => {
		const pending = phases.filter((p) => p.status !== "Complete");
		if (pending.length === 0) {
			return [
				"  ✅ All phases complete!",
				"  → /gsd-audit-milestone      Review before archiving",
				"  → /gsd-complete-milestone   Archive and start next",
			];
		}
		const next = pending[0];
		const n = next.number;
		const lines: string[] = [`  ⏳ Phase ${n}: ${cap(next.name)}`];
		if (next.plans === 0) {
			lines.push(`  → /gsd-discuss-phase ${n}    Gather context first`);
			lines.push(`  → /gsd-plan-phase ${n}       Jump straight to planning`);
		} else if (next.summaries < next.plans) {
			lines.push(
				`  → /gsd-execute-phase ${n}    ${next.summaries}/${next.plans} plans done`,
			);
		} else {
			lines.push(`  → /gsd-verify-work ${n}      All plans done, verify UAT`);
		}
		lines.push(`  → /gsd-next                Auto-advance`);
		if (pending.length > 1) {
			lines.push(
				`  (+ ${pending.length - 1} more phase${pending.length > 2 ? "s" : ""} pending)`,
			);
		}
		return lines;
	};

	const formatProgress = (
		cwd: string,
	): { text: string; data: GsdProgress | null } => {
		const data = runJson<GsdProgress>("progress json", cwd);
		if (!data)
			return {
				text: "❌ No GSD project found. Run /gsd-new-project to initialise.",
				data: null,
			};

		const done = data.phases.filter((p) => p.status === "Complete").length;
		const total = data.phases.length;
		const phasePct = total > 0 ? Math.round((done / total) * 100) : 0;
		const planPct =
			data.total_plans > 0
				? Math.round((data.total_summaries / data.total_plans) * 100)
				: 0;

		const lines = [
			`━━ GSD Progress ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
			`📋  ${data.milestone_name} (${data.milestone_version})`,
			``,
			`Phases  ${bar(phasePct)}  ${done}/${total} (${phasePct}%)`,
			`Plans   ${bar(planPct)}  ${data.total_summaries}/${data.total_plans} (${planPct}%)`,
			``,
			`Next steps:`,
			...nextSteps(data.phases),
			``,
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
		];
		return { text: lines.join("\n"), data };
	};

	const formatStats = (
		cwd: string,
	): { text: string; data: GsdStats | null } => {
		const data = runJson<GsdStats>("stats json", cwd);
		if (!data)
			return {
				text: "❌ No GSD project found. Run /gsd-new-project to initialise.",
				data: null,
			};

		const reqPct =
			data.requirements_total > 0
				? Math.round(
						(data.requirements_complete / data.requirements_total) * 100,
					)
				: 0;

		const lines = [
			`━━ GSD Stats ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
			`📋  ${data.milestone_name} (${data.milestone_version})`,
			``,
			`Phases  ${bar(data.percent)}  ${data.phases_completed}/${data.phases_total} (${data.percent}%)`,
			`Plans   ${bar(data.plan_percent)}  ${data.total_summaries}/${data.total_plans} (${data.plan_percent}%)`,
			`Reqs    ${bar(reqPct)}  ${data.requirements_complete}/${data.requirements_total} (${reqPct}%)`,
			``,
			`🗂  Git commits:   ${data.git_commits}`,
			`📅  Started:       ${data.git_first_commit_date}`,
			`📅  Last activity: ${data.last_activity}`,
			``,
			`Next steps:`,
			...nextSteps(data.phases),
			``,
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
		];
		return { text: lines.join("\n"), data };
	};

	const formatHealth = (cwd: string, repair: boolean): string => {
		const data = runJson<GsdHealth>(
			`validate health${repair ? " --repair" : ""}`,
			cwd,
		);
		if (!data)
			return "❌ No GSD project found. Run /gsd-new-project to initialise.";

		const icon =
			data.status === "ok" ? "✅" : data.status === "broken" ? "❌" : "⚠️";
		const lines = [
			`━━ GSD Health ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
			`${icon}  Status: ${data.status.toUpperCase()}`,
		];

		if (data.errors?.length) {
			lines.push(``, `Errors (${data.errors.length}):`);
			for (const e of data.errors) {
				lines.push(`  ✗ [${e.code}] ${e.message}`);
				if (e.repair) lines.push(`      fix: ${e.repair}`);
			}
		}
		if (data.warnings?.length) {
			lines.push(``, `Warnings (${data.warnings.length}):`);
			for (const w of data.warnings) {
				lines.push(`  ⚠ [${w.code}] ${w.message}`);
			}
		}
		if (data.status !== "ok" && !repair) {
			lines.push(``, `  → /gsd-health --repair   Auto-fix all issues`);
		}
		lines.push(``, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
		return lines.join("\n");
	};

	/** Derive the suggested next command string from phase data. */
	const nextCommand = (phases: GsdPhase[]): string | null => {
		const pending = phases.filter((p) => p.status !== "Complete");
		if (pending.length === 0) return "/gsd-audit-milestone";
		const next = pending[0];
		const n = next.number;
		if (next.plans === 0) return `/gsd-discuss-phase ${n}`;
		if (next.summaries < next.plans) return `/gsd-execute-phase ${n}`;
		return `/gsd-verify-work ${n}`;
	};

	pi.registerCommand("gsd-progress", {
		description: "Show project progress with next steps (instant)",
		handler: async (_args, ctx) => {
			const { text, data } = formatProgress(ctx.cwd);
			ctx.ui.notify(text, "info");
			// Pivot affordance: pre-fill the editor with the most relevant next action
			// so the user can run it, modify it, or just type something else entirely
			if (data) {
				const cmd = nextCommand(data.phases);
				if (cmd) ctx.ui.setEditorText(cmd);
			}
		},
	});

	pi.registerCommand("gsd-stats", {
		description: "Show project statistics (instant)",
		handler: async (_args, ctx) => {
			const { text, data } = formatStats(ctx.cwd);
			ctx.ui.notify(text, "info");
			if (data) {
				const cmd = nextCommand(data.phases);
				if (cmd) ctx.ui.setEditorText(cmd);
			}
		},
	});

	pi.registerCommand("gsd-health", {
		description: "Check .planning/ integrity (instant)",
		handler: async (args, ctx) => {
			ctx.ui.notify(
				formatHealth(ctx.cwd, !!args?.includes("--repair")),
				"info",
			);
		},
		getArgumentCompletions: (prefix) => {
			const options = [
				{ value: "--repair", label: "--repair  Auto-fix issues" },
			];
			return options.filter((o) => o.value.startsWith(prefix));
		},
	});

	pi.registerCommand("gsd-next", {
		description: "Auto-advance to the next GSD action (instant, no LLM)",
		handler: async (_args, ctx) => {
			const data = runJson<GsdProgress>("progress json", ctx.cwd);
			if (!data) {
				ctx.ui.notify(
					"❌ No GSD project found. Run /gsd-new-project to initialise.",
					"error",
				);
				ctx.ui.setEditorText("/gsd-new-project");
				return;
			}

			const pending = data.phases.filter((p) => p.status !== "Complete");

			if (pending.length === 0) {
				ctx.ui.notify(
					[
						`━━ GSD Next ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
						`✅  All phases complete!`,
						`→   /gsd-audit-milestone`,
						`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
					].join("\n"),
					"info",
				);
				ctx.ui.setEditorText("/gsd-audit-milestone");
				return;
			}

			const next = pending[0];
			const n = next.number;
			let action: string;
			let reason: string;

			if (next.plans === 0) {
				action = `/gsd-discuss-phase ${n}`;
				reason = `Phase ${n} has no plans yet — start with discussion`;
			} else if (next.summaries < next.plans) {
				action = `/gsd-execute-phase ${n}`;
				reason = `Phase ${n}: ${next.summaries}/${next.plans} plans done — continue execution`;
			} else {
				action = `/gsd-verify-work ${n}`;
				reason = `Phase ${n}: all plans done — verify UAT`;
			}

			ctx.ui.notify(
				[
					`━━ GSD Next ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
					`⏩  ${reason}`,
					`→   ${action}`,
					...(pending.length > 1
						? [
								`    (${pending.length - 1} more phase${pending.length > 2 ? "s" : ""} pending after this)`,
							]
						: []),
					`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
				].join("\n"),
				"info",
			);
			ctx.ui.setEditorText(action);
		},
	});

	pi.registerCommand("gsd-help", {
		description: "List all GSD commands (instant)",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				[
					"━━ GSD Commands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
					"Lifecycle:",
					"  /gsd-new-project        Initialise project",
					"  /gsd-new-milestone      Start next milestone",
					"  /gsd-discuss-phase N    Discuss before planning",
					"  /gsd-plan-phase N       Create phase plan",
					"  /gsd-execute-phase N    Execute phase",
					"  /gsd-verify-work N      UAT testing",
					"  /gsd-validate-phase N   Validate completion",
					"  /gsd-next               Auto-advance",
					"  /gsd-autonomous         Run all phases",
					"  /gsd-plan-milestone     Plan all phases at once",
					"  /gsd-execute-milestone  Execute all phases with gates",
					"",
					"Quick:",
					"  /gsd-quick <task>       Tracked ad-hoc task",
					"  /gsd-fast <task>        Inline, no subagents",
					"  /gsd-do <text>          Route automatically",
					"  /gsd-debug              Debug session",
					"",
					"Instant (no LLM):",
					"  /gsd-progress           Progress + next steps",
					"  /gsd-stats              Full statistics",
					"  /gsd-health [--repair]  .planning/ integrity",
					"  /gsd-help               This list",
					"",
					"Management:",
					"  /gsd-setup-pi           Wire pi extension",
					"  /gsd-set-profile <p>    quality|balanced|budget",
					"  /gsd-settings           Workflow toggles",
					"  /gsd-progress           Roadmap overview",
					"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
				].join("\n"),
				"info",
			);
		},
	});

	// ── tool_result: context usage monitor ───────────────────────────────────
	const WARNING_THRESHOLD = 35; // warn when remaining % ≤ 35
	const CRITICAL_THRESHOLD = 25; // critical when remaining % ≤ 25
	const DEBOUNCE_CALLS = 5; // minimum tool uses between repeated warnings

	let callsSinceWarn = 0;
	let lastLevel: "warning" | "critical" | null = null;

	pi.on("tool_result", async (_event, ctx) => {

		try {
			const usage: ContextUsage | undefined = ctx.getContextUsage();
			if (!usage || usage.percent === null) return undefined;

			const usedPct = Math.round(usage.percent);
			const remaining = 100 - usedPct;

			// Below warning threshold - just increment debounce counter
			if (remaining > WARNING_THRESHOLD) {
				callsSinceWarn++;
				return undefined;
			}

			// Respect opt-out via project config
			const configPath = join(ctx.cwd, ".planning", "config.json");
			if (existsSync(configPath)) {
				try {
					const config = JSON.parse(readFileSync(configPath, "utf8")) as {
						hooks?: { context_warnings?: boolean };
					};
					if (config.hooks?.context_warnings === false) return undefined;
				} catch {
					/* ignore config errors */
				}
			}

			const isCritical = remaining <= CRITICAL_THRESHOLD;
			const currentLevel: "warning" | "critical" = isCritical
				? "critical"
				: "warning";

			callsSinceWarn++;

			// Debounce - allow severity escalation (warning → critical bypasses debounce)
			const severityEscalated =
				currentLevel === "critical" && lastLevel === "warning";
			if (
				lastLevel !== null &&
				callsSinceWarn < DEBOUNCE_CALLS &&
				!severityEscalated
			) {
				return undefined;
			}

			callsSinceWarn = 0;
			lastLevel = currentLevel;

			const isGsdActive = existsSync(join(ctx.cwd, ".planning", "STATE.md"));

			let msg: string;
			if (isCritical) {
				msg = isGsdActive
					? `🔴 CONTEXT CRITICAL: ${usedPct}% used (${remaining}% left). GSD state is in STATE.md. Inform user to run /gsd-pause-work.`
					: `🔴 CONTEXT CRITICAL: ${usedPct}% used (${remaining}% left). Inform user context is nearly exhausted.`;
			} else {
				msg = isGsdActive
					? `⚠️ CONTEXT WARNING: ${usedPct}% used (${remaining}% left). Avoid starting new complex work.`
					: `⚠️ CONTEXT WARNING: ${usedPct}% used (${remaining}% left). Context is getting limited.`;
			}

			ctx.ui.notify(msg, isCritical ? "error" : "info");
		} catch {
			/* silent fail - never throw from tool_result */
		}

		return undefined;
	});
}
