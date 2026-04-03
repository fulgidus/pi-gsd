/**
 * init.ts — Compound init commands for workflow bootstrapping.
 *
 * Each cmdInit* gathers all context needed by a workflow in one call.
 * Ported from lib/init.cjs.
 */

import fs from "fs";
import path from "path";
import {
	checkAgentsInstalled,
	comparePhaseNum,
	findPhaseInternal,
	generateSlugInternal,
	getMilestoneInfo,
	getMilestonePhaseFilter,
	getRoadmapPhaseInternal,
	gsdError,
	loadConfig,
	normalizePhaseName,
	output,
	planningDir,
	planningPaths,
	planningRoot,
	resolveModelInternal,
	stripShippedMilestones,
	toPosixPath,
} from "./core.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLatestCompletedMilestone(
	cwd: string,
): { version: string; name: string } | null {
	const milestonesPath = path.join(planningRoot(cwd), "MILESTONES.md");
	if (!fs.existsSync(milestonesPath)) return null;
	try {
		const content = fs.readFileSync(milestonesPath, "utf-8");
		const match = content.match(/^##\s+(v[\d.]+)\s+(.+?)\s+\(Shipped:/m);
		if (!match) return null;
		return { version: match[1], name: match[2].trim() };
	} catch {
		return null;
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withProjectRoot(
	cwd: string,
	result: Record<string, any>,
): Record<string, any> {
	result.project_root = cwd;
	// For dist build: __dirname is dist/, gsd-tools.js is dist/gsd-tools.js
	// Agents/ is at ../agents relative to dist/
	result.gsd_bin = "dist/gsd-tools.js";
	result.gsd_root = ".";
	result.gsd_harness_dir = ".";
	const agentStatus = checkAgentsInstalled();
	result.agents_installed = agentStatus.agents_installed;
	result.missing_agents = agentStatus.missing_agents;
	return result;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function cmdInitExecutePhase(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	if (!phase) gsdError("phase required for init execute-phase");
	const config = loadConfig(cwd);
	let phaseInfo = findPhaseInternal(cwd, phase!);
	const milestone = getMilestoneInfo(cwd);
	const roadmapPhase = getRoadmapPhaseInternal(cwd, phase!);
	if (!phaseInfo && roadmapPhase?.found) {
		const phaseName = roadmapPhase.phase_name;
		phaseInfo = {
			found: true,
			directory: null!,
			phase_number: roadmapPhase.phase_number,
			phase_name: phaseName,
			phase_slug: phaseName
				? phaseName
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/^-+|-+$/g, "")
				: null,
			plans: [],
			summaries: [],
			incomplete_plans: [],
			has_research: false,
			has_context: false,
			has_verification: false,
			has_reviews: false,
		};
	}
	const reqMatch = roadmapPhase?.section?.match(
		/^\*\*Requirements\*\*:[^\S\n]*([^\n]*)$/m,
	);
	const reqExtracted = reqMatch
		? reqMatch[1]
				.replace(/[[\]]/g, "")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.join(", ")
		: null;
	const result = withProjectRoot(cwd, {
		executor_model: resolveModelInternal(cwd, "gsd-executor"),
		verifier_model: resolveModelInternal(cwd, "gsd-verifier"),
		commit_docs: config.commit_docs,
		sub_repos: config.sub_repos,
		parallelization: config.parallelization,
		context_window: config.context_window,
		branching_strategy: config.branching_strategy,
		phase_branch_template: config.phase_branch_template,
		milestone_branch_template: config.milestone_branch_template,
		verifier_enabled: config.verifier,
		phase_found: !!phaseInfo,
		phase_dir: phaseInfo?.directory ?? null,
		phase_number: phaseInfo?.phase_number ?? null,
		phase_name: phaseInfo?.phase_name ?? null,
		phase_slug: phaseInfo?.phase_slug ?? null,
		phase_req_ids: reqExtracted && reqExtracted !== "TBD" ? reqExtracted : null,
		plans: phaseInfo?.plans ?? [],
		summaries: phaseInfo?.summaries ?? [],
		incomplete_plans: phaseInfo?.incomplete_plans ?? [],
		has_research: phaseInfo?.has_research ?? false,
		has_context: phaseInfo?.has_context ?? false,
		has_verification: phaseInfo?.has_verification ?? false,
		has_reviews: phaseInfo?.has_reviews ?? false,
		roadmap_goal: roadmapPhase?.goal ?? null,
		roadmap_section: roadmapPhase?.section ?? null,
		milestone_version: milestone.version,
		milestone_name: milestone.name,
	});
	output(result, raw);
}

export function cmdInitPlanPhase(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	if (!phase) gsdError("phase required for init plan-phase");
	const config = loadConfig(cwd);
	const phaseInfo = findPhaseInternal(cwd, phase!);
	const roadmapPhase = getRoadmapPhaseInternal(cwd, phase!);
	const milestone = getMilestoneInfo(cwd);
	const result = withProjectRoot(cwd, {
		planner_model: resolveModelInternal(cwd, "gsd-planner"),
		researcher_model: resolveModelInternal(cwd, "gsd-phase-researcher"),
		synthesizer_model: resolveModelInternal(cwd, "gsd-research-synthesizer"),
		commit_docs: config.commit_docs,
		research_enabled: config.research,
		plan_checker_enabled: config.plan_checker,
		context_window: config.context_window,
		phase_found: !!phaseInfo,
		phase_dir: phaseInfo?.directory ?? null,
		phase_number: phaseInfo?.phase_number ?? null,
		phase_name: phaseInfo?.phase_name ?? null,
		roadmap_goal: roadmapPhase?.goal ?? null,
		roadmap_section: roadmapPhase?.section ?? null,
		milestone_version: milestone.version,
		milestone_name: milestone.name,
	});
	output(result, raw);
}

export function cmdInitNewProject(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const planningBase = planningRoot(cwd);
	const result = withProjectRoot(cwd, {
		planner_model: resolveModelInternal(cwd, "gsd-planner"),
		roadmapper_model: resolveModelInternal(cwd, "gsd-roadmapper"),
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		planning_exists: fs.existsSync(planningBase),
		project_exists: fs.existsSync(path.join(planningBase, "PROJECT.md")),
		config_exists: fs.existsSync(path.join(planningBase, "config.json")),
		roadmap_exists: fs.existsSync(path.join(planningBase, "ROADMAP.md")),
		state_exists: fs.existsSync(path.join(planningBase, "STATE.md")),
	});
	output(result, raw);
}

export function cmdInitNewMilestone(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const milestone = getMilestoneInfo(cwd);
	const lastCompleted = getLatestCompletedMilestone(cwd);
	const result = withProjectRoot(cwd, {
		roadmapper_model: resolveModelInternal(cwd, "gsd-roadmapper"),
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		current_milestone: milestone,
		last_completed_milestone: lastCompleted,
		roadmap_exists: fs.existsSync(planningPaths(cwd).roadmap),
	});
	output(result, raw);
}

export function cmdInitQuick(
	cwd: string,
	description: string | undefined,
	raw: boolean,
): void {
	const config = loadConfig(cwd);
	const milestone = getMilestoneInfo(cwd);
	const result = withProjectRoot(cwd, {
		executor_model: resolveModelInternal(cwd, "gsd-executor"),
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		branching_strategy: config.branching_strategy,
		quick_branch_template: config.quick_branch_template,
		description: description || null,
		milestone_version: milestone.version,
		milestone_name: milestone.name,
		state_exists: fs.existsSync(planningPaths(cwd).state),
	});
	output(result, raw);
}

export function cmdInitResume(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const milestone = getMilestoneInfo(cwd);
	const stateExists = fs.existsSync(planningPaths(cwd).state);
	let stateContent = "";
	if (stateExists) {
		try {
			stateContent = fs.readFileSync(planningPaths(cwd).state, "utf-8");
		} catch {
			/* ok */
		}
	}
	const result = withProjectRoot(cwd, {
		executor_model: resolveModelInternal(cwd, "gsd-executor"),
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		state_exists: stateExists,
		state_raw: stateContent,
		roadmap_exists: fs.existsSync(planningPaths(cwd).roadmap),
		config_exists: fs.existsSync(planningPaths(cwd).config),
		milestone_version: milestone.version,
		milestone_name: milestone.name,
	});
	output(result, raw);
}

export function cmdInitVerifyWork(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	if (!phase) gsdError("phase required for init verify-work");
	const config = loadConfig(cwd);
	const phaseInfo = findPhaseInternal(cwd, phase!);
	const roadmapPhase = getRoadmapPhaseInternal(cwd, phase!);
	const result = withProjectRoot(cwd, {
		verifier_model: resolveModelInternal(cwd, "gsd-verifier"),
		nyquist_model: resolveModelInternal(cwd, "gsd-nyquist-auditor"),
		commit_docs: config.commit_docs,
		nyquist_validation: config.nyquist_validation,
		context_window: config.context_window,
		phase_found: !!phaseInfo,
		phase_dir: phaseInfo?.directory ?? null,
		phase_number: phaseInfo?.phase_number ?? null,
		phase_name: phaseInfo?.phase_name ?? null,
		plans: phaseInfo?.plans ?? [],
		summaries: phaseInfo?.summaries ?? [],
		roadmap_goal: roadmapPhase?.goal ?? null,
	});
	output(result, raw);
}

export function cmdInitPhaseOp(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	const config = loadConfig(cwd);
	const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
	const milestone = getMilestoneInfo(cwd);
	const result = withProjectRoot(cwd, {
		planner_model: resolveModelInternal(cwd, "gsd-planner"),
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		phase_found: !!phaseInfo,
		phase_dir: phaseInfo?.directory ?? null,
		phase_number: phaseInfo?.phase_number ?? null,
		phase_name: phaseInfo?.phase_name ?? null,
		milestone_version: milestone.version,
		milestone_name: milestone.name,
	});
	output(result, raw);
}

export function cmdInitTodos(
	cwd: string,
	area: string | undefined,
	raw: boolean,
): void {
	const config = loadConfig(cwd);
	const pendingDir = path.join(planningDir(cwd), "todos", "pending");
	const todos: unknown[] = [];
	if (fs.existsSync(pendingDir)) {
		try {
			for (const file of fs
				.readdirSync(pendingDir)
				.filter((f) => f.endsWith(".md"))) {
				try {
					const content = fs.readFileSync(path.join(pendingDir, file), "utf-8");
					const titleMatch = content.match(/^title:\s*(.+)$/m),
						areaMatch = content.match(/^area:\s*(.+)$/m);
					const todoArea = areaMatch ? areaMatch[1].trim() : "general";
					if (area && todoArea !== area) continue;
					todos.push({
						file,
						title: titleMatch ? titleMatch[1].trim() : "Untitled",
						area: todoArea,
					});
				} catch {
					/* ok */
				}
			}
		} catch {
			/* ok */
		}
	}
	const result = withProjectRoot(cwd, {
		executor_model: resolveModelInternal(cwd, "gsd-executor"),
		commit_docs: config.commit_docs,
		todos,
		todo_count: todos.length,
		area: area ?? null,
	});
	output(result, raw);
}

export function cmdInitMilestoneOp(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const milestone = getMilestoneInfo(cwd);
	const lastCompleted = getLatestCompletedMilestone(cwd);
	const result = withProjectRoot(cwd, {
		planner_model: resolveModelInternal(cwd, "gsd-planner"),
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		milestone_version: milestone.version,
		milestone_name: milestone.name,
		last_completed_milestone: lastCompleted,
		roadmap_exists: fs.existsSync(planningPaths(cwd).roadmap),
		state_exists: fs.existsSync(planningPaths(cwd).state),
	});
	output(result, raw);
}

export function cmdInitMapCodebase(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const result = withProjectRoot(cwd, {
		mapper_model: resolveModelInternal(cwd, "gsd-codebase-mapper"),
		commit_docs: config.commit_docs,
		search_gitignored: config.search_gitignored,
		context_window: config.context_window,
		project_exists: fs.existsSync(path.join(planningRoot(cwd), "PROJECT.md")),
	});
	output(result, raw);
}

export function cmdInitProgress(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const milestone = getMilestoneInfo(cwd);
	const isDirInMilestone = getMilestonePhaseFilter(cwd);
	const phasesDir = planningPaths(cwd).phases;
	let totalPlans = 0,
		totalSummaries = 0,
		phaseCount = 0;
	if (fs.existsSync(phasesDir)) {
		try {
			const dirs = fs
				.readdirSync(phasesDir, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name)
				.filter(isDirInMilestone);
			phaseCount = dirs.length;
			for (const dir of dirs) {
				const files = fs.readdirSync(path.join(phasesDir, dir));
				totalPlans += files.filter((f) => f.match(/-PLAN\.md$/i)).length;
				totalSummaries += files.filter((f) => f.match(/-SUMMARY\.md$/i)).length;
			}
		} catch {
			/* ok */
		}
	}
	const result = withProjectRoot(cwd, {
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		milestone_version: milestone.version,
		milestone_name: milestone.name,
		phase_count: phaseCount,
		total_plans: totalPlans,
		total_summaries: totalSummaries,
		percent:
			totalPlans > 0
				? Math.min(100, Math.round((totalSummaries / totalPlans) * 100))
				: 0,
	});
	output(result, raw);
}

export function cmdInitManager(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const milestone = getMilestoneInfo(cwd);
	const result = withProjectRoot(cwd, {
		planner_model: resolveModelInternal(cwd, "gsd-planner"),
		roadmapper_model: resolveModelInternal(cwd, "gsd-roadmapper"),
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		milestone_version: milestone.version,
		milestone_name: milestone.name,
		state_exists: fs.existsSync(planningPaths(cwd).state),
		roadmap_exists: fs.existsSync(planningPaths(cwd).roadmap),
	});
	output(result, raw);
}

// ─── Workspace / workstream init variants ────────────────────────────────────

export function cmdInitNewWorkspace(cwd: string, raw: boolean): void {
	const config = loadConfig(cwd);
	const wsRoot = path.join(planningRoot(cwd), "workstreams");
	const result = withProjectRoot(cwd, {
		commit_docs: config.commit_docs,
		context_window: config.context_window,
		workstream_mode: fs.existsSync(wsRoot),
		workstreams: fs.existsSync(wsRoot)
			? fs
					.readdirSync(wsRoot, { withFileTypes: true })
					.filter((e) => e.isDirectory())
					.map((e) => e.name)
			: [],
	});
	output(result, raw);
}

export function cmdInitListWorkspaces(cwd: string, raw: boolean): void {
	const wsRoot = path.join(planningRoot(cwd), "workstreams");
	if (!fs.existsSync(wsRoot)) {
		output(
			withProjectRoot(cwd, { mode: "flat", workstreams: [], count: 0 }),
			raw,
		);
		return;
	}
	const workstreams = fs
		.readdirSync(wsRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name);
	output(
		withProjectRoot(cwd, {
			mode: "workstream",
			workstreams,
			count: workstreams.length,
		}),
		raw,
	);
}

export function cmdInitRemoveWorkspace(
	cwd: string,
	name: string | undefined,
	raw: boolean,
): void {
	if (!name) gsdError("workstream name required for init remove-workspace");
	const wsDir = path.join(planningRoot(cwd), "workstreams", name!);
	if (!fs.existsSync(wsDir)) {
		output(
			withProjectRoot(cwd, {
				removed: false,
				reason: "not_found",
				workstream: name,
			}),
			raw,
		);
		return;
	}
	try {
		fs.rmSync(wsDir, { recursive: true, force: true });
	} catch (e) {
		output(
			withProjectRoot(cwd, {
				removed: false,
				reason: (e as Error).message,
				workstream: name,
			}),
			raw,
		);
		return;
	}
	output(withProjectRoot(cwd, { removed: true, workstream: name }), raw);
}

// ─── cmdAgentSkills ───────────────────────────────────────────────────────────

export function cmdAgentSkills(
	cwd: string,
	agentType: string | undefined,
	raw: boolean,
): void {
	if (!agentType) gsdError("agent-type required");
	const config = loadConfig(cwd);
	const agentSkills =
		(config.agent_skills as Record<string, unknown>)[agentType!] ?? {};
	output(
		{ agent: agentType, skills: agentSkills },
		raw,
		JSON.stringify(agentSkills),
	);
}
