/**
 * core.ts - Shared utilities, path helpers, config loading, git helpers.
 *
 * Ported from lib/core.cjs. All functions preserve their original signatures.
 */

import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { MODEL_PROFILES } from "./model-profiles.js";

export { MODEL_PROFILES };

// ─── Types ────────────────────────────────────────────────────────────────────

export type PhaseNamingMode = "sequential" | "custom";
export type ModelProfile = "quality" | "balanced" | "budget" | "inherit";
export type ResolveModelIds = false | true | "omit";

export interface GSDConfig {
	model_profile: ModelProfile;
	commit_docs: boolean;
	search_gitignored: boolean;
	branching_strategy: "none" | "phase" | "milestone" | "workstream";
	phase_branch_template: string;
	milestone_branch_template: string;
	quick_branch_template: string | null;
	research: boolean;
	plan_checker: boolean;
	verifier: boolean;
	nyquist_validation: boolean;
	parallelization: boolean;
	brave_search: boolean;
	firecrawl: boolean;
	exa_search: boolean;
	text_mode: boolean;
	sub_repos: string[];
	resolve_model_ids: ResolveModelIds;
	context_window: number;
	phase_naming: PhaseNamingMode;
	model_overrides: Record<string, string> | null;
	agent_skills: Record<string, unknown>;
}

export interface PlanningPaths {
	planning: string;
	state: string;
	roadmap: string;
	project: string;
	config: string;
	phases: string;
	requirements: string;
}

export interface PhaseSearchResult {
	found: true;
	directory: string;
	phase_number: string;
	phase_name: string | null;
	phase_slug: string | null;
	plans: string[];
	summaries: string[];
	incomplete_plans: string[];
	has_research: boolean;
	has_context: boolean;
	has_verification: boolean;
	has_reviews: boolean;
	archived?: string;
}

export interface ArchivedPhaseEntry {
	name: string;
	milestone: string;
	basePath: string;
	fullPath: string;
}

export interface MilestoneInfo {
	version: string;
	name: string;
}

export interface RoadmapPhaseResult {
	found: true;
	phase_number: string;
	phase_name: string;
	goal: string | null;
	section: string;
}

export interface GitResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface PhaseFileStats {
	plans: string[];
	summaries: string[];
	hasResearch: boolean;
	hasContext: boolean;
	hasVerification: boolean;
	hasReviews: boolean;
}

export interface AgentsInstallStatus {
	agents_installed: boolean;
	missing_agents: string[];
	installed_agents: string[];
	agents_dir: string;
}

export interface ReapOptions {
	maxAgeMs?: number;
	dirsOnly?: boolean;
}

// ─── Model alias map ──────────────────────────────────────────────────────────

export const MODEL_ALIAS_MAP: Record<string, string> = {
	opus: "claude-opus-4-6",
	sonnet: "claude-sonnet-4-6",
	haiku: "claude-haiku-4-5",
};

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function toPosixPath(p: string): string {
	return p.split(path.sep).join("/");
}

export function detectSubRepos(cwd: string): string[] {
	const results: string[] = [];
	try {
		const entries = fs.readdirSync(cwd, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const gitPath = path.join(cwd, entry.name, ".git");
			try {
				if (fs.existsSync(gitPath)) results.push(entry.name);
			} catch {
				/* ok */
			}
		}
	} catch {
		/* ok */
	}
	return results.sort();
}

export function findProjectRoot(startDir: string): string {
	const resolved = path.resolve(startDir);
	const root = path.parse(resolved).root;
	const homedir = os.homedir();

	const ownPlanning = path.join(resolved, ".planning");
	if (fs.existsSync(ownPlanning) && fs.statSync(ownPlanning).isDirectory()) {
		return startDir;
	}

	function isInsideGitRepo(candidateParent: string): boolean {
		let d = resolved;
		while (d !== root) {
			if (fs.existsSync(path.join(d, ".git"))) return true;
			if (d === candidateParent) break;
			d = path.dirname(d);
		}
		return false;
	}

	let dir = resolved;
	while (dir !== root) {
		const parent = path.dirname(dir);
		if (parent === dir) break;
		if (parent === homedir) break;

		const parentPlanning = path.join(parent, ".planning");
		if (
			fs.existsSync(parentPlanning) &&
			fs.statSync(parentPlanning).isDirectory()
		) {
			const configPath = path.join(parentPlanning, "config.json");
			try {
				const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
				const subRepos: string[] =
					cfg.sub_repos || cfg.planning?.sub_repos || [];
				if (Array.isArray(subRepos) && subRepos.length > 0) {
					const relPath = path.relative(parent, resolved);
					const topSegment = relPath.split(path.sep)[0];
					if (subRepos.includes(topSegment)) return parent;
				}
				if (cfg.multiRepo === true && isInsideGitRepo(parent)) return parent;
			} catch {
				/* fall through to heuristic */
			}
			if (isInsideGitRepo(parent)) return parent;
		}
		dir = parent;
	}
	return startDir;
}

