/**
 * gsd-hooks.ts — GSD pi Extension
 * gsd-extension-version: 1.30.0
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ContextUsage, ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// ── session_start: GSD update check ──────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
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

					// Cache is fresh — skip network check
					if (ageSeconds < CACHE_TTL_SECONDS) return;
				} catch {
					// Corrupt cache — fall through to fresh check
				}
			}

			// Run network check asynchronously after 3 s to avoid blocking startup
			setTimeout(() => {
				try {
					mkdirSync(cacheDir, { recursive: true });

					// Resolve installed version from project or global GSD install
					let installed = "0.0.0";
					const versionPaths = [
						join(ctx.cwd, ".pi", "get-shit-done", "VERSION"),
						join(homedir(), ".pi", "get-shit-done", "VERSION"),
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
			/* silent fail — never throw from session_start */
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
				/gsd-hooks\.ts$/,
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

			// Advisory only — never block tool execution
			const fileName = filePath.split("/").pop() ?? filePath;
			ctx.ui.notify(
				`⚠️ GSD: Editing ${fileName} outside a GSD workflow. Consider /gsd-fast or /gsd-quick to maintain state tracking.`,
				"info",
			);
		} catch {
			/* silent fail — never block tool execution */
		}

		return undefined;
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

			// Below warning threshold — just increment debounce counter
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

			// Debounce — allow severity escalation (warning → critical bypasses debounce)
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
			/* silent fail — never throw from tool_result */
		}

		return undefined;
	});
}
