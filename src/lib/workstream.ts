/**
 * workstream.ts — CRUD operations for workstream namespacing.
 */

import fs from "fs";
import path from "path";
import {
	filterPlanFiles,
	filterSummaryFiles,
	generateSlugInternal,
	getActiveWorkstream,
	getMilestoneInfo,
	gsdError,
	output,
	planningPaths,
	planningRoot,
	readSubdirectories,
	setActiveWorkstream,
	toPosixPath,
} from "./core.js";
import { stateExtractField } from "./state.js";

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateToWorkstreams(
	cwd: string,
	workstreamName: string,
): { migrated: boolean; workstream: string; files_moved: string[] } {
	if (
		!workstreamName ||
		/[/\\]/.test(workstreamName) ||
		workstreamName === "." ||
		workstreamName === ".."
	)
		throw new Error("Invalid workstream name for migration");
	const baseDir = planningRoot(cwd);
	const wsDir = path.join(baseDir, "workstreams", workstreamName);
	if (fs.existsSync(path.join(baseDir, "workstreams")))
		throw new Error(
			"Already in workstream mode - .planning/workstreams/ exists",
		);
	const toMove = [
		{ name: "ROADMAP.md", type: "file" },
		{ name: "STATE.md", type: "file" },
		{ name: "REQUIREMENTS.md", type: "file" },
		{ name: "phases", type: "dir" },
	];
	fs.mkdirSync(wsDir, { recursive: true });
	const filesMoved: string[] = [];
	try {
		for (const item of toMove) {
			const src = path.join(baseDir, item.name);
			if (fs.existsSync(src)) {
				fs.renameSync(src, path.join(wsDir, item.name));
				filesMoved.push(item.name);
			}
		}
	} catch (err) {
		for (const name of filesMoved) {
			try {
				fs.renameSync(path.join(wsDir, name), path.join(baseDir, name));
			} catch {
				/* ok */
			}
		}
		try {
			fs.rmSync(wsDir, { recursive: true });
		} catch {
			/* ok */
		}
		try {
			fs.rmdirSync(path.join(baseDir, "workstreams"));
		} catch {
			/* ok */
		}
		throw err;
	}
	return {
		migrated: true,
		workstream: workstreamName,
		files_moved: filesMoved,
	};
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function cmdWorkstreamCreate(
	cwd: string,
	name: string | undefined,
	options: { migrate?: boolean; migrateName?: string | null },
	raw: boolean,
): void {
	if (!name)
		gsdError("workstream name required. Usage: workstream create <name>");
	const slug = name!
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug)
		gsdError(
			"Invalid workstream name - must contain at least one alphanumeric character",
		);
	const baseDir = planningRoot(cwd);
	if (!fs.existsSync(baseDir))
		gsdError(".planning/ directory not found - run /gsd-new-project first");
	const wsRoot = path.join(baseDir, "workstreams"),
		wsDir = path.join(wsRoot, slug);
	if (fs.existsSync(wsDir) && fs.existsSync(path.join(wsDir, "STATE.md"))) {
		output(
			{
				created: false,
				error: "already_exists",
				workstream: slug,
				path: toPosixPath(path.relative(cwd, wsDir)),
			},
			raw,
		);
		return;
	}
	const isFlatMode = !fs.existsSync(wsRoot);
	let migration = null;
	if (isFlatMode && options.migrate !== false) {
		const hasExistingWork =
			fs.existsSync(path.join(baseDir, "ROADMAP.md")) ||
			fs.existsSync(path.join(baseDir, "STATE.md")) ||
			fs.existsSync(path.join(baseDir, "phases"));
		if (hasExistingWork) {
			const migrateName = options.migrateName ?? null;
			let existingWsName: string;
			if (migrateName) {
				existingWsName = migrateName;
			} else {
				try {
					const ms = getMilestoneInfo(cwd);
					existingWsName = generateSlugInternal(ms.name) || "default";
				} catch {
					existingWsName = "default";
				}
			}
			try {
				migration = migrateToWorkstreams(cwd, existingWsName);
			} catch (e) {
				output(
					{
						created: false,
						error: "migration_failed",
						message: (e as Error).message,
					},
					raw,
				);
				return;
			}
		} else {
			fs.mkdirSync(wsRoot, { recursive: true });
		}
	}
	fs.mkdirSync(wsDir, { recursive: true });
	fs.mkdirSync(path.join(wsDir, "phases"), { recursive: true });
	const today = new Date().toISOString().split("T")[0];
	const stateContent = [
		"---",
		`workstream: ${slug}`,
		`created: ${today}`,
		"---",
		"",
		"# Project State",
		"",
		"## Current Position",
		"**Status:** Not started",
		"**Current Phase:** None",
		`**Last Activity:** ${today}`,
		"**Last Activity Description:** Workstream created",
		"",
		"## Progress",
		"**Phases Complete:** 0",
		"**Current Plan:** N/A",
		"",
		"## Session Continuity",
		"**Stopped At:** N/A",
		"**Resume File:** None",
		"",
	].join("\n");
	const statePath = path.join(wsDir, "STATE.md");
	if (!fs.existsSync(statePath))
		fs.writeFileSync(statePath, stateContent, "utf-8");
	setActiveWorkstream(cwd, slug);
	const relPath = toPosixPath(path.relative(cwd, wsDir));
	output(
		{
			created: true,
			workstream: slug,
			path: relPath,
			state_path: relPath + "/STATE.md",
			phases_path: relPath + "/phases",
			migration: migration ?? null,
			active: true,
		},
		raw,
	);
}

