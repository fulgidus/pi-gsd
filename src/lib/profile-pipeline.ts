/**
 * profile-pipeline.ts — Profile rendering pipeline (session scanning, message extraction).
 *
 * Supports two session storage formats:
 *
 * ## Claude / agent sessions
 * Path:   ~/.claude/projects/<encoded-project>/<session>.jsonl
 *         (also checks ~/.agent/projects/ for the legacy agent harness)
 * Format: Each line is a raw AgentMessage JSON object with a top-level `role` field.
 *         User messages have role "human"; assistant messages have role "assistant".
 *
 * ## Pi sessions
 * Path:   ~/.pi/agent/sessions/--<path-with-slashes-as-dashes>--/<timestamp>_<uuid>.jsonl
 *         The directory name encodes the project cwd: "/" is replaced with "-" and the
 *         whole path is wrapped in "--" delimiters. E.g. "/home/user/my-project" becomes
 *         "--home-user-my-project--".
 * Format: Each line is a JSONL entry (SessionEntry) with a "type" discriminant:
 *   - Header (first line only): {"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path"}
 *   - Message entry: {"type":"message","id":"<8hex>","parentId":"<8hex>|null","timestamp":"...",
 *                     "message":{"role":"user"|"assistant"|"toolResult",...}}
 *     The message.role for human turns is "user" (not "human" as in Claude sessions).
 *     message.content is a string (user) or array of content blocks (assistant/toolResult).
 *   - Other entries (model_change, session_info, compaction, etc.) are ignored for profiling.
 *
 * Auto-detection: cmdScanSessions detects both harness types. When --harness pi is given,
 * pi sessions are listed first and marked as priority. Existing Claude session reading
 * is fully preserved.
 */

import { gsdError, output } from "./core.js";

interface ProfileSampleOptions {
	limit?: number;
	maxPerProject?: number | null;
	maxChars?: number;
	/** "pi" | "claude" | "agent" — when set, prioritise that harness */
	harness?: string | null;
}

interface ExtractMessagesOptions {
	sessionId?: string | null;
	limit?: number | null;
}

interface ScanSessionsOptions {
	verbose?: boolean;
	json?: boolean;
	/** "pi" | "claude" | "agent" — when set, prioritise that harness */
	harness?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path") as typeof import("path");

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the Claude/agent session base path.
 * Checks ~/.agent/projects first (legacy agent harness), falls back to ~/.claude/projects.
 */
function getClaudeSessionsBasePath(overridePath?: string | null): string {
	if (overridePath) return overridePath;
	const home = process.env["HOME"] ?? "";
	const agentProjects = path.join(home, ".agent", "projects");
	if (fs.existsSync(agentProjects)) return agentProjects;
	return path.join(home, ".claude", "projects");
}

/**
 * Returns the pi session base path: ~/.pi/agent/sessions/
 *
 * Pi stores sessions in per-project subdirectories named by encoding the project's
 * cwd: every "/" is replaced with "-" and the result is wrapped in "--" delimiters.
 * Example: "/home/user/my-proj" → "--home-user-my-proj--"
 */
function getPiSessionsBasePath(): string {
	const home = process.env["HOME"] ?? "";
	return path.join(home, ".pi", "agent", "sessions");
}

/**
 * Extracts the human-readable project path from a pi session directory name.
 * "--home-user-my-proj--" → "/home/user/my-proj"
 */
function decodePiProjectDir(dirName: string): string {
	// Strip surrounding "--" delimiters, then replace "-" back to "/"
	// Note: this is lossy (hyphens in path become slashes) but sufficient for display.
	if (dirName.startsWith("--") && dirName.endsWith("--")) {
		return "/" + dirName.slice(2, -2).replace(/-/g, "/");
	}
	return dirName;
}

// ─── Pi JSONL helpers ─────────────────────────────────────────────────────────

/**
 * A pi session entry. Only the fields relevant for profiling are typed here.
 * All other entry types (model_change, compaction, etc.) are represented as unknown.
 */
interface PiSessionEntry {
	type: string;
	id?: string;
	parentId?: string | null;
	timestamp?: string;
	// For type === "session" (header)
	version?: number;
	cwd?: string;
	// For type === "message"
	message?: {
		role: "user" | "assistant" | "toolResult" | string;
		content?: unknown; // string | ContentBlock[]
		timestamp?: number;
	};
}

/**
 * Returns true if the first parseable line of a JSONL file looks like a pi session header.
 * Pi session files begin with: {"type":"session","version":...}
 */
function isPiSessionFile(filePath: string): boolean {
	try {
		const firstLine = fs
			.readFileSync(filePath, "utf-8")
			.split("\n")
			.find((l) => l.trim().length > 0);
		if (!firstLine) return false;
		const parsed = JSON.parse(firstLine) as Record<string, unknown>;
		return parsed["type"] === "session" && "version" in parsed;
	} catch {
		return false;
	}
}

/**
 * Extracts the text content from a pi message's content field.
 * Content may be a plain string or an array of content blocks ({type:"text", text:"..."}).
 */
function extractPiMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter(
				(b) =>
					b !== null &&
					typeof b === "object" &&
					(b as Record<string, unknown>)["type"] === "text",
			)
			.map((b) => String((b as Record<string, unknown>)["text"] ?? ""))
			.join(" ");
	}
	return "";
}