// ─── Output helpers ───────────────────────────────────────────────────────────

export function reapStaleTempFiles(
	prefix = "gsd-",
	{ maxAgeMs = 5 * 60 * 1000, dirsOnly = false }: ReapOptions = {},
): void {
	try {
		const tmpDir = os.tmpdir();
		const now = Date.now();
		for (const entry of fs.readdirSync(tmpDir)) {
			if (!entry.startsWith(prefix)) continue;
			const fullPath = path.join(tmpDir, entry);
			try {
				const stat = fs.statSync(fullPath);
				if (now - stat.mtimeMs > maxAgeMs) {
					if (stat.isDirectory()) {
						fs.rmSync(fullPath, { recursive: true, force: true });
					} else if (!dirsOnly) {
						fs.unlinkSync(fullPath);
					}
				}
			} catch {
				/* ok */
			}
		}
	} catch {
		/* non-critical */
	}
}

export function output(result: unknown, raw = false, rawValue?: string): void {
	let data: string;
	if (raw && rawValue !== undefined) {
		data = String(rawValue);
	} else {
		const json = JSON.stringify(result, null, 2);
		if (json.length > 50000) {
			reapStaleTempFiles();
			const tmpPath = path.join(os.tmpdir(), `gsd-${Date.now()}.json`);
			fs.writeFileSync(tmpPath, json, "utf-8");
			data = "@file:" + tmpPath;
		} else {
			data = json;
		}
	}
	fs.writeSync(1, data);
}

export function gsdError(message: string): never {
	fs.writeSync(2, "Error: " + message + "\n");
	process.exit(1);
}

// ─── File & Config utilities ──────────────────────────────────────────────────

