/**
 * state.ts - STATE.md operations and progression engine.
 *
 * Ported from lib/state.cjs. All command signatures preserved.
 */

import fs from "fs";
import path from "path";
import {
	comparePhaseNum,
	escapeRegex,
	getMilestoneInfo,
	getMilestonePhaseFilter,
	gsdError,
	loadConfig,
	normalizeMd,
	output,
	planningDir,
	planningPaths,
} from "./core.js";
import { extractFrontmatter, reconstructFrontmatter } from "./frontmatter.js";
import { validateFieldName, validatePath } from "./security.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatePath(cwd: string): string {
	return planningPaths(cwd).state;
}

export function stateExtractField(
	content: string,
	fieldName: string,
): string | null {
	const escaped = escapeRegex(fieldName);
	const boldMatch = content.match(
		new RegExp(`\\*\\*${escaped}:\\*\\*\\s*(.+)`, "i"),
	);
	if (boldMatch) return boldMatch[1].trim();
	const plainMatch = content.match(new RegExp(`^${escaped}:\\s*(.+)`, "im"));
	return plainMatch ? plainMatch[1].trim() : null;
}

export function stateReplaceField(
	content: string,
	fieldName: string,
	newValue: string,
): string | null {
	const escaped = escapeRegex(fieldName);
	const boldPattern = new RegExp(`(\\*\\*${escaped}:\\*\\*\\s*)(.*)`, "i");
	if (boldPattern.test(content)) {
		return content.replace(
			boldPattern,
			(_match, prefix) => `${prefix}${newValue}`,
		);
	}
	const plainPattern = new RegExp(`(^${escaped}:\\s*)(.*)`, "im");
	if (plainPattern.test(content)) {
		return content.replace(
			plainPattern,
			(_match, prefix) => `${prefix}${newValue}`,
		);
	}
	return null;
}

export function stateReplaceFieldWithFallback(
	content: string,
	primary: string,
	fallback: string | null,
	value: string,
): string {
	const r1 = stateReplaceField(content, primary, value);
	if (r1) return r1;
	if (fallback) {
		const r2 = stateReplaceField(content, fallback, value);
		if (r2) return r2;
	}
	return content;
}

function updateCurrentPositionFields(
	content: string,
	fields: { status?: string; lastActivity?: string; plan?: string },
): string {
	const posPattern = /(##\s*Current Position\s*\n)([\s\S]*?)(?=\n##|$)/i;
	const posMatch = content.match(posPattern);
	if (!posMatch) return content;

	let posBody = posMatch[2];
	if (fields.status && /^Status:/m.test(posBody)) {
		posBody = posBody.replace(/^Status:.*$/m, `Status: ${fields.status}`);
	}
	if (fields.lastActivity && /^Last activity:/im.test(posBody)) {
		posBody = posBody.replace(
			/^Last activity:.*$/im,
			`Last activity: ${fields.lastActivity}`,
		);
	}
	if (fields.plan && /^Plan:/m.test(posBody)) {
		posBody = posBody.replace(/^Plan:.*$/m, `Plan: ${fields.plan}`);
	}
	return content.replace(posPattern, `${posMatch[1]}${posBody}`);
}

function readTextArgOrFile(
	cwd: string,
	value: string | null,
	filePath: string | null,
	label: string,
): string {
	if (!filePath) return value ?? "";
	const pathCheck = validatePath(filePath, cwd, { allowAbsolute: true });
	if (!pathCheck.safe)
		throw new Error(`${label} path rejected: ${pathCheck.error}`);
	try {
		return fs.readFileSync(pathCheck.resolved, "utf-8").trimEnd();
	} catch {
		throw new Error(`${label} file not found: ${filePath}`);
	}
}

// ─── Frontmatter sync ─────────────────────────────────────────────────────────

export function stripFrontmatter(content: string): string {
	let result = content;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const stripped = result.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\s*/, "");
		if (stripped === result) break;
		result = stripped;
	}
	return result;
}