/**
 * Reads all user-turn messages from a pi JSONL session file.
 * Returns raw entry objects so callers can inspect role/content themselves.
 */
function readPiSessionMessages(filePath: string): PiSessionEntry[] {
	try {
		const lines = fs
			.readFileSync(filePath, "utf-8")
			.split("\n")
			.filter(Boolean);
		const messages: PiSessionEntry[] = [];
		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as PiSessionEntry;
				// Only keep message entries (skip header, model_change, etc.)
				if (entry.type === "message" && entry.message) {
					messages.push(entry);
				}
			} catch {
				/* skip malformed lines */
			}
		}
		return messages;
	} catch {
		return [];
	}
}

// ─── Exported commands ────────────────────────────────────────────────────────

export async function cmdScanSessions(
	overridePath: string | null | undefined,
	options: ScanSessionsOptions,
	raw: boolean,
): Promise<void> {
	const harness = options.harness ?? null;
	const isPiHarness = harness === "pi";

	// Collect pi sessions
	const piBase = getPiSessionsBasePath();
	const piAvailable = fs.existsSync(piBase);
	const piProjects: Array<{
		name: string;
		sessions: number;
		path: string;
		source: "pi";
		cwd: string;
	}> = [];

	if (piAvailable) {
		try {
			const entries = fs
				.readdirSync(piBase, { withFileTypes: true })
				.filter((e) => e.isDirectory());
			for (const entry of entries) {
				const projectDir = path.join(piBase, entry.name);
				const sessionFiles = fs
					.readdirSync(projectDir)
					.filter((f) => f.endsWith(".jsonl"));
				piProjects.push({
					name: entry.name,
					sessions: sessionFiles.length,
					path: projectDir,
					source: "pi",
					cwd: decodePiProjectDir(entry.name),
				});
			}
		} catch {
			/* ok — partial failures are non-fatal */
		}
	}

	// Collect Claude/agent sessions (skip when explicit pi harness + no override path)
	const claudeBase = getClaudeSessionsBasePath(
		isPiHarness && !overridePath ? null : overridePath,
	);
	const claudeAvailable =
		!isPiHarness || overridePath ? fs.existsSync(claudeBase) : false;
	const claudeProjects: Array<{
		name: string;
		sessions: number;
		path: string;
		source: "claude";
	}> = [];

	if (claudeAvailable && (!isPiHarness || overridePath)) {
		try {
			const entries = fs
				.readdirSync(claudeBase, { withFileTypes: true })
				.filter((e) => e.isDirectory());
			for (const entry of entries) {
				const projectDir = path.join(claudeBase, entry.name);
				const sessionFiles = fs
					.readdirSync(projectDir)
					.filter((f) => f.endsWith(".jsonl") || f.endsWith(".json"));
				claudeProjects.push({
					name: entry.name,
					sessions: sessionFiles.length,
					path: projectDir,
					source: "claude",
				});
			}
		} catch {
			/* ok */
		}
	}

	// Pi sessions first when pi harness is prioritised
	const projects = isPiHarness
		? [...piProjects, ...claudeProjects]
		: [...claudeProjects, ...piProjects];

	if (projects.length === 0) {
		const searched: string[] = [];
		if (piAvailable) searched.push(piBase);
		else searched.push(piBase + " (not found)");
		if (!isPiHarness)
			searched.push(claudeAvailable ? claudeBase : claudeBase + " (not found)");
		output(
			{
				available: false,
				reason: `No sessions found. Searched: ${searched.join(", ")}`,
				projects: [],
				count: 0,
			},
			raw,
		);
		return;
	}

	output(
		{
			available: true,
			pi_base: piAvailable ? piBase : null,
			claude_base: claudeAvailable ? claudeBase : null,
			projects,
			count: projects.length,
		},
		raw,
	);
}

