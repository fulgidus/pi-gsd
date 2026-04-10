/**
 * phase.ts - Phase CRUD, query, and lifecycle operations.
 *
 * Ported from lib/phase.cjs. All command signatures preserved.
 */

import fs from "fs";
import path from "path";
import {
	comparePhaseNum,
	escapeRegex,
	extractCurrentMilestone,
	findPhaseInternal,
	generateSlugInternal,
	getArchivedPhaseDirs,
	getMilestonePhaseFilter,
	gsdError,
	loadConfig,
	normalizePhaseName,
	output,
	planningDir,
	readSubdirectories,
	replaceInCurrentMilestone,
	toPosixPath,
} from "./core.js";
import { extractFrontmatter, asStr, asArr } from "./frontmatter.js";

// Shape of a single plan entry built by cmdPhasePlanIndex
interface PhasePlanEntry {
	id: string;
	wave: number;
	autonomous: boolean;
	objective: string | null;
	files_modified: string[];
	task_count: number;
	has_summary: boolean;
}

import {
	stateExtractField,
	stateReplaceField,
	stateReplaceFieldWithFallback,
	writeStateMd,
	cmdStateNote,
} from "./state.js";

// ─── cmdPhasesList ────────────────────────────────────────────────────────────

export function cmdPhasesList(
	cwd: string,
	options: {
		type?: string | null;
		phase?: string | null;
		includeArchived?: boolean;
	},
	raw: boolean,
): void {
	const phasesDir = path.join(planningDir(cwd), "phases");
	const { type, phase, includeArchived } = options;
	if (!fs.existsSync(phasesDir)) {
		output(
			type ? { files: [], count: 0 } : { directories: [], count: 0 },
			raw,
			"",
		);
		return;
	}
	try {
		let dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
		if (includeArchived) {
			const archived = getArchivedPhaseDirs(cwd);
			for (const a of archived) dirs.push(`${a.name} [${a.milestone}]`);
		}
		dirs.sort((a, b) => comparePhaseNum(a, b));
		if (phase) {
			const normalized = normalizePhaseName(phase);
			const match = dirs.find((d) => d.startsWith(normalized));
			if (!match) {
				output(
					{ files: [], count: 0, phase_dir: null, error: "Phase not found" },
					raw,
					"",
				);
				return;
			}
			dirs = [match];
		}
		if (type) {
			const files: string[] = [];
			for (const dir of dirs) {
				const dirPath = path.join(phasesDir, dir);
				const dirFiles = fs.readdirSync(dirPath);
				let filtered: string[];
				if (type === "plans")
					filtered = dirFiles.filter(
						(f) => f.endsWith("-PLAN.md") || f === "PLAN.md",
					);
				else if (type === "summaries")
					filtered = dirFiles.filter(
						(f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md",
					);
				else filtered = dirFiles;
				files.push(...filtered.sort());
			}
			output(
				{
					files,
					count: files.length,
					phase_dir: phase ? dirs[0]?.replace(/^\d+(?:\.\d+)*-?/, "") : null,
				},
				raw,
				files.join("\n"),
			);
			return;
		}
		output({ directories: dirs, count: dirs.length }, raw, dirs.join("\n"));
	} catch (e) {
		gsdError("Failed to list phases: " + (e as Error).message);
	}
}

// ─── cmdPhaseNextDecimal ──────────────────────────────────────────────────────

export function cmdPhaseNextDecimal(
	cwd: string,
	basePhase: string | undefined,
	raw: boolean,
): void {
	const phasesDir = path.join(planningDir(cwd), "phases");
	const normalized = normalizePhaseName(basePhase ?? "");
	if (!fs.existsSync(phasesDir)) {
		output(
			{
				found: false,
				base_phase: normalized,
				next: `${normalized}.1`,
				existing: [],
			},
			raw,
			`${normalized}.1`,
		);
		return;
	}
	try {
		const dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
		const baseExists = dirs.some(
			(d) => d.startsWith(normalized + "-") || d === normalized,
		);
		const decimalPattern = new RegExp(`^${normalized}\\.(\\d+)`);
		const existingDecimals = dirs
			.map((d) => {
				const m = d.match(decimalPattern);
				return m ? `${normalized}.${m[1]}` : null;
			})
			.filter(Boolean) as string[];
		existingDecimals.sort((a, b) => comparePhaseNum(a, b));
		const nextDecimal =
			existingDecimals.length === 0
				? `${normalized}.1`
				: `${normalized}.${parseInt(existingDecimals[existingDecimals.length - 1].split(".")[1], 10) + 1}`;
		output(
			{
				found: baseExists,
				base_phase: normalized,
				next: nextDecimal,
				existing: existingDecimals,
			},
			raw,
			nextDecimal,
		);
	} catch (e) {
		gsdError("Failed to calculate next decimal phase: " + (e as Error).message);
	}
}

// ─── cmdFindPhase ─────────────────────────────────────────────────────────────

export function cmdFindPhase(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	if (!phase) gsdError("phase identifier required");
	const phasesDir = path.join(planningDir(cwd), "phases");
	const normalized = normalizePhaseName(phase!);
	const notFound = {
		found: false,
		directory: null,
		phase_number: null,
		phase_name: null,
		plans: [],
		summaries: [],
	};
	try {
		const dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort((a, b) => comparePhaseNum(a, b));
		const match = dirs.find((d) => d.startsWith(normalized));
		if (!match) {
			output(notFound, raw, "");
			return;
		}
		const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
		const phaseNumber = dirMatch ? dirMatch[1] : normalized;
		const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
		const phaseDir = path.join(phasesDir, match);
		const phaseFiles = fs.readdirSync(phaseDir);
		const plans = phaseFiles
			.filter((f) => f.endsWith("-PLAN.md") || f === "PLAN.md")
			.sort();
		const summaries = phaseFiles
			.filter((f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md")
			.sort();
		output(
			{
				found: true,
				directory: toPosixPath(
					path.join(path.relative(cwd, planningDir(cwd)), "phases", match),
				),
				phase_number: phaseNumber,
				phase_name: phaseName,
				plans,
				summaries,
			},
			raw,
			toPosixPath(
				path.join(path.relative(cwd, planningDir(cwd)), "phases", match),
			),
		);
	} catch {
		output(notFound, raw, "");
	}
}

// ─── cmdPhasePlanIndex ────────────────────────────────────────────────────────

export function cmdPhasePlanIndex(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	if (!phase) gsdError("phase required for phase-plan-index");
	const phasesDir = path.join(planningDir(cwd), "phases");
	const normalized = normalizePhaseName(phase!);
	let phaseDir: string | null = null;
	try {
		const dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort((a, b) => comparePhaseNum(a, b));
		const match = dirs.find((d) => d.startsWith(normalized));
		if (match) phaseDir = path.join(phasesDir, match);
	} catch {
		/* ok */
	}
	if (!phaseDir) {
		output(
			{
				phase: normalized,
				error: "Phase not found",
				plans: [],
				waves: {},
				incomplete: [],
				has_checkpoints: false,
			},
			raw,
		);
		return;
	}
	const phaseFiles = fs.readdirSync(phaseDir);
	const planFiles = phaseFiles
		.filter((f) => f.endsWith("-PLAN.md") || f === "PLAN.md")
		.sort();
	const summaryFiles = phaseFiles.filter(
		(f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md",
	);
	const completedPlanIds = new Set(
		summaryFiles.map((s) =>
			s.replace("-SUMMARY.md", "").replace("SUMMARY.md", ""),
		),
	);
	const plans: PhasePlanEntry[] = [],
		waves: Record<string, string[]> = {},
		incomplete: string[] = [];
	let hasCheckpoints = false;
	for (const planFile of planFiles) {
		const planId = planFile.replace("-PLAN.md", "").replace("PLAN.md", "");
		const content = fs.readFileSync(path.join(phaseDir, planFile), "utf-8");
		const fm = extractFrontmatter(content);
		const xmlTasks = content.match(/<task[\s>]/gi) || [],
			mdTasks = content.match(/##\s*Task\s*\d+/gi) || [];
		const taskCount = xmlTasks.length || mdTasks.length;
		const wave = parseInt(String(fm.wave), 10) || 1;
		let autonomous = true;
		if (fm.autonomous !== undefined)
			autonomous = fm.autonomous === "true" || fm.autonomous === true;
		if (!autonomous) hasCheckpoints = true;
		let filesModified: string[] = [];
		const fmFiles = fm["files_modified"] ?? fm["files-modified"];
		if (fmFiles) {
			const arr = asArr(fmFiles);
			filesModified = arr ? arr.map((f) => asStr(f) ?? String(f)) : [asStr(fmFiles) ?? String(fmFiles)];
		}
		const hasSummary = completedPlanIds.has(planId);
		if (!hasSummary) incomplete.push(planId);
		plans.push({
			id: planId,
			wave,
			autonomous,
			objective:
				content.match(/<objective>\s*\n?\s*(.+)/)?.[1]?.trim() ??
				asStr(fm.objective) ??
				null,
			files_modified: filesModified,
			task_count: taskCount,
			has_summary: hasSummary,
		});
		const waveKey = String(wave);
		if (!waves[waveKey]) waves[waveKey] = [];
		waves[waveKey].push(planId);
	}
	output(
		{
			phase: normalized,
			plans,
			waves,
			incomplete,
			has_checkpoints: hasCheckpoints,
		},
		raw,
	);
}

// ─── cmdPhaseAdd / cmdPhaseAddBatch ──────────────────────────────────────────

interface PhaseAddResult {
	phase_number: number | string;
	padded: string;
	name: string;
	slug: string | null;
	directory: string;
	naming_mode: string;
}

/**
 * Core phase-creation logic shared by cmdPhaseAdd and cmdPhaseAddBatch.
 * Mutates disk (creates directory, updates ROADMAP.md) and returns structured
 * result data — callers are responsible for output / state notes.
 */
function addPhaseCore(
	cwd: string,
	description: string,
	customId?: string | null,
): PhaseAddResult {
	const config = loadConfig(cwd);
	const roadmapPath = path.join(planningDir(cwd), "ROADMAP.md");
	if (!fs.existsSync(roadmapPath)) gsdError("ROADMAP.md not found");
	const rawContent = fs.readFileSync(roadmapPath, "utf-8");
	const content = extractCurrentMilestone(rawContent, cwd);
	const slug = generateSlugInternal(description);
	let newPhaseId: string | number, dirName: string;
	if (customId || config.phase_naming === "custom") {
		newPhaseId = customId || slug!.toUpperCase().replace(/-/g, "-");
		if (!newPhaseId) gsdError('--id required when phase_naming is "custom"');
		dirName = `${newPhaseId}-${slug}`;
	} else {
		const phasePattern = /#{2,4}\s*Phase\s+(\d+)[A-Z]?(?:\.\d+)*:/gi;
		let maxPhase = 0,
			m: RegExpExecArray | null;
		while ((m = phasePattern.exec(content)) !== null) {
			const n = parseInt(m[1], 10);
			if (n > maxPhase) maxPhase = n;
		}
		newPhaseId = maxPhase + 1;
		const paddedNum = String(newPhaseId).padStart(2, "0");
		dirName = `${paddedNum}-${slug}`;
	}
	const dirPath = path.join(planningDir(cwd), "phases", dirName);
	fs.mkdirSync(dirPath, { recursive: true });
	fs.writeFileSync(path.join(dirPath, ".gitkeep"), "");
	const dependsOn =
		config.phase_naming === "custom"
			? ""
			: `\n**Depends on:** Phase ${typeof newPhaseId === "number" ? newPhaseId - 1 : "TBD"}`;
	const phaseEntry = `\n### Phase ${newPhaseId}: ${description}\n\n**Goal:** [To be planned]\n**Requirements**: TBD${dependsOn}\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /gsd-plan-phase ${newPhaseId} to break down)\n`;
	const lastSeparator = rawContent.lastIndexOf("\n---");
	const updatedContent =
		lastSeparator > 0
			? rawContent.slice(0, lastSeparator) +
				phaseEntry +
				rawContent.slice(lastSeparator)
			: rawContent + phaseEntry;
	fs.writeFileSync(roadmapPath, updatedContent, "utf-8");
	return {
		phase_number: typeof newPhaseId === "number" ? newPhaseId : String(newPhaseId),
		padded:
			typeof newPhaseId === "number"
				? String(newPhaseId).padStart(2, "0")
				: String(newPhaseId),
		name: description,
		slug,
		directory: toPosixPath(
			path.join(path.relative(cwd, planningDir(cwd)), "phases", dirName),
		),
		naming_mode: config.phase_naming,
	};
}

export function cmdPhaseAdd(
	cwd: string,
	description: string | undefined,
	raw: boolean,
	customId?: string | null,
): void {
	if (!description) gsdError("description required for phase add");
	const result = addPhaseCore(cwd, description!, customId);
	output(result, raw, result.padded);
}

/**
 * Add one or more phases from a single description string.
 * Multiple phases may be separated by ` + ` (space-plus-space).
 * Also appends a Roadmap Evolution note to STATE.md for each phase.
 * Returns { phases: PhaseAddResult[], count: number }.
 */
export function cmdPhaseAddBatch(
	cwd: string,
	description: string | undefined,
	raw: boolean,
): void {
	if (!description?.trim()) gsdError("description required for phase add-batch");
	const descriptions = description!
		.split(/ \+ /)
		.map((d) => d.trim())
		.filter(Boolean);
	const phases: PhaseAddResult[] = [];
	for (const desc of descriptions) {
		const result = addPhaseCore(cwd, desc);
		// Best-effort STATE.md note — ignore errors so batch continues
		try { cmdStateNote(cwd, `Phase ${result.phase_number} added: ${desc}`, false); } catch { /* ignore */ }
		phases.push(result);
	}
	output({ phases, count: phases.length }, raw);
}

// ─── cmdPhaseInsert ───────────────────────────────────────────────────────────

export function cmdPhaseInsert(
	cwd: string,
	afterPhase: string | undefined,
	description: string | undefined,
	raw: boolean,
): void {
	if (!afterPhase || !description)
		gsdError("after-phase and description required for phase insert");
	const roadmapPath = path.join(planningDir(cwd), "ROADMAP.md");
	if (!fs.existsSync(roadmapPath)) gsdError("ROADMAP.md not found");
	const rawContent = fs.readFileSync(roadmapPath, "utf-8");
	const content = extractCurrentMilestone(rawContent, cwd);
	const slug = generateSlugInternal(description!);
	const normalizedAfter = normalizePhaseName(afterPhase!);
	const unpadded = normalizedAfter.replace(/^0+/, "");
	const afterPhaseEscaped = unpadded.replace(/\./g, "\\.");
	const targetPattern = new RegExp(
		`#{2,4}\\s*Phase\\s+0*${afterPhaseEscaped}:`,
		"i",
	);
	if (!targetPattern.test(content))
		gsdError(`Phase ${afterPhase} not found in ROADMAP.md`);
	const phasesDir = path.join(planningDir(cwd), "phases");
	const normalizedBase = normalizePhaseName(afterPhase!);
	const existingDecimals: number[] = [];
	try {
		const dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
		const decimalPattern = new RegExp(`^${normalizedBase}\\.(\\d+)`);
		for (const dir of dirs) {
			const dm = dir.match(decimalPattern);
			if (dm) existingDecimals.push(parseInt(dm[1], 10));
		}
	} catch {
		/* ok */
	}
	const nextDecimal =
		existingDecimals.length === 0 ? 1 : Math.max(...existingDecimals) + 1;
	const decimalPhase = `${normalizedBase}.${nextDecimal}`;
	const dirName = `${decimalPhase}-${slug}`;
	const dirPath = path.join(planningDir(cwd), "phases", dirName);
	fs.mkdirSync(dirPath, { recursive: true });
	fs.writeFileSync(path.join(dirPath, ".gitkeep"), "");
	const phaseEntry = `\n### Phase ${decimalPhase}: ${description} (INSERTED)\n\n**Goal:** [Urgent work - to be planned]\n**Requirements**: TBD\n**Depends on:** Phase ${afterPhase}\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /gsd-plan-phase ${decimalPhase} to break down)\n`;
	const headerPattern = new RegExp(
		`(#{2,4}\\s*Phase\\s+0*${afterPhaseEscaped}:[^\\n]*\\n)`,
		"i",
	);
	const headerMatch = rawContent.match(headerPattern);
	if (!headerMatch) gsdError(`Could not find Phase ${afterPhase} header`);
	const headerIdx = rawContent.indexOf(headerMatch![0]);
	const afterHeader = rawContent.slice(headerIdx + headerMatch![0].length);
	const nextPhaseMatch = afterHeader.match(/\n#{2,4}\s+Phase\s+\d/i);
	const insertIdx = nextPhaseMatch
		? headerIdx + headerMatch![0].length + nextPhaseMatch.index!
		: rawContent.length;
	fs.writeFileSync(
		roadmapPath,
		rawContent.slice(0, insertIdx) + phaseEntry + rawContent.slice(insertIdx),
		"utf-8",
	);
	output(
		{
			phase_number: decimalPhase,
			after_phase: afterPhase,
			name: description,
			slug,
			directory: toPosixPath(
				path.join(path.relative(cwd, planningDir(cwd)), "phases", dirName),
			),
		},
		raw,
		decimalPhase,
	);
}

// ─── cmdPhaseRemove ───────────────────────────────────────────────────────────

function renameDecimalPhases(
	phasesDir: string,
	baseInt: string,
	removedDecimal: number,
): {
	renamedDirs: Array<{ from: string; to: string }>;
	renamedFiles: Array<{ from: string; to: string }>;
} {
	const renamedDirs: Array<{ from: string; to: string }> = [],
		renamedFiles: Array<{ from: string; to: string }> = [];
	const decPattern = new RegExp(`^${baseInt}\\.(\\d+)-(.+)$`);
	const toRename = readSubdirectories(phasesDir, true)
		.map((dir) => {
			const m = dir.match(decPattern);
			return m ? { dir, oldDecimal: parseInt(m[1], 10), slug: m[2] } : null;
		})
		.filter(
			(x): x is NonNullable<typeof x> =>
				x !== null && x.oldDecimal > removedDecimal,
		)
		.sort((a, b) => b.oldDecimal - a.oldDecimal);
	for (const item of toRename) {
		const newDecimal = item.oldDecimal - 1;
		const oldPhaseId = `${baseInt}.${item.oldDecimal}`,
			newPhaseId = `${baseInt}.${newDecimal}`;
		const newDirName = `${baseInt}.${newDecimal}-${item.slug}`;
		fs.renameSync(
			path.join(phasesDir, item.dir),
			path.join(phasesDir, newDirName),
		);
		renamedDirs.push({ from: item.dir, to: newDirName });
		for (const f of fs.readdirSync(path.join(phasesDir, newDirName))) {
			if (f.includes(oldPhaseId)) {
				const newFileName = f.replace(oldPhaseId, newPhaseId);
				fs.renameSync(
					path.join(phasesDir, newDirName, f),
					path.join(phasesDir, newDirName, newFileName),
				);
				renamedFiles.push({ from: f, to: newFileName });
			}
		}
	}
	return { renamedDirs, renamedFiles };
}

function renameIntegerPhases(
	phasesDir: string,
	removedInt: number,
): {
	renamedDirs: Array<{ from: string; to: string }>;
	renamedFiles: Array<{ from: string; to: string }>;
} {
	const renamedDirs: Array<{ from: string; to: string }> = [],
		renamedFiles: Array<{ from: string; to: string }> = [];
	const toRename = readSubdirectories(phasesDir, true)
		.map((dir) => {
			const m = dir.match(/^(\d+)([A-Z])?(?:\.(\d+))?-(.+)$/i);
			if (!m) return null;
			const dirInt = parseInt(m[1], 10);
			return dirInt > removedInt
				? {
						dir,
						oldInt: dirInt,
						letter: m[2] ? m[2].toUpperCase() : "",
						decimal: m[3] ? parseInt(m[3], 10) : null,
						slug: m[4],
					}
				: null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null)
		.sort((a, b) =>
			a.oldInt !== b.oldInt
				? b.oldInt - a.oldInt
				: (b.decimal || 0) - (a.decimal || 0),
		);
	for (const item of toRename) {
		const newInt = item.oldInt - 1;
		const newPadded = String(newInt).padStart(2, "0"),
			oldPadded = String(item.oldInt).padStart(2, "0");
		const letterSuffix = item.letter || "",
			decimalSuffix = item.decimal !== null ? `.${item.decimal}` : "";
		const oldPrefix = `${oldPadded}${letterSuffix}${decimalSuffix}`,
			newPrefix = `${newPadded}${letterSuffix}${decimalSuffix}`;
		const newDirName = `${newPrefix}-${item.slug}`;
		fs.renameSync(
			path.join(phasesDir, item.dir),
			path.join(phasesDir, newDirName),
		);
		renamedDirs.push({ from: item.dir, to: newDirName });
		for (const f of fs.readdirSync(path.join(phasesDir, newDirName))) {
			if (f.startsWith(oldPrefix)) {
				const newFileName = newPrefix + f.slice(oldPrefix.length);
				fs.renameSync(
					path.join(phasesDir, newDirName, f),
					path.join(phasesDir, newDirName, newFileName),
				);
				renamedFiles.push({ from: f, to: newFileName });
			}
		}
	}
	return { renamedDirs, renamedFiles };
}

function updateRoadmapAfterPhaseRemoval(
	roadmapPath: string,
	targetPhase: string,
	isDecimal: boolean,
	removedInt: number,
): void {
	let content = fs.readFileSync(roadmapPath, "utf-8");
	const escaped = escapeRegex(targetPhase);
	content = content.replace(
		new RegExp(
			`\\n?#{2,4}\\s*Phase\\s+${escaped}\\s*:[\\s\\S]*?(?=\\n#{2,4}\\s+Phase\\s+\\d|$)`,
			"i",
		),
		"",
	);
	content = content.replace(
		new RegExp(
			`\\n?-\\s*\\[[ x]\\]\\s*.*Phase\\s+${escaped}[:\\s][^\\n]*`,
			"gi",
		),
		"",
	);
	content = content.replace(
		new RegExp(`\\n?\\|\\s*${escaped}\\.?\\s[^|]*\\|[^\\n]*`, "gi"),
		"",
	);
	if (!isDecimal) {
		for (let oldNum = 99; oldNum > removedInt; oldNum--) {
			const newNum = oldNum - 1,
				oldStr = String(oldNum),
				newStr = String(newNum);
			const oldPad = oldStr.padStart(2, "0"),
				newPad = newStr.padStart(2, "0");
			content = content.replace(
				new RegExp(`(#{2,4}\\s*Phase\\s+)${oldStr}(\\s*:)`, "gi"),
				`$1${newStr}$2`,
			);
			content = content.replace(
				new RegExp(`(Phase\\s+)${oldStr}([:\\s])`, "g"),
				`$1${newStr}$2`,
			);
			content = content.replace(
				new RegExp(`${oldPad}-(\\d{2})`, "g"),
				`${newPad}-$1`,
			);
			content = content.replace(
				new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, "g"),
				`$1${newStr}. `,
			);
			content = content.replace(
				new RegExp(`(Depends on:\\*\\*\\s*Phase\\s+)${oldStr}\\b`, "gi"),
				`$1${newStr}`,
			);
		}
	}
	fs.writeFileSync(roadmapPath, content, "utf-8");
}

export function cmdPhaseRemove(
	cwd: string,
	targetPhase: string | undefined,
	options: { force?: boolean },
	raw: boolean,
): void {
	if (!targetPhase) gsdError("phase number required for phase remove");
	const roadmapPath = path.join(planningDir(cwd), "ROADMAP.md");
	const phasesDir = path.join(planningDir(cwd), "phases");
	if (!fs.existsSync(roadmapPath)) gsdError("ROADMAP.md not found");
	const normalized = normalizePhaseName(targetPhase!);
	const isDecimal = targetPhase!.includes(".");
	const force = options.force || false;
	const targetDir =
		readSubdirectories(phasesDir, true).find(
			(d) => d.startsWith(normalized + "-") || d === normalized,
		) || null;
	if (targetDir && !force) {
		const summaries = fs
			.readdirSync(path.join(phasesDir, targetDir))
			.filter((f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md");
		if (summaries.length > 0)
			gsdError(
				`Phase ${targetPhase} has ${summaries.length} executed plan(s). Use --force to remove anyway.`,
			);
	}
	if (targetDir)
		fs.rmSync(path.join(phasesDir, targetDir), {
			recursive: true,
			force: true,
		});
	let renamedDirs: Array<{ from: string; to: string }> = [],
		renamedFiles: Array<{ from: string; to: string }> = [];
	try {
		const renamed = isDecimal
			? renameDecimalPhases(
					phasesDir,
					normalized.split(".")[0],
					parseInt(normalized.split(".")[1], 10),
				)
			: renameIntegerPhases(phasesDir, parseInt(normalized, 10));
		renamedDirs = renamed.renamedDirs;
		renamedFiles = renamed.renamedFiles;
	} catch {
		/* ok */
	}
	updateRoadmapAfterPhaseRemoval(
		roadmapPath,
		targetPhase!,
		isDecimal,
		parseInt(normalized, 10),
	);
	const statePath = path.join(planningDir(cwd), "STATE.md");
	if (fs.existsSync(statePath)) {
		let stateContent = fs.readFileSync(statePath, "utf-8");
		const totalRaw = stateExtractField(stateContent, "Total Phases");
		if (totalRaw)
			stateContent =
				stateReplaceField(
					stateContent,
					"Total Phases",
					String(parseInt(totalRaw, 10) - 1),
				) ?? stateContent;
		const ofMatch = stateContent.match(/(\bof\s+)(\d+)(\s*(?:\(|phases?))/i);
		if (ofMatch)
			stateContent = stateContent.replace(
				/(\bof\s+)(\d+)(\s*(?:\(|phases?))/i,
				`$1${parseInt(ofMatch[2], 10) - 1}$3`,
			);
		writeStateMd(statePath, stateContent, cwd);
	}
	output(
		{
			removed: targetPhase,
			directory_deleted: targetDir,
			renamed_directories: renamedDirs,
			renamed_files: renamedFiles,
			roadmap_updated: true,
			state_updated: fs.existsSync(statePath),
		},
		raw,
	);
}

// ─── cmdPhaseComplete ─────────────────────────────────────────────────────────

export function cmdPhaseComplete(
	cwd: string,
	phaseNum: string | undefined,
	raw: boolean,
): void {
	if (!phaseNum) gsdError("phase number required for phase complete");
	const roadmapPath = path.join(planningDir(cwd), "ROADMAP.md");
	const statePath = path.join(planningDir(cwd), "STATE.md");
	const phasesDir = path.join(planningDir(cwd), "phases");
	const normalized = normalizePhaseName(phaseNum!);
	const today = new Date().toISOString().split("T")[0];
	const phaseInfo = findPhaseInternal(cwd, phaseNum!);
	if (!phaseInfo) gsdError(`Phase ${phaseNum} not found`);
	const planCount = phaseInfo!.plans.length,
		summaryCount = phaseInfo!.summaries.length;
	let requirementsUpdated = false;
	const warnings: string[] = [];
	try {
		const phaseFullDir = path.join(cwd, phaseInfo!.directory);
		const phaseFiles = fs.readdirSync(phaseFullDir);
		for (const file of phaseFiles.filter(
			(f) => f.includes("-UAT") && f.endsWith(".md"),
		)) {
			const content = fs.readFileSync(path.join(phaseFullDir, file), "utf-8");
			if (/result: pending/.test(content))
				warnings.push(`${file}: has pending tests`);
			if (/result: blocked/.test(content))
				warnings.push(`${file}: has blocked tests`);
			if (/status: partial/.test(content))
				warnings.push(`${file}: testing incomplete (partial)`);
			if (/status: diagnosed/.test(content))
				warnings.push(`${file}: has diagnosed gaps`);
		}
		for (const file of phaseFiles.filter(
			(f) => f.includes("-VERIFICATION") && f.endsWith(".md"),
		)) {
			const content = fs.readFileSync(path.join(phaseFullDir, file), "utf-8");
			if (/status: human_needed/.test(content))
				warnings.push(`${file}: needs human verification`);
			if (/status: gaps_found/.test(content))
				warnings.push(`${file}: has unresolved gaps`);
		}
	} catch {
		/* ok */
	}

	if (fs.existsSync(roadmapPath)) {
		let roadmapContent = fs.readFileSync(roadmapPath, "utf-8");
		const checkboxPattern = new RegExp(
			`(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${escapeRegex(phaseNum!)}[:\\s][^\\n]*)`,
			"i",
		);
		roadmapContent = replaceInCurrentMilestone(
			roadmapContent,
			checkboxPattern,
			`$1x$2 (completed ${today})`,
		);
		const phaseEscaped = escapeRegex(phaseNum!);
		roadmapContent = roadmapContent.replace(
			new RegExp(`^(\\|\\s*${phaseEscaped}\\.?\\s[^|]*(?:\\|[^\\n]*))$`, "im"),
			(fullRow) => {
				const cells = fullRow.split("|").slice(1, -1);
				if (cells.length === 5) {
					cells[3] = " Complete    ";
					cells[4] = ` ${today} `;
				} else if (cells.length === 4) {
					cells[2] = " Complete    ";
					cells[3] = ` ${today} `;
				}
				return "|" + cells.join("|") + "|";
			},
		);
		roadmapContent = replaceInCurrentMilestone(
			roadmapContent,
			new RegExp(
				`(#{2,4}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
				"i",
			),
			`$1${summaryCount}/${planCount} plans complete`,
		);
		fs.writeFileSync(roadmapPath, roadmapContent, "utf-8");
		const reqPath = path.join(planningDir(cwd), "REQUIREMENTS.md");
		if (fs.existsSync(reqPath)) {
			const currentMilestoneRoadmap = extractCurrentMilestone(
				roadmapContent,
				cwd,
			);
			const phaseSectionMatch = currentMilestoneRoadmap.match(
				new RegExp(
					`(#{2,4}\\s*Phase\\s+${escapeRegex(phaseNum!)}[:\\s][\\s\\S]*?)(?=#{2,4}\\s*Phase\\s+|$)`,
					"i",
				),
			);
			const sectionText = phaseSectionMatch ? phaseSectionMatch[1] : "";
			const reqMatch = sectionText.match(/\*\*Requirements:\*\*\s*([^\n]+)/i);
			if (reqMatch) {
				const reqIds = reqMatch[1]
					.replace(/[[\]]/g, "")
					.split(/[,\s]+/)
					.map((r) => r.trim())
					.filter(Boolean);
				let reqContent = fs.readFileSync(reqPath, "utf-8");
				for (const reqId of reqIds) {
					const esc = escapeRegex(reqId);
					reqContent = reqContent.replace(
						new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${esc}\\*\\*)`, "gi"),
						"$1x$2",
					);
					reqContent = reqContent.replace(
						new RegExp(
							`(\\|\\s*${esc}\\s*\\|[^|]+\\|)\\s*(?:Pending|In Progress)\\s*(\\|)`,
							"gi",
						),
						"$1 Complete $2",
					);
				}
				fs.writeFileSync(reqPath, reqContent, "utf-8");
				requirementsUpdated = true;
			}
		}
	}

	let nextPhaseNum: string | null = null,
		nextPhaseName: string | null = null,
		isLastPhase = true;
	try {
		const isDirInMilestone = getMilestonePhaseFilter(cwd);
		const dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.filter(isDirInMilestone)
			.sort((a, b) => comparePhaseNum(a, b));
		for (const dir of dirs) {
			const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
			if (dm && comparePhaseNum(dm[1], phaseNum!) > 0) {
				nextPhaseNum = dm[1];
				nextPhaseName = dm[2] || null;
				isLastPhase = false;
				break;
			}
		}
	} catch {
		/* ok */
	}
	if (isLastPhase && fs.existsSync(roadmapPath)) {
		try {
			const roadmapForPhases = extractCurrentMilestone(
				fs.readFileSync(roadmapPath, "utf-8"),
				cwd,
			);
			const phasePattern =
				/#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
			let pm: RegExpExecArray | null;
			while ((pm = phasePattern.exec(roadmapForPhases)) !== null) {
				if (comparePhaseNum(pm[1], phaseNum!) > 0) {
					nextPhaseNum = pm[1];
					nextPhaseName = pm[2]
						.replace(/\(INSERTED\)/i, "")
						.trim()
						.toLowerCase()
						.replace(/\s+/g, "-");
					isLastPhase = false;
					break;
				}
			}
		} catch {
			/* ok */
		}
	}

	if (fs.existsSync(statePath)) {
		let stateContent = fs.readFileSync(statePath, "utf-8");
		const phaseValue = nextPhaseNum || phaseNum!;
		const existingPhaseField =
			stateExtractField(stateContent, "Current Phase") ||
			stateExtractField(stateContent, "Phase");
		let newPhaseValue = String(phaseValue);
		if (existingPhaseField) {
			const totalMatch = existingPhaseField.match(/of\s+(\d+)/),
				nameMatch = existingPhaseField.match(/\(([^)]+)\)/);
			if (totalMatch) {
				const nameStr = nextPhaseName
					? ` (${nextPhaseName.replace(/-/g, " ")})`
					: nameMatch
						? ` (${nameMatch[1]})`
						: "";
				newPhaseValue = `${phaseValue} of ${totalMatch[1]}${nameStr}`;
			}
		}
		stateContent = stateReplaceFieldWithFallback(
			stateContent,
			"Current Phase",
			"Phase",
			newPhaseValue,
		);
		if (nextPhaseName)
			stateContent = stateReplaceFieldWithFallback(
				stateContent,
				"Current Phase Name",
				null,
				nextPhaseName.replace(/-/g, " "),
			);
		stateContent = stateReplaceFieldWithFallback(
			stateContent,
			"Status",
			null,
			isLastPhase ? "Milestone complete" : "Ready to plan",
		);
		stateContent = stateReplaceFieldWithFallback(
			stateContent,
			"Current Plan",
			"Plan",
			"Not started",
		);
		stateContent = stateReplaceFieldWithFallback(
			stateContent,
			"Last Activity",
			"Last activity",
			today,
		);
		stateContent = stateReplaceFieldWithFallback(
			stateContent,
			"Last Activity Description",
			null,
			`Phase ${phaseNum} complete${nextPhaseNum ? `, transitioned to Phase ${nextPhaseNum}` : ""}`,
		);
		const completedRaw = stateExtractField(stateContent, "Completed Phases");
		if (completedRaw) {
			const newCompleted = parseInt(completedRaw, 10) + 1;
			stateContent =
				stateReplaceField(
					stateContent,
					"Completed Phases",
					String(newCompleted),
				) ?? stateContent;
			const totalRaw = stateExtractField(stateContent, "Total Phases");
			if (totalRaw) {
				const totalPhases = parseInt(totalRaw, 10);
				if (totalPhases > 0) {
					const newPercent = Math.round((newCompleted / totalPhases) * 100);
					stateContent =
						stateReplaceField(stateContent, "Progress", `${newPercent}%`) ??
						stateContent;
					stateContent = stateContent.replace(
						/(percent:\s*)\d+/,
						`$1${newPercent}`,
					);
				}
			}
		}
		writeStateMd(statePath, stateContent, cwd);
	}

	output(
		{
			completed_phase: phaseNum,
			phase_name: phaseInfo!.phase_name,
			plans_executed: `${summaryCount}/${planCount}`,
			next_phase: nextPhaseNum,
			next_phase_name: nextPhaseName,
			is_last_phase: isLastPhase,
			date: today,
			roadmap_updated: fs.existsSync(roadmapPath),
			state_updated: fs.existsSync(statePath),
			requirements_updated: requirementsUpdated,
			warnings,
			has_warnings: warnings.length > 0,
		},
		raw,
	);
}