export function safeReadFile(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

export function loadConfig(cwd: string): GSDConfig {
	const configPath = path.join(cwd, ".planning", "config.json");
	const defaults: GSDConfig = {
		model_profile: "balanced",
		commit_docs: true,
		search_gitignored: false,
		branching_strategy: "none",
		phase_branch_template: "gsd/phase-{phase}-{slug}",
		milestone_branch_template: "gsd/{milestone}-{slug}",
		quick_branch_template: null,
		research: true,
		plan_checker: true,
		verifier: true,
		nyquist_validation: true,
		parallelization: true,
		brave_search: false,
		firecrawl: false,
		exa_search: false,
		text_mode: false,
		sub_repos: [],
		resolve_model_ids: false,
		context_window: 200000,
		phase_naming: "sequential",
		model_overrides: null,
		agent_skills: {},
	};

	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deep config object; full typed refactor tracked in TODO #6
		const parsed: any = JSON.parse(raw);

		// Migrate deprecated "depth" → "granularity"
		if ("depth" in parsed && !("granularity" in parsed)) {
			const map: Record<string, string> = {
				quick: "coarse",
				standard: "standard",
				comprehensive: "fine",
			};
			parsed.granularity = map[parsed.depth] || parsed.depth;
			delete parsed.depth;
			try {
				fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
			} catch {
				/* ok */
			}
		}

		let configDirty = false;

		// Migrate legacy "multiRepo: true" → sub_repos array
		if (
			parsed.multiRepo === true &&
			!parsed.sub_repos &&
			!parsed.planning?.sub_repos
		) {
			const detected = detectSubRepos(cwd);
			if (detected.length > 0) {
				parsed.sub_repos = detected;
				if (!parsed.planning) parsed.planning = {};
				parsed.planning.commit_docs = false;
				delete parsed.multiRepo;
				configDirty = true;
			}
		}

		// Keep sub_repos in sync
		const current: string[] =
			parsed.sub_repos || parsed.planning?.sub_repos || [];
		if (Array.isArray(current) && current.length > 0) {
			const detected = detectSubRepos(cwd);
			if (detected.length > 0) {
				const sorted = [...current].sort();
				if (JSON.stringify(sorted) !== JSON.stringify(detected)) {
					parsed.sub_repos = detected;
					configDirty = true;
				}
			}
		}

		if (configDirty) {
			try {
				fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
			} catch {
				/* ok */
			}
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- local lookup helper; full typed refactor tracked in TODO #6
		function get(
			key: string,
			nested?: { section: string; field: string },
		): any {
			if (parsed[key] !== undefined) return parsed[key];
			if (nested && parsed[nested.section]?.[nested.field] !== undefined) {
				return parsed[nested.section][nested.field];
			}
			return undefined;
		}

		const parallelization = (() => {
			const val = get("parallelization");
			if (typeof val === "boolean") return val;
			if (typeof val === "object" && val !== null && "enabled" in val)
				return Boolean(val.enabled);
			return defaults.parallelization;
		})();

		return {
			model_profile: get("model_profile") ?? defaults.model_profile,
			commit_docs: (() => {
				const explicit = get("commit_docs", {
					section: "planning",
					field: "commit_docs",
				});
				if (explicit !== undefined) return Boolean(explicit);
				if (isGitIgnored(cwd, ".planning/")) return false;
				return defaults.commit_docs;
			})(),
			search_gitignored:
				get("search_gitignored", {
					section: "planning",
					field: "search_gitignored",
				}) ?? defaults.search_gitignored,
			branching_strategy:
				get("branching_strategy", {
					section: "git",
					field: "branching_strategy",
				}) ?? defaults.branching_strategy,
			phase_branch_template:
				get("phase_branch_template", {
					section: "git",
					field: "phase_branch_template",
				}) ?? defaults.phase_branch_template,
			milestone_branch_template:
				get("milestone_branch_template", {
					section: "git",
					field: "milestone_branch_template",
				}) ?? defaults.milestone_branch_template,
			quick_branch_template:
				get("quick_branch_template", {
					section: "git",
					field: "quick_branch_template",
				}) ?? defaults.quick_branch_template,
			research:
				get("research", { section: "workflow", field: "research" }) ??
				defaults.research,
			plan_checker:
				get("plan_checker", { section: "workflow", field: "plan_check" }) ??
				defaults.plan_checker,
			verifier:
				get("verifier", { section: "workflow", field: "verifier" }) ??
				defaults.verifier,
			nyquist_validation:
				get("nyquist_validation", {
					section: "workflow",
					field: "nyquist_validation",
				}) ?? defaults.nyquist_validation,
			parallelization,
			brave_search: get("brave_search") ?? defaults.brave_search,
			firecrawl: get("firecrawl") ?? defaults.firecrawl,
			exa_search: get("exa_search") ?? defaults.exa_search,
			text_mode:
				get("text_mode", { section: "workflow", field: "text_mode" }) ??
				defaults.text_mode,
			sub_repos:
				get("sub_repos", { section: "planning", field: "sub_repos" }) ??
				defaults.sub_repos,
			resolve_model_ids: get("resolve_model_ids") ?? defaults.resolve_model_ids,
			context_window: get("context_window") ?? defaults.context_window,
			phase_naming: get("phase_naming") ?? defaults.phase_naming,
			model_overrides: parsed.model_overrides || null,
			agent_skills: parsed.agent_skills || {},
		};
	} catch {
		return defaults;
	}
}

// ─── Git utilities ─────────────────────────────────────────────────────────────

export function isGitIgnored(cwd: string, targetPath: string): boolean {
	try {
		execFileSync(
			"git",
			["check-ignore", "-q", "--no-index", "--", targetPath],
			{ cwd, stdio: "pipe" },
		);
		return true;
	} catch {
		return false;
	}
}

export function execGit(cwd: string, args: string[]): GitResult {
	const result = spawnSync("git", args, {
		cwd,
		stdio: "pipe",
		encoding: "utf-8",
	});
	return {
		exitCode: result.status ?? 1,
		stdout: (result.stdout ?? "").toString().trim(),
		stderr: (result.stderr ?? "").toString().trim(),
	};
}

// ─── Markdown normalization ───────────────────────────────────────────────────

export function normalizeMd(content: string): string {
	if (!content || typeof content !== "string") return content;
	let text = content.replace(/\r\n/g, "\n");
	const lines = text.split("\n");
	const result: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const prev = i > 0 ? lines[i - 1] : "";
		const prevTrimmed = prev.trimEnd();
		const trimmed = line.trimEnd();

		if (
			/^#{1,6}\s/.test(trimmed) &&
			i > 0 &&
			prevTrimmed !== "" &&
			prevTrimmed !== "---"
		)
			result.push("");
		if (
			/^```/.test(trimmed) &&
			i > 0 &&
			prevTrimmed !== "" &&
			!isInsideFencedBlock(lines, i)
		)
			result.push("");
		if (
			/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) &&
			i > 0 &&
			prevTrimmed !== "" &&
			!/^(\s*[-*+]\s|\s*\d+\.\s)/.test(prev) &&
			prevTrimmed !== "---"
		)
			result.push("");

		result.push(line);

		if (
			/^#{1,6}\s/.test(trimmed) &&
			i < lines.length - 1 &&
			lines[i + 1]?.trimEnd() !== ""
		)
			result.push("");
		if (
			/^```\s*$/.test(trimmed) &&
			isClosingFence(lines, i) &&
			i < lines.length - 1 &&
			lines[i + 1]?.trimEnd() !== ""
		)
			result.push("");
		if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) && i < lines.length - 1) {
			const next = lines[i + 1];
			if (
				next !== undefined &&
				next.trimEnd() !== "" &&
				!/^(\s*[-*+]\s|\s*\d+\.\s)/.test(next) &&
				!/^\s/.test(next)
			)
				result.push("");
		}
	}

	text = result.join("\n");
	text = text.replace(/\n{3,}/g, "\n\n");
	text = text.replace(/\n*$/, "\n");
	return text;
}