export async function cmdExtractMessages(
	projectArg: string,
	options: ExtractMessagesOptions,
	raw: boolean,
	overridePath?: string | null,
): Promise<void> {
	// Try pi sessions first (project dir may be a decoded cwd or a raw --path-- dir name)
	const piBase = getPiSessionsBasePath();
	let resolvedDir: string | null = null;
	let sessionFormat: "pi" | "claude" = "claude";

	if (fs.existsSync(piBase)) {
		// Direct match on encoded dir name (e.g. "--home-user-proj--")
		const direct = path.join(piBase, projectArg);
		if (fs.existsSync(direct)) {
			resolvedDir = direct;
			sessionFormat = "pi";
		} else {
			// Try fuzzy match: find a pi project dir whose decoded cwd ends with projectArg
			try {
				const dirs = fs
					.readdirSync(piBase, { withFileTypes: true })
					.filter((e) => e.isDirectory());
				for (const d of dirs) {
					const decoded = decodePiProjectDir(d.name);
					if (
						decoded.endsWith("/" + projectArg) ||
						decoded === projectArg ||
						d.name === projectArg
					) {
						resolvedDir = path.join(piBase, d.name);
						sessionFormat = "pi";
						break;
					}
				}
			} catch {
				/* ok */
			}
		}
	}

	// Fall back to Claude/agent path
	if (!resolvedDir) {
		const claudeBase = getClaudeSessionsBasePath(overridePath);
		const claudeDir = path.join(claudeBase, projectArg);
		if (fs.existsSync(claudeDir)) {
			resolvedDir = claudeDir;
			sessionFormat = "claude";
		}
	}

	if (!resolvedDir) {
		output(
			{ error: `Project not found: ${projectArg}`, available_projects: [] },
			raw,
		);
		return;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const messages: any[] = [];
	const sessionFiles = fs
		.readdirSync(resolvedDir)
		.filter((f) => f.endsWith(".jsonl"));
	const limit = options.limit ?? null;

	for (const file of sessionFiles) {
		if (options.sessionId && !file.includes(options.sessionId)) continue;
		const filePath = path.join(resolvedDir, file);

		if (sessionFormat === "pi" || isPiSessionFile(filePath)) {
			// Pi format: entries wrapped in {type:"message", message:{...}}
			try {
				const lines = fs
					.readFileSync(filePath, "utf-8")
					.split("\n")
					.filter(Boolean);
				for (const line of lines) {
					try {
						const entry = JSON.parse(line) as PiSessionEntry;
						if (entry.type === "message" && entry.message) {
							messages.push(entry.message);
							if (limit && messages.length >= limit) break;
						}
					} catch {
						/* skip malformed */
					}
				}
			} catch {
				/* ok */
			}
		} else {
			// Claude format: each line is a raw message object
			try {
				const lines = fs
					.readFileSync(filePath, "utf-8")
					.split("\n")
					.filter(Boolean);
				for (const line of lines) {
					try {
						const msg = JSON.parse(line);
						messages.push(msg);
						if (limit && messages.length >= limit) break;
					} catch {
						/* skip malformed */
					}
				}
			} catch {
				/* ok */
			}
		}
		if (limit && messages.length >= limit) break;
	}

	output(
		{
			project: projectArg,
			source: sessionFormat,
			messages,
			count: messages.length,
		},
		raw,
	);
}

export async function cmdProfileSample(
	overridePath: string | null | undefined,
	options: ProfileSampleOptions,
	raw: boolean,
): Promise<void> {
	const harness = options.harness ?? null;
	const isPiHarness = harness === "pi";
	const limit = options.limit ?? 150;
	const maxChars = options.maxChars ?? 500;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const samples: any[] = [];

	// ── Pi sessions ──────────────────────────────────────────────────────────
	const piBase = getPiSessionsBasePath();
	if (fs.existsSync(piBase)) {
		try {
			const projects = fs
				.readdirSync(piBase, { withFileTypes: true })
				.filter((e) => e.isDirectory());

			outer_pi: for (const project of projects) {
				const projectDir = path.join(piBase, project.name);
				const sessionFiles = fs
					.readdirSync(projectDir)
					.filter((f) => f.endsWith(".jsonl"));
				let perProject = 0;
				for (const file of sessionFiles) {
					const entries = readPiSessionMessages(path.join(projectDir, file));
					for (const entry of entries) {
						if (entry.message?.role === "user") {
							const text = extractPiMessageText(entry.message.content).slice(
								0,
								maxChars,
							);
							if (text.length > 20) {
								samples.push({
									project: decodePiProjectDir(project.name),
									text,
									source: "pi",
								});
								perProject++;
								if (
									options.maxPerProject &&
									perProject >= options.maxPerProject
								)
									break;
								if (samples.length >= limit) break outer_pi;
							}
						}
					}
				}
			}
		} catch {
			/* ok */
		}
	}

	// ── Claude / agent sessions ───────────────────────────────────────────────
	// Skip Claude scan when --harness pi and enough samples collected, but always
	// include Claude if an explicit --path override is given.
	const skipClaude = isPiHarness && !overridePath && samples.length >= limit;
	if (!skipClaude) {
		const claudeBase = getClaudeSessionsBasePath(overridePath);
		if (fs.existsSync(claudeBase)) {
			try {
				const projects = fs
					.readdirSync(claudeBase, { withFileTypes: true })
					.filter((e) => e.isDirectory());

				outer_claude: for (const project of projects) {
					const projectDir = path.join(claudeBase, project.name);
					const sessionFiles = fs
						.readdirSync(projectDir)
						.filter((f) => f.endsWith(".jsonl"));
					let perProject = 0;
					for (const file of sessionFiles) {
						try {
							const lines = fs
								.readFileSync(path.join(projectDir, file), "utf-8")
								.split("\n")
								.filter(Boolean);
							for (const line of lines) {
								try {
									const msg = JSON.parse(line);
									// Claude sessions: role "human"; some formats use type "human"
									if (msg.role === "human" || msg.type === "human") {
										const text = (msg.content || msg.message || "").slice(
											0,
											maxChars,
										);
										if (text.length > 20) {
											samples.push({
												project: project.name,
												text,
												source: "claude",
											});
											perProject++;
											if (
												options.maxPerProject &&
												perProject >= options.maxPerProject
											)
												break;
											if (samples.length >= limit) break outer_claude;
										}
									}
								} catch {
									/* ok */
								}
							}
						} catch {
							/* ok */
						}
					}
				}
			} catch {
				/* ok */
			}
		}
	}

	if (samples.length === 0) {
		output(
			{
				available: false,
				reason: "No user messages found in any session",
				samples: [],
				count: 0,
			},
			raw,
		);
		return;
	}

	output({ available: true, samples, count: samples.length }, raw);
}
