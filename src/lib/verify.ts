/**
 * verify.ts — Verification suite, consistency, and health validation.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
	checkAgentsInstalled,
	execGit,
	extractCurrentMilestone,
	findPhaseInternal,
	getMilestoneInfo,
	gsdError,
	loadConfig,
	MODEL_PROFILES,
	normalizePhaseName,
	output,
	planningDir,
	planningRoot,
	safeReadFile,
} from "./core.js";
import { extractFrontmatter, parseMustHavesBlock } from "./frontmatter.js";
import { PlanningConfigSchema } from "./schemas.js";
import { writeStateMd } from "./state.js";

// ─── Shared types ─────────────────────────────────────────────────────────────

/** A single health-check issue (error, warning, or info). */
interface HealthIssue {
	code: string;
	message: string;
	fix: string;
	repairable: boolean;
	/** Zod field path, e.g. "workflow.nyquist_validation" */
	field?: string;
	/** Human-readable description of the expected type/value */
	expected?: string;
	/** Actual value found in the file */
	actual?: unknown;
}

/** A repair action performed by --repair. */
interface HealthRepairAction {
	action: string;
	success: boolean;
	path?: string;
	error?: string;
}

/** An artifact entry parsed from must_haves.artifacts. */
interface ArtifactEntry {
	path?: string;
	min_lines?: number;
	contains?: string;
	exports?: string | string[];
}

/** A key-link entry parsed from must_haves.key_links. */
interface KeyLinkEntry {
	from?: string;
	to?: string;
	via?: string;
	pattern?: string;
}

/**
 * Retrieve a nested value from an unknown object by Zod issue path.
 * Returns undefined if any segment is missing or the container is not an object.
 */
function getNestedValue(obj: unknown, segments: (string | number)[]): unknown {
	let cur: unknown = obj;
	for (const key of segments) {
		if (cur == null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string | number, unknown>)[key];
	}
	return cur;
}

// ─── cmdVerifySummary ─────────────────────────────────────────────────────────