function isInsideFencedBlock(lines: string[], i: number): boolean {
	let count = 0;
	for (let j = 0; j < i; j++) if (/^```/.test(lines[j].trimEnd())) count++;
	return count % 2 === 1;
}

function isClosingFence(lines: string[], i: number): boolean {
	let count = 0;
	for (let j = 0; j <= i; j++) if (/^```/.test(lines[j].trimEnd())) count++;
	return count % 2 === 0;
}

// ─── Common path helpers ──────────────────────────────────────────────────────

export function resolveWorktreeRoot(cwd: string): string {
	if (fs.existsSync(path.join(cwd, ".planning"))) return cwd;
	const gitDir = execGit(cwd, ["rev-parse", "--git-dir"]);
	const commonDir = execGit(cwd, ["rev-parse", "--git-common-dir"]);
	if (gitDir.exitCode !== 0 || commonDir.exitCode !== 0) return cwd;
	const gitDirResolved = path.resolve(cwd, gitDir.stdout);
	const commonDirResolved = path.resolve(cwd, commonDir.stdout);
	if (gitDirResolved !== commonDirResolved)
		return path.dirname(commonDirResolved);
	return cwd;
}

export function withPlanningLock<T>(cwd: string, fn: () => T): T {
	const lockPath = path.join(planningDir(cwd), ".lock");
	const lockTimeout = 10000;
	const retryDelay = 100;
	const start = Date.now();

	try {
		fs.mkdirSync(planningDir(cwd), { recursive: true });
	} catch {
		/* ok */
	}

	while (Date.now() - start < lockTimeout) {
		try {
			fs.writeFileSync(
				lockPath,
				JSON.stringify({
					pid: process.pid,
					cwd,
					acquired: new Date().toISOString(),
				}),
				{ flag: "wx" },
			);
			try {
				return fn();
			} finally {
				try {
					fs.unlinkSync(lockPath);
				} catch {
					/* ok */
				}
			}
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code === "EEXIST") {
				try {
					const stat = fs.statSync(lockPath);
					if (Date.now() - stat.mtimeMs > 30000) {
						fs.unlinkSync(lockPath);
						continue;
					}
				} catch {
					continue;
				}
				spawnSync("sleep", ["0.1"], { stdio: "ignore" });
				continue;
			}
			throw err;
		}
	}
	try {
		fs.unlinkSync(lockPath);
	} catch {
		/* ok */
	}
	return fn();
}

export function planningDir(cwd: string, ws?: string): string {
	const activeWs = ws ?? process.env["GSD_WORKSTREAM"] ?? null;
	if (!activeWs) return path.join(cwd, ".planning");
	return path.join(cwd, ".planning", "workstreams", activeWs);
}

export function planningRoot(cwd: string): string {
	return path.join(cwd, ".planning");
}