export function cmdWorkstreamList(cwd: string, raw: boolean): void {
	const wsRoot = path.join(planningRoot(cwd), "workstreams");
	if (!fs.existsSync(wsRoot)) {
		output(
			{
				mode: "flat",
				workstreams: [],
				message: "No workstreams - operating in flat mode",
			},
			raw,
		);
		return;
	}
	const workstreams: unknown[] = [];
	for (const entry of fs
		.readdirSync(wsRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory())) {
		const wsDir = path.join(wsRoot, entry.name),
			phasesDir = path.join(wsDir, "phases");
		const phaseDirs = readSubdirectories(phasesDir);
		let completedCount = 0;
		for (const d of phaseDirs) {
			try {
				const fs2 = fs.readdirSync(path.join(phasesDir, d));
				const pl = filterPlanFiles(fs2),
					su = filterSummaryFiles(fs2);
				if (pl.length > 0 && su.length >= pl.length) completedCount++;
			} catch {
				/* ok */
			}
		}
		let status = "unknown",
			currentPhase = null;
		try {
			const sc = fs.readFileSync(path.join(wsDir, "STATE.md"), "utf-8");
			status = stateExtractField(sc, "Status") || "unknown";
			currentPhase = stateExtractField(sc, "Current Phase");
		} catch {
			/* ok */
		}
		workstreams.push({
			name: entry.name,
			path: toPosixPath(path.relative(cwd, wsDir)),
			has_roadmap: fs.existsSync(path.join(wsDir, "ROADMAP.md")),
			has_state: fs.existsSync(path.join(wsDir, "STATE.md")),
			status,
			current_phase: currentPhase,
			phase_count: phaseDirs.length,
			completed_phases: completedCount,
		});
	}
	output({ mode: "workstream", workstreams, count: workstreams.length }, raw);
}