export function cmdVerifySummary(
	cwd: string,
	summaryPath: string | undefined,
	checkFileCount: number,
	raw: boolean,
): void {
	if (!summaryPath) gsdError("summary-path required");
	const fullPath = path.join(cwd, summaryPath!);
	const checkCount = checkFileCount || 2;
	if (!fs.existsSync(fullPath)) {
		output(
			{
				passed: false,
				checks: {
					summary_exists: false,
					files_created: { checked: 0, found: 0, missing: [] },
					commits_exist: false,
					self_check: "not_found",
				},
				errors: ["SUMMARY.md not found"],
			},
			raw,
			"failed",
		);
		return;
	}
	const content = fs.readFileSync(fullPath, "utf-8"),
		errors: string[] = [];
	const mentionedFiles = new Set<string>();
	for (const pattern of [
		/`([^`]+\.[a-zA-Z]+)`/g,
		/(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
	]) {
		let m: RegExpExecArray | null;
		while ((m = pattern.exec(content)) !== null) {
			if (m[1] && !m[1].startsWith("http") && m[1].includes("/"))
				mentionedFiles.add(m[1]);
		}
	}
	const filesToCheck = Array.from(mentionedFiles).slice(0, checkCount);
	const missing = filesToCheck.filter((f) => !fs.existsSync(path.join(cwd, f)));
	const hashes = content.match(/\b[0-9a-f]{7,40}\b/g) || [];
	let commitsExist = false;
	for (const hash of hashes.slice(0, 3)) {
		if (execGit(cwd, ["cat-file", "-t", hash]).stdout === "commit") {
			commitsExist = true;
			break;
		}
	}
	let selfCheck = "not_found";
	if (/##\s*(?:Self[- ]?Check|Verification|Quality Check)/i.test(content)) {
		const checkSection = content.slice(
			content.search(/##\s*(?:Self[- ]?Check|Verification|Quality Check)/i),
		);
		if (/(?:fail|✗|❌|incomplete|blocked)/i.test(checkSection))
			selfCheck = "failed";
		else if (/(?:all\s+)?(?:pass|✓|✅|complete|succeeded)/i.test(checkSection))
			selfCheck = "passed";
	}
	if (missing.length > 0) errors.push("Missing files: " + missing.join(", "));
	if (!commitsExist && hashes.length > 0)
		errors.push("Referenced commit hashes not found in git history");
	if (selfCheck === "failed")
		errors.push("Self-check section indicates failure");
	const passed = missing.length === 0 && selfCheck !== "failed";
	output(
		{
			passed,
			checks: {
				summary_exists: true,
				files_created: {
					checked: filesToCheck.length,
					found: filesToCheck.length - missing.length,
					missing,
				},
				commits_exist: commitsExist,
				self_check: selfCheck,
			},
			errors,
		},
		raw,
		passed ? "passed" : "failed",
	);
}

// ─── cmdVerifyPlanStructure ────────────────────────────────────────────────────

export function cmdVerifyPlanStructure(
	cwd: string,
	filePath: string | undefined,
	raw: boolean,
): void {
	if (!filePath) gsdError("file path required");
	const fullPath = path.isAbsolute(filePath!)
		? filePath!
		: path.join(cwd, filePath!);
	const content = safeReadFile(fullPath);
	if (!content) {
		output({ error: "File not found", path: filePath }, raw);
		return;
	}
	const fm = extractFrontmatter(content),
		errors: string[] = [],
		warnings: string[] = [];
	for (const field of [
		"phase",
		"plan",
		"type",
		"wave",
		"depends_on",
		"files_modified",
		"autonomous",
		"must_haves",
	]) {
		if (fm[field] === undefined)
			errors.push(`Missing required frontmatter field: ${field}`);
	}
	const taskPattern = /<task[^>]*>([\s\S]*?)<\/task>/g;
	const tasks: Array<{
		name: string;
		hasFiles: boolean;
		hasAction: boolean;
		hasVerify: boolean;
		hasDone: boolean;
	}> = [];
	let taskMatch: RegExpExecArray | null;
	while ((taskMatch = taskPattern.exec(content)) !== null) {
		const tc = taskMatch[1];
		const nameMatch = tc.match(/<name>([\s\S]*?)<\/name>/);
		const taskName = nameMatch ? nameMatch[1].trim() : "unnamed";
		const hasFiles = /<files>/.test(tc),
			hasAction = /<action>/.test(tc),
			hasVerify = /<verify>/.test(tc),
			hasDone = /<done>/.test(tc);
		if (!nameMatch) errors.push("Task missing <name> element");
		if (!hasAction) errors.push(`Task '${taskName}' missing <action>`);
		if (!hasVerify) warnings.push(`Task '${taskName}' missing <verify>`);
		if (!hasDone) warnings.push(`Task '${taskName}' missing <done>`);
		if (!hasFiles) warnings.push(`Task '${taskName}' missing <files>`);
		tasks.push({ name: taskName, hasFiles, hasAction, hasVerify, hasDone });
	}
	if (tasks.length === 0) warnings.push("No <task> elements found");
	if (
		fm.wave &&
		parseInt(String(fm.wave)) > 1 &&
		(!fm.depends_on ||
			(Array.isArray(fm.depends_on) && fm.depends_on.length === 0))
	)
		warnings.push("Wave > 1 but depends_on is empty");
	const hasCheckpoints = /<task\s+type=["']?checkpoint/.test(content);
	if (hasCheckpoints && fm.autonomous !== "false" && fm.autonomous !== false)
		errors.push("Has checkpoint tasks but autonomous is not false");
	output(
		{
			valid: errors.length === 0,
			errors,
			warnings,
			task_count: tasks.length,
			tasks,
			frontmatter_fields: Object.keys(fm),
		},
		raw,
		errors.length === 0 ? "valid" : "invalid",
	);
}

// ─── cmdVerifyPhaseCompleteness ────────────────────────────────────────────────

export function cmdVerifyPhaseCompleteness(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	if (!phase) gsdError("phase required");
	const phaseInfo = findPhaseInternal(cwd, phase!);
	if (!phaseInfo?.found) {
		output({ error: "Phase not found", phase }, raw);
		return;
	}
	const phaseDir = path.join(cwd, phaseInfo.directory);
	const errors: string[] = [],
		warnings: string[] = [];
	let files: string[];
	try {
		files = fs.readdirSync(phaseDir);
	} catch {
		output({ error: "Cannot read phase directory" }, raw);
		return;
	}
	const plans = files.filter((f) => f.match(/-PLAN\.md$/i));
	const summaries = files.filter((f) => f.match(/-SUMMARY\.md$/i));
	const planIds = new Set(plans.map((p) => p.replace(/-PLAN\.md$/i, "")));
	const summaryIds = new Set(
		summaries.map((s) => s.replace(/-SUMMARY\.md$/i, "")),
	);
	const incompletePlans = [...planIds].filter((id) => !summaryIds.has(id));
	const orphanSummaries = [...summaryIds].filter((id) => !planIds.has(id));
	if (incompletePlans.length > 0)
		errors.push(`Plans without summaries: ${incompletePlans.join(", ")}`);
	if (orphanSummaries.length > 0)
		warnings.push(`Summaries without plans: ${orphanSummaries.join(", ")}`);
	output(
		{
			complete: errors.length === 0,
			phase: phaseInfo.phase_number,
			plan_count: plans.length,
			summary_count: summaries.length,
			incomplete_plans: incompletePlans,
			orphan_summaries: orphanSummaries,
			errors,
			warnings,
		},
		raw,
		errors.length === 0 ? "complete" : "incomplete",
	);
}

// ─── cmdVerifyReferences ──────────────────────────────────────────────────────

export function cmdVerifyReferences(
	cwd: string,
	filePath: string | undefined,
	raw: boolean,
): void {
	if (!filePath) gsdError("file path required");
	const fullPath = path.isAbsolute(filePath!)
		? filePath!
		: path.join(cwd, filePath!);
	const content = safeReadFile(fullPath);
	if (!content) {
		output({ error: "File not found", path: filePath }, raw);
		return;
	}
	const found: string[] = [],
		missing: string[] = [];
	for (const ref of content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) || []) {
		const cleanRef = ref.slice(1);
		const resolved = cleanRef.startsWith("~/")
			? path.join(process.env["HOME"] ?? "", cleanRef.slice(2))
			: path.join(cwd, cleanRef);
		(fs.existsSync(resolved) ? found : missing).push(cleanRef);
	}
	for (const ref of content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) || []) {
		const cleanRef = ref.slice(1, -1);
		if (
			cleanRef.startsWith("http") ||
			cleanRef.includes("${") ||
			cleanRef.includes("{{")
		)
			continue;
		if (found.includes(cleanRef) || missing.includes(cleanRef)) continue;
		(fs.existsSync(path.join(cwd, cleanRef)) ? found : missing).push(cleanRef);
	}
	output(
		{
			valid: missing.length === 0,
			found: found.length,
			missing,
			total: found.length + missing.length,
		},
		raw,
		missing.length === 0 ? "valid" : "invalid",
	);
}

// ─── cmdVerifyCommits ─────────────────────────────────────────────────────────

export function cmdVerifyCommits(
	cwd: string,
	hashes: string[],
	raw: boolean,
): void {
	if (!hashes || hashes.length === 0)
		gsdError("At least one commit hash required");
	const valid: string[] = [],
		invalid: string[] = [];
	for (const hash of hashes) {
		(execGit(cwd, ["cat-file", "-t", hash]).stdout.trim() === "commit"
			? valid
			: invalid
		).push(hash);
	}
	output(
		{ all_valid: invalid.length === 0, valid, invalid, total: hashes.length },
		raw,
		invalid.length === 0 ? "valid" : "invalid",
	);
}

// ─── cmdVerifyArtifacts ────────────────────────────────────────────────────────

export function cmdVerifyArtifacts(
	cwd: string,
	planFilePath: string | undefined,
	raw: boolean,
): void {
	if (!planFilePath) gsdError("plan file path required");
	const fullPath = path.isAbsolute(planFilePath!)
		? planFilePath!
		: path.join(cwd, planFilePath!);
	const content = safeReadFile(fullPath);
	if (!content) {
		output({ error: "File not found", path: planFilePath }, raw);
		return;
	}
	const artifacts = parseMustHavesBlock(content, "artifacts");
	if (artifacts.length === 0) {
		output(
			{
				error: "No must_haves.artifacts found in frontmatter",
				path: planFilePath,
			},
			raw,
		);
		return;
	}
	const results: Array<{
		path: string;
		exists: boolean;
		issues: string[];
		passed: boolean;
	}> = [];
	for (const artifact of artifacts) {
		if (typeof artifact === "string") continue;
		const art = artifact as ArtifactEntry;
		if (!art.path) continue;
		const artFullPath = path.join(cwd, art.path),
			exists = fs.existsSync(artFullPath);
		const check = {
			path: art.path,
			exists,
			issues: [] as string[],
			passed: false,
		};
		if (exists) {
			const fileContent = safeReadFile(artFullPath) ?? "",
				lineCount = fileContent.split("\n").length;
			if (art.min_lines && lineCount < art.min_lines)
				check.issues.push(`Only ${lineCount} lines, need ${art.min_lines}`);
			if (art.contains && !fileContent.includes(art.contains))
				check.issues.push(`Missing pattern: ${art.contains}`);
			if (art.exports) {
				const exps = Array.isArray(art.exports) ? art.exports : [art.exports];
				for (const exp of exps)
					if (!fileContent.includes(exp))
						check.issues.push(`Missing export: ${exp}`);
			}
			check.passed = check.issues.length === 0;
		} else {
			check.issues.push("File not found");
		}
		results.push(check);
	}
	const passed = results.filter((r) => r.passed).length;
	output(
		{
			all_passed: passed === results.length,
			passed,
			total: results.length,
			artifacts: results,
		},
		raw,
		passed === results.length ? "valid" : "invalid",
	);
}

// ─── cmdVerifyKeyLinks ────────────────────────────────────────────────────────

export function cmdVerifyKeyLinks(
	cwd: string,
	planFilePath: string | undefined,
	raw: boolean,
): void {
	if (!planFilePath) gsdError("plan file path required");
	const fullPath = path.isAbsolute(planFilePath!)
		? planFilePath!
		: path.join(cwd, planFilePath!);
	const content = safeReadFile(fullPath);
	if (!content) {
		output({ error: "File not found", path: planFilePath }, raw);
		return;
	}
	const keyLinks = parseMustHavesBlock(content, "key_links");
	if (keyLinks.length === 0) {
		output(
			{
				error: "No must_haves.key_links found in frontmatter",
				path: planFilePath,
			},
			raw,
		);
		return;
	}
	const results: Array<{
		from: string;
		to: string;
		via: string;
		verified: boolean;
		detail: string;
	}> = [];
	for (const link of keyLinks) {
		if (typeof link === "string") continue;
		const l = link as KeyLinkEntry;
		const check = {
			from: l.from ?? "",
			to: l.to ?? "",
			via: l.via || "",
			verified: false,
			detail: "",
		};
		const sourceContent = safeReadFile(path.join(cwd, l.from || ""));
		if (!sourceContent) {
			check.detail = "Source file not found";
		} else if (l.pattern) {
			try {
				const regex = new RegExp(l.pattern);
				if (regex.test(sourceContent)) {
					check.verified = true;
					check.detail = "Pattern found in source";
				} else {
					const targetContent = safeReadFile(path.join(cwd, l.to || ""));
					if (targetContent && regex.test(targetContent)) {
						check.verified = true;
						check.detail = "Pattern found in target";
					} else
						check.detail = `Pattern "${l.pattern}" not found in source or target`;
				}
			} catch {
				check.detail = `Invalid regex pattern: ${l.pattern}`;
			}
		} else {
			if (sourceContent.includes(l.to || "")) {
				check.verified = true;
				check.detail = "Target referenced in source";
			} else check.detail = "Target not referenced in source";
		}
		results.push(check);
	}
	const verified = results.filter((r) => r.verified).length;
	output(
		{
			all_verified: verified === results.length,
			verified,
			total: results.length,
			links: results,
		},
		raw,
		verified === results.length ? "valid" : "invalid",
	);
}

// ─── cmdValidateConsistency ────────────────────────────────────────────────────

export function cmdValidateConsistency(cwd: string, raw: boolean): void {
	const roadmapPath = path.join(planningDir(cwd), "ROADMAP.md");
	const phasesDir = path.join(planningDir(cwd), "phases");
	const errors: string[] = [],
		warnings: string[] = [];
	if (!fs.existsSync(roadmapPath)) {
		errors.push("ROADMAP.md not found");
		output({ passed: false, errors, warnings }, raw, "failed");
		return;
	}
	const roadmapContent = extractCurrentMilestone(
		fs.readFileSync(roadmapPath, "utf-8"),
		cwd,
	);
	const roadmapPhases = new Set<string>();
	const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
	let m: RegExpExecArray | null;
	while ((m = phasePattern.exec(roadmapContent)) !== null)
		roadmapPhases.add(m[1]);
	const diskPhases = new Set<string>();
	try {
		fs.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.forEach((dir) => {
				const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
				if (dm) diskPhases.add(dm[1]);
			});
	} catch {
		/* ok */
	}
	for (const p of roadmapPhases) {
		if (!diskPhases.has(p) && !diskPhases.has(normalizePhaseName(p)))
			warnings.push(`Phase ${p} in ROADMAP.md but no directory on disk`);
	}
	for (const p of diskPhases) {
		const unpadded = String(parseInt(p, 10));
		if (!roadmapPhases.has(p) && !roadmapPhases.has(unpadded))
			warnings.push(`Phase ${p} exists on disk but not in ROADMAP.md`);
	}
	const config = loadConfig(cwd);
	if (config.phase_naming !== "custom") {
		const integerPhases = [...diskPhases]
			.filter((p) => !p.includes("."))
			.map((p) => parseInt(p, 10))
			.sort((a, b) => a - b);
		for (let i = 1; i < integerPhases.length; i++) {
			if (integerPhases[i] !== integerPhases[i - 1] + 1)
				warnings.push(
					`Gap in phase numbering: ${integerPhases[i - 1]} → ${integerPhases[i]}`,
				);
		}
	}
	const passed = errors.length === 0;
	output(
		{ passed, errors, warnings, warning_count: warnings.length },
		raw,
		passed ? "passed" : "failed",
	);
}

// ─── cmdValidateHealth ────────────────────────────────────────────────────────

export function cmdValidateHealth(
	cwd: string,
	options: { repair?: boolean },
	raw: boolean,
): void {
	const resolved = path.resolve(cwd);
	if (resolved === os.homedir()) {
		output(
			{
				status: "error",
				errors: [
					{
						code: "E010",
						message: `CWD is home directory - health check would read the wrong .planning/ directory.`,
						fix: "cd into your project directory and retry",
					},
				],
				warnings: [],
				info: [{ code: "I010", message: `Resolved CWD: ${resolved}` }],
				repairable_count: 0,
			},
			raw,
		);
		return;
	}
	const planBase = planningDir(cwd),
		planRoot = planningRoot(cwd);
	const projectPath = path.join(planRoot, "PROJECT.md"),
		roadmapPath = path.join(planBase, "ROADMAP.md"),
		statePath = path.join(planBase, "STATE.md"),
		configPath = path.join(planRoot, "config.json"),
		phasesDir = path.join(planBase, "phases");
	const errors: HealthIssue[] = [],
		warnings: HealthIssue[] = [],
		info: HealthIssue[] = [],
		repairs: string[] = [];
	const addIssue = (
		severity: string,
		code: string,
		message: string,
		fix: string,
		repairable = false,
		detail?: { field?: string; expected?: string; actual?: unknown },
	) => {
		const issue: HealthIssue = { code, message, fix, repairable, ...detail };
		if (severity === "error") errors.push(issue);
		else if (severity === "warning") warnings.push(issue);
		else info.push(issue);
	};
	if (!fs.existsSync(planBase)) {
		addIssue(
			"error",
			"E001",
			".planning/ directory not found",
			"Run /gsd-new-project to initialize",
		);
		output(
			{ status: "broken", errors, warnings, info, repairable_count: 0 },
			raw,
		);
		return;
	}
	if (!fs.existsSync(projectPath)) {
		addIssue(
			"error",
			"E002",
			"PROJECT.md not found",
			"Run /gsd-new-project to create",
		);
	} else {
		const content = fs.readFileSync(projectPath, "utf-8");
		for (const s of ["## What This Is", "## Core Value", "## Requirements"])
			if (!content.includes(s))
				addIssue(
					"warning",
					"W001",
					`PROJECT.md missing section: ${s}`,
					"Add section manually",
				);
	}
	if (!fs.existsSync(roadmapPath))
		addIssue(
			"error",
			"E003",
			"ROADMAP.md not found",
			"Run /gsd-new-milestone to create roadmap",
		);
	if (!fs.existsSync(statePath)) {
		addIssue(
			"error",
			"E004",
			"STATE.md not found",
			"Run /gsd-health --repair to regenerate",
			true,
		);
		repairs.push("regenerateState");
	}
	if (!fs.existsSync(configPath)) {
		addIssue(
			"warning",
			"W003",
			"config.json not found",
			"Run /gsd-health --repair to create with defaults",
			true,
		);
		repairs.push("createConfig");
	} else {
		try {
			const parsed: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
			// ─── Zod schema validation ───────────────────────────────────────────────
			const zodResult = PlanningConfigSchema.safeParse(parsed);
			if (!zodResult.success) {
				for (const issue of zodResult.error.issues) {
					const fieldPath = issue.path.join(".") || "(root)";
					const actual = getNestedValue(parsed, issue.path);
					addIssue(
						"warning",
						"W005",
						`config.json: field "${fieldPath}" — ${issue.message}`,
						"Run gsd-tools validate health --repair to fix using schema defaults",
						true,
						{
							field: fieldPath,
							expected: issue.message,
							actual,
						},
					);
				}
				if (!repairs.includes("fixSchemaDefaults"))
					repairs.push("fixSchemaDefaults");
			}
		} catch (err) {
			addIssue(
				"error",
				"E005",
				`config.json: JSON parse error - ${(err as Error).message}`,
				"Run gsd-tools validate health --repair to reset to defaults",
				true,
			);
			repairs.push("resetConfig");
		}
	}
	try {
		const agentStatus = checkAgentsInstalled();
		if (!agentStatus.agents_installed)
			addIssue(
				"warning",
				"W010",
				agentStatus.installed_agents.length === 0
					? `No GSD agents found in ${agentStatus.agents_dir}`
					: `Missing ${agentStatus.missing_agents.length} GSD agents: ${agentStatus.missing_agents.join(", ")}`,
				"Run the GSD installer: npx get-shit-done-cc@latest",
			);
	} catch {
		/* non-blocking */
	}
	const repairActions: HealthRepairAction[] = [];
	if (options.repair && repairs.length > 0) {
		for (const repair of repairs) {
			try {
				if (repair === "createConfig" || repair === "resetConfig") {
					// Use PlanningConfigSchema defaults — single source of truth for all fields
					const defaults = PlanningConfigSchema.parse({});
					fs.writeFileSync(
						configPath,
						JSON.stringify(defaults, null, 2),
						"utf-8",
					);
					repairActions.push({
						action: repair,
						success: true,
						path: "config.json",
					});
				} else if (
					repair === "fixSchemaDefaults" &&
					fs.existsSync(configPath)
				) {
					// Merge schema defaults into existing config — fills any missing/invalid fields
					const existing: unknown = JSON.parse(
						fs.readFileSync(configPath, "utf-8"),
					);
					const repaired = PlanningConfigSchema.parse(existing);
					fs.writeFileSync(
						configPath,
						JSON.stringify(repaired, null, 2),
						"utf-8",
					);
					repairActions.push({
						action: repair,
						success: true,
						path: "config.json",
					});
				} else if (repair === "regenerateState") {
					if (fs.existsSync(statePath)) {
						const ts = new Date()
							.toISOString()
							.replace(/[:.]/g, "-")
							.slice(0, 19);
						const bp = `${statePath}.bak-${ts}`;
						fs.copyFileSync(statePath, bp);
						repairActions.push({
							action: "backupState",
							success: true,
							path: bp,
						});
					}
					const milestone = getMilestoneInfo(cwd);
					writeStateMd(
						statePath,
						`# Session State\n\n## Project Reference\n\nSee: .planning/PROJECT.md\n\n## Position\n\n**Milestone:** ${milestone.version} ${milestone.name}\n**Current phase:** (determining...)\n**Status:** Resuming\n\n## Session Log\n\n- ${new Date().toISOString().split("T")[0]}: STATE.md regenerated by /gsd-health --repair\n`,
						cwd,
					);
					repairActions.push({
						action: repair,
						success: true,
						path: "STATE.md",
					});
				}
			} catch (err) {
				repairActions.push({
					action: repair,
					success: false,
					error: (err as Error).message,
				});
			}
		}
	}
	const status =
		errors.length > 0 ? "broken" : warnings.length > 0 ? "degraded" : "healthy";
	output(
		{
			status,
			errors,
			warnings,
			info,
			repairable_count:
				errors.filter((e) => e.repairable).length +
				warnings.filter((w) => w.repairable).length,
			repairs_performed: repairActions.length > 0 ? repairActions : undefined,
		},
		raw,
	);
}

// ─── cmdValidateAgents ────────────────────────────────────────────────────────

export function cmdValidateAgents(cwd: string, raw: boolean): void {
	const agentStatus = checkAgentsInstalled();
	output(
		{
			agents_dir: agentStatus.agents_dir,
			agents_found: agentStatus.agents_installed,
			installed: agentStatus.installed_agents,
			missing: agentStatus.missing_agents,
			expected: Object.keys(MODEL_PROFILES),
		},
		raw,
	);
}