export function planningPaths(cwd: string, ws?: string): PlanningPaths {
	const base = planningDir(cwd, ws);
	const root = path.join(cwd, ".planning");
	return {
		planning: base,
		state: path.join(base, "STATE.md"),
		roadmap: path.join(base, "ROADMAP.md"),
		project: path.join(root, "PROJECT.md"),
		config: path.join(root, "config.json"),
		phases: path.join(base, "phases"),
		requirements: path.join(base, "REQUIREMENTS.md"),
	};
}

// ─── Active Workstream ────────────────────────────────────────────────────────

export function getActiveWorkstream(cwd: string): string | null {
	const filePath = path.join(planningRoot(cwd), "active-workstream");
	try {
		const name = fs.readFileSync(filePath, "utf-8").trim();
		if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return null;
		if (!fs.existsSync(path.join(planningRoot(cwd), "workstreams", name)))
			return null;
		return name;
	} catch {
		return null;
	}
}

export function setActiveWorkstream(cwd: string, name: string | null): void {
	const filePath = path.join(planningRoot(cwd), "active-workstream");
	if (!name) {
		try {
			fs.unlinkSync(filePath);
		} catch {
			/* ok */
		}
		return;
	}
	if (!/^[a-zA-Z0-9_-]+$/.test(name))
		throw new Error("Invalid workstream name");
	fs.writeFileSync(filePath, name + "\n", "utf-8");
}

// ─── Phase utilities ──────────────────────────────────────────────────────────

export function escapeRegex(value: string | number): string {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizePhaseName(phase: string | number): string {
	const str = String(phase);
	const match = str.match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
	if (match) {
		return (
			match[1].padStart(2, "0") +
			(match[2] ? match[2].toUpperCase() : "") +
			(match[3] || "")
		);
	}
	return str;
}

export function comparePhaseNum(
	a: string | number,
	b: string | number,
): number {
	const pa = String(a).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
	const pb = String(b).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
	if (!pa || !pb) return String(a).localeCompare(String(b));
	const intDiff = parseInt(pa[1], 10) - parseInt(pb[1], 10);
	if (intDiff !== 0) return intDiff;
	const la = (pa[2] || "").toUpperCase(),
		lb = (pb[2] || "").toUpperCase();
	if (la !== lb) {
		if (!la) return -1;
		if (!lb) return 1;
		return la < lb ? -1 : 1;
	}
	const aP = pa[3]
		? pa[3]
				.slice(1)
				.split(".")
				.map((p) => parseInt(p, 10))
		: [];
	const bP = pb[3]
		? pb[3]
				.slice(1)
				.split(".")
				.map((p) => parseInt(p, 10))
		: [];
	if (aP.length === 0 && bP.length > 0) return -1;
	if (bP.length === 0 && aP.length > 0) return 1;
	for (let i = 0; i < Math.max(aP.length, bP.length); i++) {
		const av = Number.isFinite(aP[i]) ? aP[i] : 0;
		const bv = Number.isFinite(bP[i]) ? bP[i] : 0;
		if (av !== bv) return av - bv;
	}
	return 0;
}

export function searchPhaseInDir(
	baseDir: string,
	relBase: string,
	normalized: string,
): PhaseSearchResult | null {
	try {
		const dirs = readSubdirectories(baseDir, true);
		const match = dirs.find(
			(d) =>
				d.startsWith(normalized) ||
				d.toUpperCase().startsWith(normalized.toUpperCase()),
		);
		if (!match) return null;

		const dirMatch =
			match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i) ||
			match.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-(.+)/i) ||
			([null, match, null] as (string | null)[]);
		const phaseNumber = dirMatch?.[1] ?? normalized;
		const phaseName = dirMatch?.[2] || null;
		const phaseDir = path.join(baseDir, match);
		const {
			plans: unsortedPlans,
			summaries: unsortedSummaries,
			hasResearch,
			hasContext,
			hasVerification,
			hasReviews,
		} = getPhaseFileStats(phaseDir);
		const plans = unsortedPlans.sort();
		const summaries = unsortedSummaries.sort();
		const completedPlanIds = new Set(
			summaries.map((s) =>
				s.replace("-SUMMARY.md", "").replace("SUMMARY.md", ""),
			),
		);
		const incompletePlans = plans.filter(
			(p) =>
				!completedPlanIds.has(p.replace("-PLAN.md", "").replace("PLAN.md", "")),
		);

		return {
			found: true,
			directory: toPosixPath(path.join(relBase, match)),
			phase_number: phaseNumber,
			phase_name: phaseName,
			phase_slug: phaseName
				? phaseName
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/^-+|-+$/g, "")
				: null,
			plans,
			summaries,
			incomplete_plans: incompletePlans,
			has_research: hasResearch,
			has_context: hasContext,
			has_verification: hasVerification,
			has_reviews: hasReviews,
		};
	} catch {
		return null;
	}
}