export function cmdWorkstreamStatus(
	cwd: string,
	name: string | undefined,
	raw: boolean,
): void {
	if (!name)
		gsdError("workstream name required. Usage: workstream status <name>");
	if (/[/\\]/.test(name!) || name === "." || name === "..")
		gsdError("Invalid workstream name");
	const wsDir = path.join(planningRoot(cwd), "workstreams", name!);
	if (!fs.existsSync(wsDir)) {
		output({ found: false, workstream: name }, raw);
		return;
	}
	const p = planningPaths(cwd, name);
	const files = {
		roadmap: fs.existsSync(p.roadmap),
		state: fs.existsSync(p.state),
		requirements: fs.existsSync(p.requirements),
	};
	const phases: unknown[] = [];
	for (const dir of readSubdirectories(p.phases).sort()) {
		try {
			const pf = fs.readdirSync(path.join(p.phases, dir));
			const pl = filterPlanFiles(pf),
				su = filterSummaryFiles(pf);
			phases.push({
				directory: dir,
				status:
					su.length >= pl.length && pl.length > 0
						? "complete"
						: pl.length > 0
							? "in_progress"
							: "pending",
				plan_count: pl.length,
				summary_count: su.length,
			});
		} catch {
			/* ok */
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let stateInfo: any = {};
	try {
		const sc = fs.readFileSync(p.state, "utf-8");
		stateInfo = {
			status: stateExtractField(sc, "Status") || "unknown",
			current_phase: stateExtractField(sc, "Current Phase"),
			last_activity: stateExtractField(sc, "Last Activity"),
		};
	} catch {
		/* ok */
	}
	output(
		{
			found: true,
			workstream: name,
			path: toPosixPath(path.relative(cwd, wsDir)),
			files,
			phases,
			phase_count: phases.length,
			completed_phases: (phases as { status: string }[]).filter(
				(ph) => ph.status === "complete",
			).length,
			...stateInfo,
		},
		raw,
	);
}

export function cmdWorkstreamComplete(
	cwd: string,
	name: string | undefined,
	options: Record<string, unknown>,
	raw: boolean,
): void {
	if (!name)
		gsdError("workstream name required. Usage: workstream complete <name>");
	if (/[/\\]/.test(name!) || name === "." || name === "..")
		gsdError("Invalid workstream name");
	const root = planningRoot(cwd),
		wsRoot = path.join(root, "workstreams"),
		wsDir = path.join(wsRoot, name!);
	if (!fs.existsSync(wsDir)) {
		output({ completed: false, error: "not_found", workstream: name }, raw);
		return;
	}
	const active = getActiveWorkstream(cwd);
	if (active === name) setActiveWorkstream(cwd, null);
	const archiveDir = path.join(root, "milestones");
	const today = new Date().toISOString().split("T")[0];
	let archivePath = path.join(archiveDir, `ws-${name}-${today}`);
	let suffix = 1;
	while (fs.existsSync(archivePath))
		archivePath = path.join(archiveDir, `ws-${name}-${today}-${suffix++}`);
	fs.mkdirSync(archivePath, { recursive: true });
	const filesMoved: string[] = [];
	try {
		for (const entry of fs.readdirSync(wsDir, { withFileTypes: true })) {
			fs.renameSync(
				path.join(wsDir, entry.name),
				path.join(archivePath, entry.name),
			);
			filesMoved.push(entry.name);
		}
	} catch (err) {
		for (const fname of filesMoved) {
			try {
				fs.renameSync(path.join(archivePath, fname), path.join(wsDir, fname));
			} catch {
				/* ok */
			}
		}
		try {
			fs.rmSync(archivePath, { recursive: true });
		} catch {
			/* ok */
		}
		if (active === name) setActiveWorkstream(cwd, name);
		output(
			{
				completed: false,
				error: "archive_failed",
				message: (err as Error).message,
				workstream: name,
			},
			raw,
		);
		return;
	}
	try {
		fs.rmdirSync(wsDir);
	} catch {
		/* ok */
	}
	let remainingWs = 0;
	try {
		remainingWs = fs
			.readdirSync(wsRoot, { withFileTypes: true })
			.filter((e) => e.isDirectory()).length;
		if (remainingWs === 0) fs.rmdirSync(wsRoot);
	} catch {
		/* ok */
	}
	output(
		{
			completed: true,
			workstream: name,
			archived_to: toPosixPath(path.relative(cwd, archivePath)),
			remaining_workstreams: remainingWs,
			reverted_to_flat: remainingWs === 0,
		},
		raw,
	);
}

export function cmdWorkstreamSet(
	cwd: string,
	name: string | undefined,
	raw: boolean,
): void {
	if (!name) {
		setActiveWorkstream(cwd, null);
		output({ active: null, cleared: true }, raw);
		return;
	}
	if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
		output(
			{
				active: null,
				error: "invalid_name",
				message:
					"Workstream name must be alphanumeric, hyphens, and underscores only",
			},
			raw,
		);
		return;
	}
	const wsDir = path.join(planningRoot(cwd), "workstreams", name);
	if (!fs.existsSync(wsDir)) {
		output({ active: null, error: "not_found", workstream: name }, raw);
		return;
	}
	setActiveWorkstream(cwd, name);
	output({ active: name, set: true }, raw, name);
}

export function cmdWorkstreamGet(cwd: string, raw: boolean): void {
	const active = getActiveWorkstream(cwd);
	const wsRoot = path.join(planningRoot(cwd), "workstreams");
	output(
		{ active, mode: fs.existsSync(wsRoot) ? "workstream" : "flat" },
		raw,
		active || "none",
	);
}

export function cmdWorkstreamProgress(cwd: string, raw: boolean): void {
	const root = planningRoot(cwd),
		wsRoot = path.join(root, "workstreams");
	if (!fs.existsSync(wsRoot)) {
		output(
			{
				mode: "flat",
				workstreams: [],
				message: "No workstreams - operating in flat mode",
			},
			raw,
		);
		return;
	}
	const active = getActiveWorkstream(cwd);
	const workstreams: unknown[] = [];
	for (const entry of fs
		.readdirSync(wsRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory())) {
		const wsDir = path.join(wsRoot, entry.name),
			phasesDir = path.join(wsDir, "phases");
		const phaseDirs = readSubdirectories(phasesDir);
		let completedCount = 0,
			totalPlans = 0,
			completedPlans = 0;
		for (const d of phaseDirs) {
			try {
				const pf = fs.readdirSync(path.join(phasesDir, d));
				const pl = filterPlanFiles(pf),
					su = filterSummaryFiles(pf);
				totalPlans += pl.length;
				completedPlans += Math.min(su.length, pl.length);
				if (pl.length > 0 && su.length >= pl.length) completedCount++;
			} catch {
				/* ok */
			}
		}
		let roadmapPhaseCount = phaseDirs.length;
		try {
			const rc = fs.readFileSync(path.join(wsDir, "ROADMAP.md"), "utf-8");
			const pm = rc.match(/^###?\s+Phase\s+\d/gm);
			if (pm) roadmapPhaseCount = pm.length;
		} catch {
			/* ok */
		}
		let status = "unknown",
			currentPhase = null;
		try {
			const sc = fs.readFileSync(path.join(wsDir, "STATE.md"), "utf-8");
			status = stateExtractField(sc, "Status") || "unknown";
			currentPhase = stateExtractField(sc, "Current Phase");
		} catch {
			/* ok */
		}
		workstreams.push({
			name: entry.name,
			active: entry.name === active,
			status,
			current_phase: currentPhase,
			phases: `${completedCount}/${roadmapPhaseCount}`,
			plans: `${completedPlans}/${totalPlans}`,
			progress_percent:
				roadmapPhaseCount > 0
					? Math.round((completedCount / roadmapPhaseCount) * 100)
					: 0,
		});
	}
	output(
		{ mode: "workstream", active, workstreams, count: workstreams.length },
		raw,
	);
}