function buildStateFrontmatter(
	bodyContent: string,
	cwd?: string,
): import("./frontmatter.js").FrontmatterObject {
	const currentPhase = stateExtractField(bodyContent, "Current Phase");
	const currentPhaseName = stateExtractField(bodyContent, "Current Phase Name");
	const currentPlan = stateExtractField(bodyContent, "Current Plan");
	const totalPhasesRaw = stateExtractField(bodyContent, "Total Phases");
	const totalPlansRaw = stateExtractField(bodyContent, "Total Plans in Phase");
	const status = stateExtractField(bodyContent, "Status");
	const progressRaw = stateExtractField(bodyContent, "Progress");
	const lastActivity = stateExtractField(bodyContent, "Last Activity");
	const stoppedAt =
		stateExtractField(bodyContent, "Stopped At") ||
		stateExtractField(bodyContent, "Stopped at");
	const pausedAt = stateExtractField(bodyContent, "Paused At");

	let milestone: string | null = null;
	let milestoneName: string | null = null;
	if (cwd) {
		try {
			const info = getMilestoneInfo(cwd);
			milestone = info.version;
			milestoneName = info.name;
		} catch {
			/* ok */
		}
	}

	let totalPhases: number | null = totalPhasesRaw
		? parseInt(totalPhasesRaw, 10)
		: null;
	let completedPhases: number | null = null;
	let totalPlans: number | null = totalPlansRaw
		? parseInt(totalPlansRaw, 10)
		: null;
	let completedPlans: number | null = null;

	if (cwd) {
		try {
			const phasesDir = planningPaths(cwd).phases;
			if (fs.existsSync(phasesDir)) {
				const isDirInMilestone = getMilestonePhaseFilter(cwd);
				const phaseDirs = fs
					.readdirSync(phasesDir, { withFileTypes: true })
					.filter((e) => e.isDirectory())
					.map((e) => e.name)
					.filter(isDirInMilestone);
				let diskTotalPlans = 0,
					diskTotalSummaries = 0,
					diskCompletedPhases = 0;
				for (const dir of phaseDirs) {
					const files = fs.readdirSync(path.join(phasesDir, dir));
					const plans = files.filter((f) => f.match(/-PLAN\.md$/i)).length;
					const summaries = files.filter((f) =>
						f.match(/-SUMMARY\.md$/i),
					).length;
					diskTotalPlans += plans;
					diskTotalSummaries += summaries;
					if (plans > 0 && summaries >= plans) diskCompletedPhases++;
				}
				totalPhases =
					isDirInMilestone.phaseCount > 0
						? Math.max(phaseDirs.length, isDirInMilestone.phaseCount)
						: phaseDirs.length;
				completedPhases = diskCompletedPhases;
				totalPlans = diskTotalPlans;
				completedPlans = diskTotalSummaries;
			}
		} catch {
			/* ok */
		}
	}

	let progressPercent: number | null = null;
	if (progressRaw) {
		const pctMatch = progressRaw.match(/(\d+)%/);
		if (pctMatch) progressPercent = parseInt(pctMatch[1], 10);
	}

	let normalizedStatus = status ?? "unknown";
	const statusLower = (status ?? "").toLowerCase();
	if (
		statusLower.includes("paused") ||
		statusLower.includes("stopped") ||
		pausedAt
	) {
		normalizedStatus = "paused";
	} else if (
		statusLower.includes("executing") ||
		statusLower.includes("in progress")
	) {
		normalizedStatus = "executing";
	} else if (
		statusLower.includes("planning") ||
		statusLower.includes("ready to plan")
	) {
		normalizedStatus = "planning";
	} else if (statusLower.includes("discussing")) {
		normalizedStatus = "discussing";
	} else if (statusLower.includes("verif")) {
		normalizedStatus = "verifying";
	} else if (statusLower.includes("complete") || statusLower.includes("done")) {
		normalizedStatus = "completed";
	} else if (statusLower.includes("ready to execute")) {
		normalizedStatus = "executing";
	}

	const fm: import("./frontmatter.js").FrontmatterObject = { gsd_state_version: "1.0" };
	if (milestone) fm.milestone = milestone;
	if (milestoneName) fm.milestone_name = milestoneName;
	if (currentPhase) fm.current_phase = currentPhase;
	if (currentPhaseName) fm.current_phase_name = currentPhaseName;
	if (currentPlan) fm.current_plan = currentPlan;
	fm.status = normalizedStatus;
	if (stoppedAt) fm.stopped_at = stoppedAt;
	if (pausedAt) fm.paused_at = pausedAt;
	fm.last_updated = new Date().toISOString();
	if (lastActivity) fm.last_activity = lastActivity;

	const progress: Record<string, number> = {};
	if (totalPhases !== null) progress.total_phases = totalPhases;
	if (completedPhases !== null) progress.completed_phases = completedPhases;
	if (totalPlans !== null) progress.total_plans = totalPlans;
	if (completedPlans !== null) progress.completed_plans = completedPlans;
	if (progressPercent !== null) progress.percent = progressPercent;
	if (Object.keys(progress).length > 0) fm.progress = progress;

	return fm;
}

function syncStateFrontmatter(content: string, cwd?: string): string {
	const existingFm = extractFrontmatter(content);
	const body = stripFrontmatter(content);
	const derivedFm = buildStateFrontmatter(body, cwd);
	if (
		derivedFm.status === "unknown" &&
		existingFm.status &&
		existingFm.status !== "unknown"
	) {
		derivedFm.status = existingFm.status;
	}
	const yamlStr = reconstructFrontmatter(derivedFm);
	return `---\n${yamlStr}\n---\n\n${body}`;
}

export function writeStateMd(
	statePath: string,
	content: string,
	cwd?: string,
): void {
	const synced = syncStateFrontmatter(content, cwd);
	const lockPath = statePath + ".lock";
	const maxRetries = 10;
	const retryDelay = 200;

	for (let i = 0; i < maxRetries; i++) {
		try {
			const fd = fs.openSync(
				lockPath,
				fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
			);
			fs.writeSync(fd, String(process.pid));
			fs.closeSync(fd);
			break;
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code === "EEXIST") {
				try {
					const stat = fs.statSync(lockPath);
					if (Date.now() - stat.mtimeMs > 10000) {
						fs.unlinkSync(lockPath);
						continue;
					}
				} catch {
					continue;
				}
				if (i === maxRetries - 1) {
					try {
						fs.unlinkSync(lockPath);
					} catch {
						/* ok */
					}
					break;
				}
				const start = Date.now();
				const jitter = Math.floor(Math.random() * 50);
				while (Date.now() - start < retryDelay + jitter) {
					/* spin */
				}
				continue;
			}
			break;
		}
	}

	try {
		fs.writeFileSync(statePath, normalizeMd(synced), "utf-8");
	} finally {
		try {
			fs.unlinkSync(lockPath);
		} catch {
			/* ok */
		}
	}
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function cmdStateLoad(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const planDir = planningPaths(cwd).planning;
	let stateRaw = "";
	try {
		stateRaw = fs.readFileSync(path.join(planDir, "STATE.md"), "utf-8");
	} catch {
		/* ok */
	}
	const configExists = fs.existsSync(path.join(planDir, "config.json"));
	const roadmapExists = fs.existsSync(path.join(planDir, "ROADMAP.md"));
	const stateExists = stateRaw.length > 0;

	if (raw) {
		const c = config;
		const lines = [
			`model_profile=${c.model_profile}`,
			`commit_docs=${c.commit_docs}`,
			`branching_strategy=${c.branching_strategy}`,
			`phase_branch_template=${c.phase_branch_template}`,
			`milestone_branch_template=${c.milestone_branch_template}`,
			`parallelization=${c.parallelization}`,
			`research=${c.research}`,
			`plan_checker=${c.plan_checker}`,
			`verifier=${c.verifier}`,
			`config_exists=${configExists}`,
			`roadmap_exists=${roadmapExists}`,
			`state_exists=${stateExists}`,
		];
		process.stdout.write(lines.join("\n"));
		process.exit(0);
	}

	output({
		config,
		state_raw: stateRaw,
		state_exists: stateExists,
		roadmap_exists: roadmapExists,
		config_exists: configExists,
	});
}