export function findPhaseInternal(
	cwd: string,
	phase: string | null,
): PhaseSearchResult | null {
	if (!phase) return null;
	const phasesDir = path.join(planningDir(cwd), "phases");
	const normalized = normalizePhaseName(phase);
	const relPhasesDir = toPosixPath(path.relative(cwd, phasesDir));
	const current = searchPhaseInDir(phasesDir, relPhasesDir, normalized);
	if (current) return current;

	const milestonesDir = path.join(cwd, ".planning", "milestones");
	if (!fs.existsSync(milestonesDir)) return null;

	try {
		const archiveDirs = fs
			.readdirSync(milestonesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
			.map((e) => e.name)
			.sort()
			.reverse();

		for (const archiveName of archiveDirs) {
			const version = archiveName.match(/^(v[\d.]+)-phases$/)![1];
			const archivePath = path.join(milestonesDir, archiveName);
			const relBase = ".planning/milestones/" + archiveName;
			const result = searchPhaseInDir(archivePath, relBase, normalized);
			if (result) {
				result.archived = version;
				return result;
			}
		}
	} catch {
		/* ok */
	}
	return null;
}

export function getArchivedPhaseDirs(cwd: string): ArchivedPhaseEntry[] {
	const milestonesDir = path.join(cwd, ".planning", "milestones");
	const results: ArchivedPhaseEntry[] = [];
	if (!fs.existsSync(milestonesDir)) return results;
	try {
		const phaseDirs = fs
			.readdirSync(milestonesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
			.map((e) => e.name)
			.sort()
			.reverse();
		for (const archiveName of phaseDirs) {
			const version = archiveName.match(/^(v[\d.]+)-phases$/)![1];
			const archivePath = path.join(milestonesDir, archiveName);
			for (const dir of readSubdirectories(archivePath, true)) {
				results.push({
					name: dir,
					milestone: version,
					basePath: path.join(".planning", "milestones", archiveName),
					fullPath: path.join(archivePath, dir),
				});
			}
		}
	} catch {
		/* ok */
	}
	return results;
}

// ─── Roadmap milestone scoping ────────────────────────────────────────────────

export function stripShippedMilestones(content: string): string {
	return content.replace(/<details>[\s\S]*?<\/details>/gi, "");
}

export function extractCurrentMilestone(content: string, cwd?: string): string {
	if (!cwd) return stripShippedMilestones(content);
	let version: string | null = null;
	try {
		const statePath = path.join(planningDir(cwd), "STATE.md");
		if (fs.existsSync(statePath)) {
			const stateRaw = fs.readFileSync(statePath, "utf-8");
			const m = stateRaw.match(/^milestone:\s*(.+)/m);
			if (m) version = m[1].trim();
		}
	} catch {
		/* ok */
	}
	if (!version) {
		const inProg = content.match(/🚧\s*\*\*v(\d+\.\d+)\s/);
		if (inProg) version = "v" + inProg[1];
	}
	if (!version) return stripShippedMilestones(content);

	const sectionPattern = new RegExp(
		`(^#{1,3}\\s+.*${escapeRegex(version)}[^\\n]*)`,
		"mi",
	);
	const sectionMatch = content.match(sectionPattern);
	if (!sectionMatch) return stripShippedMilestones(content);

	const sectionStart = sectionMatch.index!;
	const headingLevel = sectionMatch[1].match(/^(#{1,3})\s/)![1].length;
	const restContent = content.slice(sectionStart + sectionMatch[0].length);
	const nextMatch = restContent.match(
		new RegExp(`^#{1,${headingLevel}}\\s+(?:.*v\\d+\\.\\d+|✅|📋|🚧)`, "mi"),
	);
	const sectionEnd = nextMatch
		? sectionStart + sectionMatch[0].length + nextMatch.index!
		: content.length;
	const preamble = content
		.slice(0, sectionStart)
		.replace(/<details>[\s\S]*?<\/details>/gi, "");
	return preamble + content.slice(sectionStart, sectionEnd);
}

export function replaceInCurrentMilestone(
	content: string,
	pattern: RegExp,
	replacement: string | ((substring: string, ...args: unknown[]) => string),
): string {
	const lastDetailsClose = content.lastIndexOf("</details>");
	if (lastDetailsClose === -1)
		return content.replace(pattern, replacement as string);
	const offset = lastDetailsClose + "</details>".length;
	const before = content.slice(0, offset);
	const after = content.slice(offset);
	return before + after.replace(pattern, replacement as string);
}

// ─── Roadmap & model utilities ────────────────────────────────────────────────

export function getRoadmapPhaseInternal(
	cwd: string,
	phaseNum: string | null,
): RoadmapPhaseResult | null {
	if (!phaseNum) return null;
	const roadmapPath = path.join(planningDir(cwd), "ROADMAP.md");
	if (!fs.existsSync(roadmapPath)) return null;
	try {
		const content = extractCurrentMilestone(
			fs.readFileSync(roadmapPath, "utf-8"),
			cwd,
		);
		const phasePattern = new RegExp(
			`#{2,4}\\s*Phase\\s+${escapeRegex(phaseNum)}:\\s*([^\\n]+)`,
			"i",
		);
		const headerMatch = content.match(phasePattern);
		if (!headerMatch) return null;
		const phaseName = headerMatch[1].trim();
		const headerIndex = headerMatch.index!;
		const restOfContent = content.slice(headerIndex);
		const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+[\w]/i);
		const sectionEnd = nextHeaderMatch
			? headerIndex + nextHeaderMatch.index!
			: content.length;
		const section = content.slice(headerIndex, sectionEnd).trim();
		const goalMatch = section.match(
			/\*\*Goal(?:\*\*:|\*?\*?:\*\*)\s*([^\n]+)/i,
		);
		return {
			found: true,
			phase_number: phaseNum.toString(),
			phase_name: phaseName,
			goal: goalMatch ? goalMatch[1].trim() : null,
			section,
		};
	} catch {
		return null;
	}
}

// ─── Agent installation validation ───────────────────────────────────────────

export function getAgentsDir(): string {
	// dist/gsd-tools.js lives at repo root → agents/ is at ../../agents relative to __dirname
	return path.join(__dirname, "..", "..", "agents");
}

export function checkAgentsInstalled(): AgentsInstallStatus {
	const agentsDir = getAgentsDir();
	const expectedAgents = Object.keys(MODEL_PROFILES);
	const installed: string[] = [],
		missing: string[] = [];
	if (!fs.existsSync(agentsDir)) {
		return {
			agents_installed: false,
			missing_agents: expectedAgents,
			installed_agents: [],
			agents_dir: agentsDir,
		};
	}
	for (const agent of expectedAgents) {
		if (fs.existsSync(path.join(agentsDir, `${agent}.md`)))
			installed.push(agent);
		else missing.push(agent);
	}
	return {
		agents_installed: installed.length > 0 && missing.length === 0,
		missing_agents: missing,
		installed_agents: installed,
		agents_dir: agentsDir,
	};
}

// ─── Model alias resolution ───────────────────────────────────────────────────

export function resolveModelInternal(cwd: string, agentType: string): string {
	const config = loadConfig(cwd);
	const override = config.model_overrides?.[agentType];
	if (override) return override;
	if (config.resolve_model_ids === "omit") return "";
	const profile = String(config.model_profile || "balanced").toLowerCase();
	const agentModels = MODEL_PROFILES[agentType];
	if (!agentModels) return "sonnet";
	if (profile === "inherit") return "inherit";
	const alias =
		agentModels[profile as keyof typeof agentModels] ||
		agentModels["balanced"] ||
		"sonnet";
	if (config.resolve_model_ids) return MODEL_ALIAS_MAP[alias] || alias;
	return alias;
}

// ─── Summary body helpers ─────────────────────────────────────────────────────

export function extractOneLinerFromBody(content: string | null): string | null {
	if (!content) return null;
	const body = content.replace(/^---\n[\s\S]*?\n---\n*/, "");
	const match = body.match(/^#[^\n]*\n+\*\*([^*]+)\*\*/m);
	return match ? match[1].trim() : null;
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

export function pathExistsInternal(cwd: string, targetPath: string): boolean {
	const fullPath = path.isAbsolute(targetPath)
		? targetPath
		: path.join(cwd, targetPath);
	try {
		fs.statSync(fullPath);
		return true;
	} catch {
		return false;
	}
}

export function generateSlugInternal(text: string | null): string | null {
	if (!text) return null;
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function getMilestoneInfo(cwd: string): MilestoneInfo {
	try {
		const roadmap = fs.readFileSync(
			path.join(planningDir(cwd), "ROADMAP.md"),
			"utf-8",
		);
		const inProgressMatch = roadmap.match(
			/🚧\s*\*\*v(\d+(?:\.\d+)+)\s+([^*]+)\*\*/,
		);
		if (inProgressMatch)
			return {
				version: "v" + inProgressMatch[1],
				name: inProgressMatch[2].trim(),
			};
		const cleaned = stripShippedMilestones(roadmap);
		const headingMatch = cleaned.match(/## .*v(\d+(?:\.\d+)+)[:\s]+([^\n(]+)/);
		if (headingMatch)
			return { version: "v" + headingMatch[1], name: headingMatch[2].trim() };
		const versionMatch = cleaned.match(/v(\d+(?:\.\d+)+)/);
		return {
			version: versionMatch ? versionMatch[0] : "v1.0",
			name: "milestone",
		};
	} catch {
		return { version: "v1.0", name: "milestone" };
	}
}

export function getMilestonePhaseFilter(
	cwd: string,
): ((dirName: string) => boolean) & { phaseCount: number } {
	const milestonePhaseNums = new Set<string>();
	try {
		const roadmap = extractCurrentMilestone(
			fs.readFileSync(path.join(planningDir(cwd), "ROADMAP.md"), "utf-8"),
			cwd,
		);
		const phasePattern = /#{2,4}\s*Phase\s+([\w][\w.-]*)\s*:/gi;
		let m;
		while ((m = phasePattern.exec(roadmap)) !== null)
			milestonePhaseNums.add(m[1]);
	} catch {
		/* ok */
	}

	if (milestonePhaseNums.size === 0) {
		const passAll = (_dirName: string) => true;
		(passAll as typeof passAll & { phaseCount: number }).phaseCount = 0;
		return passAll as ((dirName: string) => boolean) & { phaseCount: number };
	}

	const normalized = new Set(
		[...milestonePhaseNums].map((n) =>
			(n.replace(/^0+/, "") || "0").toLowerCase(),
		),
	);
	function isDirInMilestone(dirName: string): boolean {
		const m = dirName.match(/^0*(\d+[A-Za-z]?(?:\.\d+)*)/);
		if (m && normalized.has(m[1].toLowerCase())) return true;
		const cust = dirName.match(/^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)/);
		if (cust && normalized.has(cust[1].toLowerCase())) return true;
		return false;
	}
	(
		isDirInMilestone as typeof isDirInMilestone & { phaseCount: number }
	).phaseCount = milestonePhaseNums.size;
	return isDirInMilestone as ((dirName: string) => boolean) & {
		phaseCount: number;
	};
}

// ─── Phase file helpers ───────────────────────────────────────────────────────

export function filterPlanFiles(files: string[]): string[] {
	return files.filter((f) => f.endsWith("-PLAN.md") || f === "PLAN.md");
}

export function filterSummaryFiles(files: string[]): string[] {
	return files.filter((f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md");
}

export function getPhaseFileStats(phaseDir: string): PhaseFileStats {
	const files = fs.readdirSync(phaseDir);
	return {
		plans: filterPlanFiles(files),
		summaries: filterSummaryFiles(files),
		hasResearch: files.some(
			(f) => f.endsWith("-RESEARCH.md") || f === "RESEARCH.md",
		),
		hasContext: files.some(
			(f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md",
		),
		hasVerification: files.some(
			(f) => f.endsWith("-VERIFICATION.md") || f === "VERIFICATION.md",
		),
		hasReviews: files.some(
			(f) => f.endsWith("-REVIEWS.md") || f === "REVIEWS.md",
		),
	};
}

export function readSubdirectories(dirPath: string, sort = false): string[] {
	try {
		const entries = fs.readdirSync(dirPath, { withFileTypes: true });
		const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
		return sort ? dirs.sort((a, b) => comparePhaseNum(a, b)) : dirs;
	} catch {
		return [];
	}
}
