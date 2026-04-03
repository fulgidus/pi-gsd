/**
 * profile-pipeline.ts — Profile rendering pipeline (session scanning, message extraction).
 *
 * These commands are async and operate on Claude session history files.
 * Ported signatures from lib/profile-pipeline.cjs.
 */

import { gsdError, output } from "./core.js";

interface ProfileSampleOptions {
	limit?: number;
	maxPerProject?: number | null;
	maxChars?: number;
}

interface ExtractMessagesOptions {
	sessionId?: string | null;
	limit?: number | null;
}

interface ScanSessionsOptions {
	verbose?: boolean;
	json?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path") as typeof import("path");

function getSessionsBasePath(overridePath?: string | null): string {
	if (overridePath) return overridePath;
	const home = process.env["HOME"] ?? "";
	const agentProjects = path.join(home, ".agent", "projects");
	if (fs.existsSync(agentProjects)) return agentProjects;
	return path.join(home, ".claude", "projects");
}

export async function cmdScanSessions(
	overridePath: string | null | undefined,
	options: ScanSessionsOptions,
	raw: boolean,
): Promise<void> {
	const basePath = getSessionsBasePath(overridePath);
	if (!fs.existsSync(basePath)) {
		output(
			{
				available: false,
				reason: `Sessions directory not found: ${basePath}`,
				projects: [],
				count: 0,
			},
			raw,
		);
		return;
	}
	const projects: Array<{ name: string; sessions: number; path: string }> = [];
	try {
		const entries = fs
			.readdirSync(basePath, { withFileTypes: true })
			.filter((e) => e.isDirectory());
		for (const entry of entries) {
			const projectDir = path.join(basePath, entry.name);
			const sessionFiles = fs
				.readdirSync(projectDir)
				.filter((f) => f.endsWith(".jsonl") || f.endsWith(".json"));
			projects.push({
				name: entry.name,
				sessions: sessionFiles.length,
				path: projectDir,
			});
		}
	} catch (e) {
		output(
			{
				available: false,
				reason: (e as Error).message,
				projects: [],
				count: 0,
			},
			raw,
		);
		return;
	}
	output(
		{ available: true, base_path: basePath, projects, count: projects.length },
		raw,
	);
}

export async function cmdExtractMessages(
	projectArg: string,
	options: ExtractMessagesOptions,
	raw: boolean,
	overridePath?: string | null,
): Promise<void> {
	const basePath = getSessionsBasePath(overridePath);
	const projectDir = path.join(basePath, projectArg);
	if (!fs.existsSync(projectDir)) {
		output(
			{ error: `Project not found: ${projectArg}`, available_projects: [] },
			raw,
		);
		return;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const messages: any[] = [];
	const sessionFiles = fs
		.readdirSync(projectDir)
		.filter((f) => f.endsWith(".jsonl"));
	const limit = options.limit ?? null;
	for (const file of sessionFiles) {
		if (options.sessionId && !file.includes(options.sessionId)) continue;
		try {
			const lines = fs
				.readFileSync(path.join(projectDir, file), "utf-8")
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
		if (limit && messages.length >= limit) break;
	}
	output({ project: projectArg, messages, count: messages.length }, raw);
}

export async function cmdProfileSample(
	overridePath: string | null | undefined,
	options: ProfileSampleOptions,
	raw: boolean,
): Promise<void> {
	const basePath = getSessionsBasePath(overridePath);
	const limit = options.limit ?? 150,
		maxChars = options.maxChars ?? 500;
	if (!fs.existsSync(basePath)) {
		output(
			{
				available: false,
				reason: `Sessions directory not found: ${basePath}`,
				samples: [],
				count: 0,
			},
			raw,
		);
		return;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const samples: any[] = [];
	try {
		const projects = fs
			.readdirSync(basePath, { withFileTypes: true })
			.filter((e) => e.isDirectory());
		outer: for (const project of projects) {
			const projectDir = path.join(basePath, project.name);
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
							if (msg.role === "human" || msg.type === "human") {
								const text = (msg.content || msg.message || "").slice(
									0,
									maxChars,
								);
								if (text.length > 20) {
									samples.push({ project: project.name, text });
									perProject++;
									if (
										options.maxPerProject &&
										perProject >= options.maxPerProject
									)
										break;
									if (samples.length >= limit) break outer;
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
	output({ available: true, samples, count: samples.length }, raw);
}