export function cmdStateGet(
	cwd: string,
	section: string | undefined,
	raw: boolean,
): void {
	const statePath = planningPaths(cwd).state;
	try {
		const content = fs.readFileSync(statePath, "utf-8");
		if (!section) {
			output({ content }, raw, content);
			return;
		}
		const esc = escapeRegex(section);
		const boldMatch = content.match(
			new RegExp(`\\*\\*${esc}:\\*\\*\\s*(.*)`, "i"),
		);
		if (boldMatch) {
			output({ [section]: boldMatch[1].trim() }, raw, boldMatch[1].trim());
			return;
		}
		const plainMatch = content.match(new RegExp(`^${esc}:\\s*(.*)`, "im"));
		if (plainMatch) {
			output({ [section]: plainMatch[1].trim() }, raw, plainMatch[1].trim());
			return;
		}
		const sectionMatch = content.match(
			new RegExp(`##\\s*${esc}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, "i"),
		);
		if (sectionMatch) {
			output(
				{ [section]: sectionMatch[1].trim() },
				raw,
				sectionMatch[1].trim(),
			);
			return;
		}
		output({ error: `Section or field "${section}" not found` }, raw, "");
	} catch {
		gsdError("STATE.md not found");
	}
}

export function cmdStatePatch(
	cwd: string,
	patches: Record<string, string>,
	raw: boolean,
): void {
	for (const field of Object.keys(patches)) {
		const check = validateFieldName(field);
		if (!check.valid) gsdError(`state patch: ${check.error}`);
	}
	const statePath = planningPaths(cwd).state;
	try {
		let content = fs.readFileSync(statePath, "utf-8");
		const results: { updated: string[]; failed: string[] } = {
			updated: [],
			failed: [],
		};
		for (const [field, value] of Object.entries(patches)) {
			const esc = escapeRegex(field);
			const bold = new RegExp(`(\\*\\*${esc}:\\*\\*\\s*)(.*)`, "i");
			const plain = new RegExp(`(^${esc}:\\s*)(.*)`, "im");
			if (bold.test(content)) {
				content = content.replace(bold, (_m, p) => `${p}${value}`);
				results.updated.push(field);
			} else if (plain.test(content)) {
				content = content.replace(plain, (_m, p) => `${p}${value}`);
				results.updated.push(field);
			} else {
				results.failed.push(field);
			}
		}
		if (results.updated.length > 0) writeStateMd(statePath, content, cwd);
		output(results, raw, results.updated.length > 0 ? "true" : "false");
	} catch {
		gsdError("STATE.md not found");
	}
}

export function cmdStateUpdate(
	cwd: string,
	field: string | undefined,
	value: string | undefined,
): void {
	if (!field || value === undefined)
		gsdError("field and value required for state update");
	const check = validateFieldName(field);
	if (!check.valid) gsdError(`state update: ${check.error}`);
	const statePath = planningPaths(cwd).state;
	try {
		let content = fs.readFileSync(statePath, "utf-8");
		const esc = escapeRegex(field);
		const bold = new RegExp(`(\\*\\*${esc}:\\*\\*\\s*)(.*)`, "i");
		const plain = new RegExp(`(^${esc}:\\s*)(.*)`, "im");
		if (bold.test(content)) {
			content = content.replace(bold, (_m, p) => `${p}${value}`);
			writeStateMd(statePath, content, cwd);
			output({ updated: true });
		} else if (plain.test(content)) {
			content = content.replace(plain, (_m, p) => `${p}${value}`);
			writeStateMd(statePath, content, cwd);
			output({ updated: true });
		} else {
			output({
				updated: false,
				reason: `Field "${field}" not found in STATE.md`,
			});
		}
	} catch {
		output({ updated: false, reason: "STATE.md not found" });
	}
}

export function cmdStateAdvancePlan(cwd: string, raw: boolean): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const today = new Date().toISOString().split("T")[0];

	const legacyPlan = stateExtractField(content, "Current Plan");
	const legacyTotal = stateExtractField(content, "Total Plans in Phase");
	const planField = stateExtractField(content, "Plan");

	let currentPlan: number,
		totalPlans: number,
		useCompoundFormat = false;

	if (legacyPlan && legacyTotal) {
		currentPlan = parseInt(legacyPlan, 10);
		totalPlans = parseInt(legacyTotal, 10);
	} else if (planField) {
		currentPlan = parseInt(planField, 10);
		const ofMatch = planField.match(/of\s+(\d+)/);
		totalPlans = ofMatch ? parseInt(ofMatch[1], 10) : NaN;
		useCompoundFormat = true;
	} else {
		output({ error: "Cannot parse plan fields from STATE.md" }, raw);
		return;
	}

	if (isNaN(currentPlan) || isNaN(totalPlans)) {
		output(
			{
				error:
					"Cannot parse Current Plan or Total Plans in Phase from STATE.md",
			},
			raw,
		);
		return;
	}

	if (currentPlan >= totalPlans) {
		content = stateReplaceFieldWithFallback(
			content,
			"Status",
			null,
			"Phase complete - ready for verification",
		);
		content = stateReplaceFieldWithFallback(
			content,
			"Last Activity",
			"Last activity",
			today,
		);
		content = updateCurrentPositionFields(content, {
			status: "Phase complete - ready for verification",
			lastActivity: today,
		});
		writeStateMd(statePath, content, cwd);
		output(
			{
				advanced: false,
				reason: "last_plan",
				current_plan: currentPlan,
				total_plans: totalPlans,
				status: "ready_for_verification",
			},
			raw,
			"false",
		);
	} else {
		const newPlan = currentPlan + 1;
		let planDisplayValue: string;
		if (useCompoundFormat && planField) {
			planDisplayValue = planField.replace(/^\d+/, String(newPlan));
			content = stateReplaceField(content, "Plan", planDisplayValue) ?? content;
		} else {
			planDisplayValue = `${newPlan} of ${totalPlans}`;
			content =
				stateReplaceField(content, "Current Plan", String(newPlan)) ?? content;
		}
		content = stateReplaceFieldWithFallback(
			content,
			"Status",
			null,
			"Ready to execute",
		);
		content = stateReplaceFieldWithFallback(
			content,
			"Last Activity",
			"Last activity",
			today,
		);
		content = updateCurrentPositionFields(content, {
			status: "Ready to execute",
			lastActivity: today,
			plan: planDisplayValue,
		});
		writeStateMd(statePath, content, cwd);
		output(
			{
				advanced: true,
				previous_plan: currentPlan,
				current_plan: newPlan,
				total_plans: totalPlans,
			},
			raw,
			"true",
		);
	}
}

export function cmdStateRecordMetric(
	cwd: string,
	options: {
		phase?: string | null;
		plan?: string | null;
		duration?: string | null;
		tasks?: string | null;
		files?: string | null;
	},
	raw: boolean,
): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	const { phase, plan, duration, tasks, files } = options;
	if (!phase || !plan || !duration) {
		output({ error: "phase, plan, and duration required" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const metricsPattern =
		/(##\s*Performance Metrics[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n)([\s\S]*?)(?=\n##|\n$|$)/i;
	const metricsMatch = content.match(metricsPattern);
	if (metricsMatch) {
		let tableBody = metricsMatch[2].trimEnd();
		const newRow = `| Phase ${phase} P${plan} | ${duration} | ${tasks ?? "-"} tasks | ${files ?? "-"} files |`;
		tableBody =
			!tableBody.trim() || tableBody.includes("None yet")
				? newRow
				: tableBody + "\n" + newRow;
		content = content.replace(
			metricsPattern,
			(_m, header) => `${header}${tableBody}\n`,
		);
		writeStateMd(statePath, content, cwd);
		output({ recorded: true, phase, plan, duration }, raw, "true");
	} else {
		output(
			{
				recorded: false,
				reason: "Performance Metrics section not found in STATE.md",
			},
			raw,
			"false",
		);
	}
}

export function cmdStateUpdateProgress(cwd: string, raw: boolean): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const phasesDir = planningPaths(cwd).phases;
	let totalPlans = 0,
		totalSummaries = 0;
	if (fs.existsSync(phasesDir)) {
		const isDirInMilestone = getMilestonePhaseFilter(cwd);
		const phaseDirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.filter(isDirInMilestone);
		for (const dir of phaseDirs) {
			const fls = fs.readdirSync(path.join(phasesDir, dir));
			totalPlans += fls.filter((f) => f.match(/-PLAN\.md$/i)).length;
			totalSummaries += fls.filter((f) => f.match(/-SUMMARY\.md$/i)).length;
		}
	}
	const percent =
		totalPlans > 0
			? Math.min(100, Math.round((totalSummaries / totalPlans) * 100))
			: 0;
	const barWidth = 10;
	const filled = Math.round((percent / 100) * barWidth);
	const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
	const progressStr = `[${bar}] ${percent}%`;
	const boldPat = /(\*\*Progress:\*\*\s*).*/i;
	const plainPat = /^(Progress:\s*).*/im;
	if (boldPat.test(content)) {
		content = content.replace(boldPat, (_m, p) => `${p}${progressStr}`);
		writeStateMd(statePath, content, cwd);
		output(
			{
				updated: true,
				percent,
				completed: totalSummaries,
				total: totalPlans,
				bar: progressStr,
			},
			raw,
			progressStr,
		);
	} else if (plainPat.test(content)) {
		content = content.replace(plainPat, (_m, p) => `${p}${progressStr}`);
		writeStateMd(statePath, content, cwd);
		output(
			{
				updated: true,
				percent,
				completed: totalSummaries,
				total: totalPlans,
				bar: progressStr,
			},
			raw,
			progressStr,
		);
	} else {
		output(
			{ updated: false, reason: "Progress field not found in STATE.md" },
			raw,
			"false",
		);
	}
}

export function cmdStateAddDecision(
	cwd: string,
	options: {
		phase?: string | null;
		summary?: string | null;
		summary_file?: string | null;
		rationale?: string | null;
		rationale_file?: string | null;
	},
	raw: boolean,
): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	const { phase, summary, summary_file, rationale, rationale_file } = options;
	let summaryText: string | null = null,
		rationaleText = "";
	try {
		summaryText = readTextArgOrFile(
			cwd,
			summary ?? null,
			summary_file ?? null,
			"summary",
		);
		rationaleText = readTextArgOrFile(
			cwd,
			rationale ?? "",
			rationale_file ?? null,
			"rationale",
		);
	} catch (err) {
		output({ added: false, reason: (err as Error).message }, raw, "false");
		return;
	}
	if (!summaryText) {
		output({ error: "summary required" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const entry = `- [Phase ${phase ?? "?"}]: ${summaryText}${rationaleText ? ` - ${rationaleText}` : ""}`;
	const sectionPattern =
		/(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
	const match = content.match(sectionPattern);
	if (match) {
		let body = match[2]
			.replace(/None yet\.?\s*\n?/gi, "")
			.replace(/No decisions yet\.?\s*\n?/gi, "");
		body = body.trimEnd() + "\n" + entry + "\n";
		content = content.replace(
			sectionPattern,
			(_m, header) => `${header}${body}`,
		);
		writeStateMd(statePath, content, cwd);
		output({ added: true, decision: entry }, raw, "true");
	} else {
		output(
			{ added: false, reason: "Decisions section not found in STATE.md" },
			raw,
			"false",
		);
	}
}

export function cmdStateAddBlocker(
	cwd: string,
	options: { text?: string | null; text_file?: string | null } | string,
	raw: boolean,
): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	const blockerOptions =
		typeof options === "object" && options !== null
			? options
			: { text: options };
	let blockerText: string | null = null;
	try {
		blockerText = readTextArgOrFile(
			cwd,
			blockerOptions.text ?? null,
			blockerOptions.text_file ?? null,
			"blocker",
		);
	} catch (err) {
		output({ added: false, reason: (err as Error).message }, raw, "false");
		return;
	}
	if (!blockerText) {
		output({ error: "text required" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const entry = `- ${blockerText}`;
	const sectionPattern =
		/(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
	const match = content.match(sectionPattern);
	if (match) {
		let body = match[2]
			.replace(/None\.?\s*\n?/gi, "")
			.replace(/None yet\.?\s*\n?/gi, "");
		body = body.trimEnd() + "\n" + entry + "\n";
		content = content.replace(
			sectionPattern,
			(_m, header) => `${header}${body}`,
		);
		writeStateMd(statePath, content, cwd);
		output({ added: true, blocker: blockerText }, raw, "true");
	} else {
		output(
			{ added: false, reason: "Blockers section not found in STATE.md" },
			raw,
			"false",
		);
	}
}

export function cmdStateResolveBlocker(
	cwd: string,
	text: string | null,
	raw: boolean,
): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	if (!text) {
		output({ error: "text required" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const sectionPattern =
		/(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
	const match = content.match(sectionPattern);
	if (match) {
		const lines = match[2].split("\n");
		const filtered = lines.filter(
			(l) =>
				!l.startsWith("- ") || !l.toLowerCase().includes(text.toLowerCase()),
		);
		let newBody = filtered.join("\n");
		if (!newBody.trim() || !newBody.includes("- ")) newBody = "None\n";
		content = content.replace(
			sectionPattern,
			(_m, header) => `${header}${newBody}`,
		);
		writeStateMd(statePath, content, cwd);
		output({ resolved: true, blocker: text }, raw, "true");
	} else {
		output(
			{ resolved: false, reason: "Blockers section not found in STATE.md" },
			raw,
			"false",
		);
	}
}

export function cmdStateRecordSession(
	cwd: string,
	options: { stopped_at?: string | null; resume_file?: string | null },
	raw: boolean,
): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const now = new Date().toISOString();
	const updated: string[] = [];
	const tryReplace = (field: string): void => {
		const r = stateReplaceField(content, field, now);
		if (r) {
			content = r;
			updated.push(field);
		}
	};
	tryReplace("Last session");
	tryReplace("Last Date");
	if (options.stopped_at) {
		const r =
			stateReplaceField(content, "Stopped At", options.stopped_at) ??
			stateReplaceField(content, "Stopped at", options.stopped_at);
		if (r) {
			content = r;
			updated.push("Stopped At");
		}
	}
	const resumeFile = options.resume_file ?? "None";
	const r =
		stateReplaceField(content, "Resume File", resumeFile) ??
		stateReplaceField(content, "Resume file", resumeFile);
	if (r) {
		content = r;
		updated.push("Resume File");
	}
	if (updated.length > 0) {
		writeStateMd(statePath, content, cwd);
		output({ recorded: true, updated }, raw, "true");
	} else {
		output(
			{ recorded: false, reason: "No session fields found in STATE.md" },
			raw,
			"false",
		);
	}
}

export function cmdStateSnapshot(cwd: string, raw: boolean): void {
	const statePath = getStatePath(cwd);
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	const content = fs.readFileSync(statePath, "utf-8");
	const get = (f: string) => stateExtractField(content, f);

	const decisions: Array<{
		phase: string;
		summary: string;
		rationale: string;
	}> = [];
	const decisionsMatch = content.match(
		/##\s*Decisions Made[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n([\s\S]*?)(?=\n##|\n$|$)/i,
	);
	if (decisionsMatch) {
		for (const row of decisionsMatch[1]
			.trim()
			.split("\n")
			.filter((r) => r.includes("|"))) {
			const cells = row
				.split("|")
				.map((c) => c.trim())
				.filter(Boolean);
			if (cells.length >= 3)
				decisions.push({
					phase: cells[0],
					summary: cells[1],
					rationale: cells[2],
				});
		}
	}

	const blockers: string[] = [];
	const blockersMatch = content.match(
		/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i,
	);
	if (blockersMatch) {
		for (const item of blockersMatch[1].match(/^-\s+(.+)$/gm) ?? []) {
			blockers.push(item.replace(/^-\s+/, "").trim());
		}
	}

	const session = {
		last_date: null as string | null,
		stopped_at: null as string | null,
		resume_file: null as string | null,
	};
	const sessionMatch = content.match(/##\s*Session\s*\n([\s\S]*?)(?=\n##|$)/i);
	if (sessionMatch) {
		const s = sessionMatch[1];
		session.last_date =
			(s.match(/\*\*Last Date:\*\*\s*(.+)/i) ??
				s.match(/^Last Date:\s*(.+)/im))?.[1]?.trim() ?? null;
		session.stopped_at =
			(s.match(/\*\*Stopped At:\*\*\s*(.+)/i) ??
				s.match(/^Stopped At:\s*(.+)/im))?.[1]?.trim() ?? null;
		session.resume_file =
			(s.match(/\*\*Resume File:\*\*\s*(.+)/i) ??
				s.match(/^Resume File:\s*(.+)/im))?.[1]?.trim() ?? null;
	}

	output(
		{
			current_phase: get("Current Phase"),
			current_phase_name: get("Current Phase Name"),
			total_phases: get("Total Phases")
				? parseInt(get("Total Phases")!, 10)
				: null,
			current_plan: get("Current Plan"),
			total_plans_in_phase: get("Total Plans in Phase")
				? parseInt(get("Total Plans in Phase")!, 10)
				: null,
			status: get("Status"),
			progress_percent: get("Progress")
				? parseInt(get("Progress")!.replace("%", ""), 10)
				: null,
			last_activity: get("Last Activity"),
			last_activity_desc: get("Last Activity Description"),
			decisions,
			blockers,
			paused_at: get("Paused At"),
			session,
		},
		raw,
	);
}

export function cmdStateJson(cwd: string, raw: boolean): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw, "STATE.md not found");
		return;
	}
	const content = fs.readFileSync(statePath, "utf-8");
	const fm = extractFrontmatter(content);
	if (!fm || Object.keys(fm).length === 0) {
		const body = stripFrontmatter(content);
		const built = buildStateFrontmatter(body, cwd);
		output(built, raw, JSON.stringify(built, null, 2));
		return;
	}
	output(fm, raw, JSON.stringify(fm, null, 2));
}

export function cmdStateBeginPhase(
	cwd: string,
	phaseNumber: string | null,
	phaseName: string | null,
	planCount: number | null,
	raw: boolean,
): void {
	const statePath = planningPaths(cwd).state;
	if (!fs.existsSync(statePath)) {
		output({ error: "STATE.md not found" }, raw);
		return;
	}
	let content = fs.readFileSync(statePath, "utf-8");
	const today = new Date().toISOString().split("T")[0];
	const updated: string[] = [];

	const trySet = (field: string, value: string) => {
		const r = stateReplaceField(content, field, value);
		if (r) {
			content = r;
			updated.push(field);
		}
	};

	trySet("Status", `Executing Phase ${phaseNumber}`);
	trySet("Last Activity", today);
	trySet("Last Activity Description", `Phase ${phaseNumber} execution started`);
	trySet("Current Phase", String(phaseNumber));
	if (phaseName) trySet("Current Phase Name", phaseName);
	trySet("Current Plan", "1");
	if (planCount) trySet("Total Plans in Phase", String(planCount));

	const focusLabel = phaseName
		? `Phase ${phaseNumber} - ${phaseName}`
		: `Phase ${phaseNumber}`;
	const focusPattern = /(\*\*Current focus:\*\*\s*).*/i;
	if (focusPattern.test(content)) {
		content = content.replace(focusPattern, (_m, p) => `${p}${focusLabel}`);
		updated.push("Current focus");
	}

	const positionPattern = /(##\s*Current Position\s*\n)([\s\S]*?)(?=\n##|$)/i;
	const positionMatch = content.match(positionPattern);
	if (positionMatch) {
		const header = positionMatch[1];
		let posBody = positionMatch[2];
		const newPhase = `Phase: ${phaseNumber}${phaseName ? ` (${phaseName})` : ""} - EXECUTING`;
		posBody = /^Phase:/m.test(posBody)
			? posBody.replace(/^Phase:.*$/m, newPhase)
			: newPhase + "\n" + posBody;
		const newPlan = `Plan: 1 of ${planCount ?? "?"}`;
		posBody = /^Plan:/m.test(posBody)
			? posBody.replace(/^Plan:.*$/m, newPlan)
			: posBody.replace(/^(Phase:.*$)/m, `$1\n${newPlan}`);
		if (/^Status:/m.test(posBody))
			posBody = posBody.replace(
				/^Status:.*$/m,
				`Status: Executing Phase ${phaseNumber}`,
			);
		if (/^Last activity:/im.test(posBody))
			posBody = posBody.replace(
				/^Last activity:.*$/im,
				`Last activity: ${today} -- Phase ${phaseNumber} execution started`,
			);
		content = content.replace(positionPattern, `${header}${posBody}`);
		updated.push("Current Position");
	}

	if (updated.length > 0) writeStateMd(statePath, content, cwd);
	output(
		{
			updated,
			phase: phaseNumber,
			phase_name: phaseName ?? null,
			plan_count: planCount ?? null,
		},
		raw,
		updated.length > 0 ? "true" : "false",
	);
}

export function cmdSignalWaiting(
	cwd: string,
	type: string | null,
	question: string | null,
	options: string | null,
	phase: string | null,
	raw: boolean,
): void {
	const gsdDir = fs.existsSync(path.join(cwd, ".gsd"))
		? path.join(cwd, ".gsd")
		: planningDir(cwd);
	const waitingPath = path.join(gsdDir, "WAITING.json");
	const signal = {
		status: "waiting",
		type: type ?? "decision_point",
		question: question ?? null,
		options: options ? options.split("|").map((o) => o.trim()) : [],
		since: new Date().toISOString(),
		phase: phase ?? null,
	};
	try {
		fs.mkdirSync(gsdDir, { recursive: true });
		fs.writeFileSync(waitingPath, JSON.stringify(signal, null, 2), "utf-8");
		output({ signaled: true, path: waitingPath }, raw, "true");
	} catch (e) {
		output({ signaled: false, error: (e as Error).message }, raw, "false");
	}
}

export function cmdSignalResume(cwd: string, raw: boolean): void {
	const paths = [
		path.join(cwd, ".gsd", "WAITING.json"),
		path.join(planningDir(cwd), "WAITING.json"),
	];
	let removed = false;
	for (const p of paths) {
		if (fs.existsSync(p)) {
			try {
				fs.unlinkSync(p);
				removed = true;
			} catch {
				/* ok */
			}
		}
	}
	output({ resumed: true, removed }, raw, removed ? "true" : "false");
}

// ─── State reconciliation ────────────────────────────────────────────────────

/**
 * Internal reconcile: syncs STATE.md body fields with disk truth.
 * Returns reconciliation result without producing CLI output.
 * Safe to call from init functions before they gather context.
 */
export function reconcileState(cwd: string): {
	reconciled: boolean;
	changes: string[];
	phases_complete: number;
	phases_total: number;
	plans_complete: number;
	plans_total: number;
	percent: number;
} {
	const pp = planningPaths(cwd);
	if (!fs.existsSync(pp.state)) {
		return { reconciled: false, changes: [], phases_complete: 0, phases_total: 0, plans_complete: 0, plans_total: 0, percent: 0 };
	}
	if (!fs.existsSync(pp.phases)) {
		return { reconciled: false, changes: [], phases_complete: 0, phases_total: 0, plans_complete: 0, plans_total: 0, percent: 0 };
	}

	const isDirInMilestone = getMilestonePhaseFilter(cwd);
	const phaseDirs = fs
		.readdirSync(pp.phases, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.filter(isDirInMilestone)
		.sort();

	let totalPlans = 0;
	let totalSummaries = 0;
	let phasesComplete = 0;
	const phasesTotal = phaseDirs.length;
	const changes: string[] = [];
	const today = new Date().toISOString().split("T")[0];

	interface PhaseInfo {
		dir: string;
		dirPath: string;
		phaseNum: string;
		numVal: number;
		plans: number;
		summaries: number;
		hasContext: boolean;
		complete: boolean;
	}
	const phases: PhaseInfo[] = [];

	for (const dir of phaseDirs) {
		const dirPath = path.join(pp.phases, dir);
		const files = fs.readdirSync(dirPath);
		const plans = files.filter((f: string) => f.match(/-PLAN\.md$/i)).length;
		const summaries = files.filter((f: string) => f.match(/-SUMMARY\.md$/i)).length;
		const hasContext = files.some((f: string) => f.match(/CONTEXT\.md$/i));
		const phaseNum = dir.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? dir.split("-")[0];
		const complete = plans > 0 && summaries >= plans;

		totalPlans += plans;
		totalSummaries += summaries;
		if (complete) phasesComplete++;

		phases.push({ dir, dirPath, phaseNum, numVal: parseFloat(phaseNum), plans, summaries, hasContext, complete });
	}

	// Detect absorbed phases (0 plans, later phase complete)
	for (const phase of phases) {
		if (phase.plans > 0 || phase.complete) continue;
		const laterComplete = phases.some((p) => p.numVal > phase.numVal && p.complete);
		if (!laterComplete) continue;

		const padded = phase.phaseNum.replace(".", "-");
		const planFile = path.join(phase.dirPath, `${padded}-01-PLAN.md`);
		const summaryFile = path.join(phase.dirPath, `${padded}-01-SUMMARY.md`);

		if (!fs.existsSync(planFile)) {
			fs.writeFileSync(planFile, [
				"---", `plan: "${padded}-01"`, `phase: "${phase.phaseNum}"`,
				"status: complete", "absorbed: true", "---", "",
				`# Plan ${padded}-01 \u2014 [ABSORBED]`, "",
				"Phase absorbed into a later phase. All deliverables completed there.", "",
			].join("\n"), "utf-8");
		}
		if (!fs.existsSync(summaryFile)) {
			fs.writeFileSync(summaryFile, [
				"---", `plan: "${padded}-01"`, `phase: "${phase.phaseNum}"`,
				"status: complete", "absorbed: true", `completed_at: "${today}"`, "---", "",
				`# Summary ${padded}-01 \u2014 Phase ${phase.phaseNum} Absorbed`, "",
				"Phase deliverables completed as part of a later phase execution.", "",
			].join("\n"), "utf-8");
		}
		totalPlans++;
		totalSummaries++;
		phasesComplete++;
		phase.complete = true;
		changes.push(`Phase ${phase.phaseNum}: absorbed (0 plans, later phase complete) \u2014 created stubs`);
	}

	// Update ROADMAP.md to match disk truth
	if (fs.existsSync(pp.roadmap)) {
		let roadmap = fs.readFileSync(pp.roadmap, "utf-8");
		let changed = false;

		for (const phase of phases) {
			if (!phase.complete) continue;
			const esc = phase.phaseNum.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

			const cbRe = new RegExp(`(-\\s*\\[)[ ](\\]\\s*(?:\\*\\*)?\\s*Phase\\s+${esc}[^\\n]*)`, "i");
			if (cbRe.test(roadmap)) {
				roadmap = roadmap.replace(cbRe, `$1x$2`);
				changed = true;
				continue;
			}

			const tblRe = new RegExp(
				`(\\|\\s*${esc}\\.?\\s+[^|]*(?:\\|[^|]*)*\\|[^|]*)\\b(?:Pending|In Progress|Planning|Executing|Verifying|Discussed|Researched|Empty)\\b`,
				"i",
			);
			if (tblRe.test(roadmap)) {
				roadmap = roadmap.replace(tblRe, "$1Complete");
				changed = true;
			}
		}

		if (changed) {
			fs.writeFileSync(pp.roadmap, roadmap, "utf-8");
			changes.push("ROADMAP.md updated to match disk completion status");
		}
	}

	// Update STATE.md progress AND body text fields
	let stateContent = fs.readFileSync(pp.state, "utf-8");
	const percent = totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;
	const filled = Math.round((percent / 100) * 10);
	const progressStr = `${"\u2588".repeat(filled)}${"\u2591".repeat(10 - filled)}] ${percent}%`;
	const boldPat = /(\*\*Progress:\*\*\s*).*/i;
	const plainPat = /^(Progress:\s*).*/im;
	if (boldPat.test(stateContent)) {
		stateContent = stateContent.replace(boldPat, (_m, p) => `${p}[${progressStr}`);
	} else if (plainPat.test(stateContent)) {
		stateContent = stateContent.replace(plainPat, (_m, p) => `${p}[${progressStr}`);
	}

	// Reconcile Current Phase / Status / Plan body fields from disk truth
	const sortedPhases = [...phases].sort((a, b) => comparePhaseNum(a.phaseNum, b.phaseNum));
	const firstIncomplete = sortedPhases.find((p) => p.plans > 0 && p.summaries < p.plans);
	const firstUnplanned = sortedPhases.find((p) => p.plans === 0 && !p.complete);
	const allComplete = sortedPhases.length > 0 && sortedPhases.every((p) => p.complete);

	let diskCurrentPhase: typeof sortedPhases[0] | null = null;
	let diskStatus = "";
	let diskPlan = "";

	if (firstIncomplete) {
		diskCurrentPhase = firstIncomplete;
		const nextPlan = firstIncomplete.summaries + 1;
		diskStatus = `Executing Phase ${firstIncomplete.phaseNum}`;
		diskPlan = `${nextPlan} of ${firstIncomplete.plans}`;
	} else if (allComplete) {
		if (firstUnplanned) {
			diskCurrentPhase = firstUnplanned;
			diskStatus = "Ready to plan";
			diskPlan = "Not started";
		} else {
			const last = sortedPhases[sortedPhases.length - 1];
			diskCurrentPhase = last;
			diskStatus = "Milestone complete";
			diskPlan = `${last.plans} of ${last.plans}`;
		}
	} else {
		const nextNeedingWork = sortedPhases.find((p) => !p.complete);
		if (nextNeedingWork) {
			diskCurrentPhase = nextNeedingWork;
			if (nextNeedingWork.plans > 0) {
				diskStatus = "Ready to execute";
				diskPlan = `1 of ${nextNeedingWork.plans}`;
			} else {
				diskStatus = "Ready to plan";
				diskPlan = "Not started";
			}
		}
	}

	if (diskCurrentPhase) {
		const statePhaseRaw = stateExtractField(stateContent, "Current Phase");
		const stateStatusRaw = stateExtractField(stateContent, "Status");

		const statePhaseNum = statePhaseRaw?.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? null;
		const diskPhaseNum = diskCurrentPhase.phaseNum;

		const phaseMatches = statePhaseNum === diskPhaseNum;
		const statusNeedsUpdate = !phaseMatches || (
			stateStatusRaw &&
			!stateStatusRaw.toLowerCase().includes(diskStatus.toLowerCase().split(" ")[0])
		);

		if (!phaseMatches) {
			const phaseName = diskCurrentPhase.dir.replace(/^\d+(?:\.\d+)?-?/, "").replace(/-/g, " ");
			const phaseDisplay = phasesTotal > 0
				? `${diskPhaseNum} of ${phasesTotal}${phaseName ? ` (${phaseName})` : ""}`
				: diskPhaseNum;

			stateContent = stateReplaceFieldWithFallback(stateContent, "Current Phase", "Phase", phaseDisplay);
			if (phaseName) {
				stateContent = stateReplaceFieldWithFallback(stateContent, "Current Phase Name", null, phaseName);
			}
			changes.push(`Current Phase: ${statePhaseNum ?? "(unset)"} \u2192 ${diskPhaseNum}`);
		}

		if (statusNeedsUpdate) {
			stateContent = stateReplaceFieldWithFallback(stateContent, "Status", null, diskStatus);
			changes.push(`Status: ${stateStatusRaw ?? "(unset)"} \u2192 ${diskStatus}`);
		}

		const statePlanRaw = stateExtractField(stateContent, "Current Plan") ?? stateExtractField(stateContent, "Plan");
		if (statePlanRaw !== diskPlan) {
			stateContent = stateReplaceFieldWithFallback(stateContent, "Current Plan", "Plan", diskPlan);
			changes.push(`Plan: ${statePlanRaw ?? "(unset)"} \u2192 ${diskPlan}`);
		}

		const stateTotalPhases = stateExtractField(stateContent, "Total Phases");
		if (stateTotalPhases && parseInt(stateTotalPhases, 10) !== phasesTotal) {
			stateContent = stateReplaceField(stateContent, "Total Phases", String(phasesTotal)) ?? stateContent;
			changes.push(`Total Phases: ${stateTotalPhases} \u2192 ${phasesTotal}`);
		}

		stateContent = updateCurrentPositionFields(stateContent, {
			status: diskStatus,
			plan: diskPlan,
		});
	}

	writeStateMd(pp.state, stateContent, cwd);

	return {
		reconciled: true,
		changes,
		phases_complete: phasesComplete,
		phases_total: phasesTotal,
		plans_complete: totalSummaries,
		plans_total: totalPlans,
		percent,
	};
}

/**
 * Reconcile STATE.md with disk truth.
 * Scans all phase directories, counts plans/summaries, marks phases complete
 * when all plans have summaries. Updates progress counters in STATE.md.
 * Also reconciles body text fields (Current Phase, Status, Plan) from disk.
 *
 * Now delegates to reconcileState() for the actual work.
 */
export function cmdStateReconcile(cwd: string, raw: boolean): void {
	const pp = planningPaths(cwd);
	if (!fs.existsSync(pp.state)) {
		output({ reconciled: false, reason: "no STATE.md" }, raw, "false");
		return;
	}
	if (!fs.existsSync(pp.phases)) {
		output({ reconciled: false, reason: "no phases dir" }, raw, "false");
		return;
	}

	const result = reconcileState(cwd);

	output(
		result,
		raw,
		result.changes.length > 0
			? `Reconciled: ${result.changes.join("; ")}`
			: `State consistent (${result.phases_complete}/${result.phases_total} phases, ${result.plans_complete}/${result.plans_total} plans)`,
	);
}
