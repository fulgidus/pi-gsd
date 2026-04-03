/**
 * commands.ts — Standalone utility commands.
 *
 * Ported from lib/commands.cjs. All command signatures preserved.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
	comparePhaseNum,
	execGit,
	extractCurrentMilestone,
	extractOneLinerFromBody,
	findPhaseInternal,
	findProjectRoot,
	generateSlugInternal,
	getArchivedPhaseDirs,
	getMilestoneInfo,
	getMilestonePhaseFilter,
	getRoadmapPhaseInternal,
	gsdError,
	isGitIgnored,
	loadConfig,
	normalizePhaseName,
	output,
	planningDir,
	planningPaths,
	resolveModelInternal,
	safeReadFile,
	toPosixPath,
} from "./core.js";
import { extractFrontmatter } from "./frontmatter.js";
import { MODEL_PROFILES } from "./model-profiles.js";
import { sanitizeForPrompt } from "./security.js";

// ─── Utility commands ─────────────────────────────────────────────────────────

export function cmdGenerateSlug(text: string | undefined, raw: boolean): void {
	if (!text) gsdError("text required for slug generation");
	const slug = text!
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	output({ slug }, raw, slug);
}

export function cmdCurrentTimestamp(
	format: string | undefined,
	raw: boolean,
): void {
	const now = new Date();
	let result: string;
	if (format === "date") result = now.toISOString().split("T")[0];
	else if (format === "filename")
		result = now.toISOString().replace(/:/g, "-").replace(/\..+/, "");
	else result = now.toISOString();
	output({ timestamp: result }, raw, result);
}

export function cmdListTodos(
	cwd: string,
	area: string | undefined,
	raw: boolean,
): void {
	const pendingDir = path.join(planningDir(cwd), "todos", "pending");
	let count = 0;
	const todos: unknown[] = [];
	try {
		const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith(".md"));
		for (const file of files) {
			try {
				const content = fs.readFileSync(path.join(pendingDir, file), "utf-8");
				const createdMatch = content.match(/^created:\s*(.+)$/m),
					titleMatch = content.match(/^title:\s*(.+)$/m),
					areaMatch = content.match(/^area:\s*(.+)$/m);
				const todoArea = areaMatch ? areaMatch[1].trim() : "general";
				if (area && todoArea !== area) continue;
				count++;
				todos.push({
					file,
					created: createdMatch ? createdMatch[1].trim() : "unknown",
					title: titleMatch ? titleMatch[1].trim() : "Untitled",
					area: todoArea,
					path: toPosixPath(path.relative(cwd, path.join(pendingDir, file))),
				});
			} catch {
				/* ok */
			}
		}
	} catch {
		/* ok */
	}
	output({ count, todos }, raw, count.toString());
}

export function cmdVerifyPathExists(
	cwd: string,
	targetPath: string | undefined,
	raw: boolean,
): void {
	if (!targetPath) gsdError("path required for verification");
	if (targetPath!.includes("\0")) gsdError("path contains null bytes");
	const fullPath = path.isAbsolute(targetPath!)
		? targetPath!
		: path.join(cwd, targetPath!);
	try {
		const stats = fs.statSync(fullPath);
		output(
			{
				exists: true,
				type: stats.isDirectory()
					? "directory"
					: stats.isFile()
						? "file"
						: "other",
			},
			raw,
			"true",
		);
	} catch {
		output({ exists: false, type: null }, raw, "false");
	}
}

export function cmdHistoryDigest(cwd: string, raw: boolean): void {
	const phasesDir = planningPaths(cwd).phases;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const digest: any = { phases: {}, decisions: [], tech_stack: new Set() };
	const allPhaseDirs: Array<{
		name: string;
		fullPath: string;
		milestone: string | null;
	}> = [];
	for (const a of getArchivedPhaseDirs(cwd))
		allPhaseDirs.push({
			name: a.name,
			fullPath: a.fullPath,
			milestone: a.milestone,
		});
	if (fs.existsSync(phasesDir)) {
		try {
			for (const dir of fs
				.readdirSync(phasesDir, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name)
				.sort()) {
				allPhaseDirs.push({
					name: dir,
					fullPath: path.join(phasesDir, dir),
					milestone: null,
				});
			}
		} catch {
			/* ok */
		}
	}
	if (allPhaseDirs.length === 0) {
		digest.tech_stack = [];
		output(digest, raw);
		return;
	}
	try {
		for (const { name: dir, fullPath: dirPath } of allPhaseDirs) {
			const summaries = fs
				.readdirSync(dirPath)
				.filter((f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md");
			for (const summary of summaries) {
				try {
					const content = fs.readFileSync(path.join(dirPath, summary), "utf-8");
					const fm = extractFrontmatter(content);
					const phaseNum = fm.phase || dir.split("-")[0];
					if (!digest.phases[phaseNum])
						digest.phases[phaseNum] = {
							name: fm.name || dir.split("-").slice(1).join(" ") || "Unknown",
							provides: new Set(),
							affects: new Set(),
							patterns: new Set(),
						};
					if (fm["dependency-graph"]?.provides)
						fm["dependency-graph"].provides.forEach((p: string) =>
							digest.phases[phaseNum].provides.add(p),
						);
					else if (fm.provides)
						fm.provides.forEach((p: string) =>
							digest.phases[phaseNum].provides.add(p),
						);
					if (fm["dependency-graph"]?.affects)
						fm["dependency-graph"].affects.forEach((a: string) =>
							digest.phases[phaseNum].affects.add(a),
						);
					if (fm["patterns-established"])
						fm["patterns-established"].forEach((p: string) =>
							digest.phases[phaseNum].patterns.add(p),
						);
					if (fm["key-decisions"])
						fm["key-decisions"].forEach((d: string) =>
							digest.decisions.push({ phase: phaseNum, decision: d }),
						);
					if (fm["tech-stack"]?.added)
						fm["tech-stack"].added.forEach((t: string | { name: string }) =>
							digest.tech_stack.add(typeof t === "string" ? t : t.name),
						);
				} catch {
					/* ok */
				}
			}
		}
		Object.keys(digest.phases).forEach((p) => {
			digest.phases[p].provides = [...digest.phases[p].provides];
			digest.phases[p].affects = [...digest.phases[p].affects];
			digest.phases[p].patterns = [...digest.phases[p].patterns];
		});
		digest.tech_stack = [...digest.tech_stack];
		output(digest, raw);
	} catch (e) {
		gsdError("Failed to generate history digest: " + (e as Error).message);
	}
}

export function cmdResolveModel(
	cwd: string,
	agentType: string | undefined,
	raw: boolean,
): void {
	if (!agentType) gsdError("agent-type required");
	const config = loadConfig(cwd);
	const model = resolveModelInternal(cwd, agentType!);
	const agentModels = MODEL_PROFILES[agentType!];
	output(
		agentModels
			? { model, profile: config.model_profile }
			: { model, profile: config.model_profile, unknown_agent: true },
		raw,
		model,
	);
}

export function cmdCommit(
	cwd: string,
	message: string | undefined,
	files: string[],
	raw: boolean,
	amend = false,
	noVerify = false,
): void {
	if (!message && !amend) gsdError("commit message required");
	let msg = message;
	if (msg) msg = sanitizeForPrompt(msg);
	const config = loadConfig(cwd);
	if (!config.commit_docs) {
		output(
			{ committed: false, hash: null, reason: "skipped_commit_docs_false" },
			raw,
			"skipped",
		);
		return;
	}
	if (isGitIgnored(cwd, ".planning")) {
		output(
			{ committed: false, hash: null, reason: "skipped_gitignored" },
			raw,
			"skipped",
		);
		return;
	}
	// Branch strategy
	if (config.branching_strategy && config.branching_strategy !== "none") {
		let branchName: string | null = null;
		if (config.branching_strategy === "phase") {
			const phaseMatch = (files || []).join(" ").match(/(\d+)-/);
			if (phaseMatch) {
				const phaseInfo = findPhaseInternal(cwd, phaseMatch[1]);
				if (phaseInfo)
					branchName = config.phase_branch_template
						.replace("{phase}", phaseInfo.phase_number)
						.replace("{slug}", phaseInfo.phase_slug || "phase");
			}
		} else if (config.branching_strategy === "milestone") {
			const milestoneInfo = getMilestoneInfo(cwd);
			if (milestoneInfo?.version)
				branchName = config.milestone_branch_template
					.replace("{milestone}", milestoneInfo.version)
					.replace(
						"{slug}",
						generateSlugInternal(milestoneInfo.name) || "milestone",
					);
		}
		if (branchName) {
			const currentBranch = execGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
			if (
				currentBranch.exitCode === 0 &&
				currentBranch.stdout.trim() !== branchName
			) {
				const create = execGit(cwd, ["checkout", "-b", branchName]);
				if (create.exitCode !== 0) execGit(cwd, ["checkout", branchName]);
			}
		}
	}
	const filesToStage = files && files.length > 0 ? files : [".planning/"];
	for (const file of filesToStage) {
		const fullPath = path.join(cwd, file);
		if (!fs.existsSync(fullPath))
			execGit(cwd, ["rm", "--cached", "--ignore-unmatch", file]);
		else execGit(cwd, ["add", file]);
	}
	const commitArgs = amend
		? ["commit", "--amend", "--no-edit"]
		: ["commit", "-m", msg!];
	if (noVerify) commitArgs.push("--no-verify");
	const commitResult = execGit(cwd, commitArgs);
	if (commitResult.exitCode !== 0) {
		if (
			commitResult.stdout.includes("nothing to commit") ||
			commitResult.stderr.includes("nothing to commit")
		) {
			output(
				{ committed: false, hash: null, reason: "nothing_to_commit" },
				raw,
				"nothing",
			);
			return;
		}
		output(
			{
				committed: false,
				hash: null,
				reason: "nothing_to_commit",
				error: commitResult.stderr,
			},
			raw,
			"nothing",
		);
		return;
	}
	const hashResult = execGit(cwd, ["rev-parse", "--short", "HEAD"]);
	const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
	output(
		{ committed: true, hash, reason: "committed" },
		raw,
		hash || "committed",
	);
}

export function cmdCommitToSubrepo(
	cwd: string,
	message: string | undefined,
	files: string[],
	raw: boolean,
): void {
	if (!message) gsdError("commit message required");
	const config = loadConfig(cwd);
	const subRepos = config.sub_repos;
	if (!subRepos || subRepos.length === 0)
		gsdError("no sub_repos configured in .planning/config.json");
	if (!files || files.length === 0)
		gsdError("--files required for commit-to-subrepo");
	const grouped: Record<string, string[]> = {},
		unmatched: string[] = [];
	for (const file of files) {
		const match = subRepos.find((repo) => file.startsWith(repo + "/"));
		if (match) {
			if (!grouped[match]) grouped[match] = [];
			grouped[match].push(file);
		} else unmatched.push(file);
	}
	if (unmatched.length > 0)
		process.stderr.write(
			`Warning: ${unmatched.length} file(s) did not match any sub-repo prefix: ${unmatched.join(", ")}\n`,
		);
	const repos: Record<string, unknown> = {};
	for (const [repo, repoFiles] of Object.entries(grouped)) {
		const repoCwd = path.join(cwd, repo);
		for (const file of repoFiles)
			execGit(repoCwd, ["add", file.slice(repo.length + 1)]);
		const commitResult = execGit(repoCwd, ["commit", "-m", message!]);
		if (commitResult.exitCode !== 0) {
			repos[repo] = {
				committed: false,
				hash: null,
				files: repoFiles,
				reason: commitResult.stdout.includes("nothing to commit")
					? "nothing_to_commit"
					: "error",
				error: commitResult.stderr,
			};
			continue;
		}
		const hashResult = execGit(repoCwd, ["rev-parse", "--short", "HEAD"]);
		repos[repo] = {
			committed: true,
			hash: hashResult.exitCode === 0 ? hashResult.stdout : null,
			files: repoFiles,
		};
	}
	output(
		{
			committed: Object.values(repos).some(
				(r) => (r as { committed: boolean }).committed,
			),
			repos,
			unmatched: unmatched.length > 0 ? unmatched : undefined,
		},
		raw,
		Object.entries(repos)
			.map(([r, v]) => `${r}:${(v as { hash?: string }).hash || "skip"}`)
			.join(" "),
	);
}

export function cmdSummaryExtract(
	cwd: string,
	summaryPath: string | undefined,
	fields: string[] | null,
	raw: boolean,
): void {
	if (!summaryPath) gsdError("summary-path required for summary-extract");
	const fullPath = path.join(cwd, summaryPath!);
	if (!fs.existsSync(fullPath)) {
		output({ error: "File not found", path: summaryPath }, raw);
		return;
	}
	const content = fs.readFileSync(fullPath, "utf-8"),
		fm = extractFrontmatter(content);
	const parseDecisions = (list: string[] | undefined) =>
		(list || []).map((d) => {
			const idx = d.indexOf(":");
			return idx > 0
				? {
						summary: d.substring(0, idx).trim(),
						rationale: d.substring(idx + 1).trim(),
					}
				: { summary: d, rationale: null };
		});
	const fullResult = {
		path: summaryPath,
		one_liner: fm["one-liner"] || extractOneLinerFromBody(content) || null,
		key_files: fm["key-files"] || [],
		tech_added: fm["tech-stack"]?.added || [],
		patterns: fm["patterns-established"] || [],
		decisions: parseDecisions(fm["key-decisions"]),
		requirements_completed: fm["requirements-completed"] || [],
	};
	if (fields && fields.length > 0) {
		const filtered: Record<string, unknown> = { path: summaryPath };
		for (const field of fields)
			if ((fullResult as Record<string, unknown>)[field] !== undefined)
				filtered[field] = (fullResult as Record<string, unknown>)[field];
		output(filtered, raw);
		return;
	}
	output(fullResult, raw);
}

export async function cmdWebsearch(
	query: string | undefined,
	options: { limit?: number; freshness?: string | null },
	raw: boolean,
): Promise<void> {
	const apiKey = process.env["BRAVE_API_KEY"];
	if (!apiKey) {
		output({ available: false, reason: "BRAVE_API_KEY not set" }, raw, "");
		return;
	}
	if (!query) {
		output({ available: false, error: "Query required" }, raw, "");
		return;
	}
	const params = new URLSearchParams({
		q: query,
		count: String(options.limit || 10),
		country: "us",
		search_lang: "en",
		text_decorations: "false",
	});
	if (options.freshness) params.set("freshness", options.freshness);
	try {
		const response = await fetch(
			`https://api.search.brave.com/res/v1/web/search?${params}`,
			{
				headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
			},
		);
		if (!response.ok) {
			output(
				{ available: false, error: `API error: ${response.status}` },
				raw,
				"",
			);
			return;
		}
		const data = (await response.json()) as {
			web?: {
				results?: Array<{
					title: string;
					url: string;
					description: string;
					age?: string;
				}>;
			};
		};
		const results = (data.web?.results || []).map((r) => ({
			title: r.title,
			url: r.url,
			description: r.description,
			age: r.age || null,
		}));
		output(
			{ available: true, query, count: results.length, results },
			raw,
			results.map((r) => `${r.title}\n${r.url}\n${r.description}`).join("\n\n"),
		);
	} catch (err) {
		output({ available: false, error: (err as Error).message }, raw, "");
	}
}

export function cmdProgressRender(
	cwd: string,
	format: string,
	raw: boolean,
): void {
	const phasesDir = planningPaths(cwd).phases,
		roadmapPath = planningPaths(cwd).roadmap;
	const milestone = getMilestoneInfo(cwd);
	const phases: Array<{
		number: string;
		name: string;
		plans: number;
		summaries: number;
		status: string;
	}> = [];
	let totalPlans = 0,
		totalSummaries = 0;
	try {
		const entries = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort((a, b) => comparePhaseNum(a, b));
		for (const dir of entries) {
			const dm = dir.match(/^(\d+(?:\.\d+)*)-?(.*)/);
			const phaseNum = dm ? dm[1] : dir,
				phaseName = dm && dm[2] ? dm[2].replace(/-/g, " ") : "";
			const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
			const plans = phaseFiles.filter(
				(f) => f.endsWith("-PLAN.md") || f === "PLAN.md",
			).length;
			const summaries = phaseFiles.filter(
				(f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md",
			).length;
			totalPlans += plans;
			totalSummaries += summaries;
			let status: string;
			if (plans === 0) status = "Pending";
			else if (summaries >= plans) status = "Complete";
			else if (summaries > 0) status = "In Progress";
			else status = "Planned";
			phases.push({
				number: phaseNum,
				name: phaseName,
				plans,
				summaries,
				status,
			});
		}
	} catch {
		/* ok */
	}
	const percent =
		totalPlans > 0
			? Math.min(100, Math.round((totalSummaries / totalPlans) * 100))
			: 0;
	if (format === "table") {
		const barWidth = 10,
			filled = Math.round((percent / 100) * barWidth);
		const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
		let out = `# ${milestone.version} ${milestone.name}\n\n**Progress:** [${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)\n\n| Phase | Name | Plans | Status |\n|-------|------|-------|--------|\n`;
		for (const p of phases)
			out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
		output({ rendered: out }, raw, out);
	} else if (format === "bar") {
		const barWidth = 20,
			filled = Math.round((percent / 100) * barWidth);
		const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
		const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
		output(
			{ bar: text, percent, completed: totalSummaries, total: totalPlans },
			raw,
			text,
		);
	} else {
		output(
			{
				milestone_version: milestone.version,
				milestone_name: milestone.name,
				phases,
				total_plans: totalPlans,
				total_summaries: totalSummaries,
				percent,
			},
			raw,
		);
	}
}

export function cmdTodoComplete(
	cwd: string,
	filename: string | undefined,
	raw: boolean,
): void {
	if (!filename) gsdError("filename required for todo complete");
	const pendingDir = path.join(planningDir(cwd), "todos", "pending");
	const completedDir = path.join(planningDir(cwd), "todos", "completed");
	const sourcePath = path.join(pendingDir, filename!);
	if (!fs.existsSync(sourcePath)) gsdError(`Todo not found: ${filename}`);
	fs.mkdirSync(completedDir, { recursive: true });
	let content = fs.readFileSync(sourcePath, "utf-8");
	const today = new Date().toISOString().split("T")[0];
	content = `completed: ${today}\n` + content;
	fs.writeFileSync(path.join(completedDir, filename!), content, "utf-8");
	fs.unlinkSync(sourcePath);
	output({ completed: true, file: filename, date: today }, raw, "completed");
}

export function cmdTodoMatchPhase(
	cwd: string,
	phase: string | undefined,
	raw: boolean,
): void {
	if (!phase) gsdError("phase required for todo match-phase");
	const pendingDir = path.join(planningDir(cwd), "todos", "pending");
	const todos: Array<{
		file: string;
		title: string;
		area: string;
		files: string[];
		body: string;
	}> = [];
	try {
		for (const file of fs
			.readdirSync(pendingDir)
			.filter((f) => f.endsWith(".md"))) {
			try {
				const content = fs.readFileSync(path.join(pendingDir, file), "utf-8");
				const titleMatch = content.match(/^title:\s*(.+)$/m),
					areaMatch = content.match(/^area:\s*(.+)$/m),
					filesMatch = content.match(/^files:\s*(.+)$/m);
				const body = content
					.replace(/^(title|area|files|created|priority):.*$/gm, "")
					.trim();
				todos.push({
					file,
					title: titleMatch ? titleMatch[1].trim() : "Untitled",
					area: areaMatch ? areaMatch[1].trim() : "general",
					files: filesMatch
						? filesMatch[1]
								.trim()
								.split(/[,\s]+/)
								.filter(Boolean)
						: [],
					body: body.slice(0, 200),
				});
			} catch {
				/* ok */
			}
		}
	} catch {
		/* ok */
	}
	if (todos.length === 0) {
		output({ phase, matches: [], todo_count: 0 }, raw);
		return;
	}
	const phaseInfo2 = getRoadmapPhaseInternal(cwd, phase!);
	const phaseText =
		`${phaseInfo2?.phase_name ?? ""} ${phaseInfo2?.goal ?? ""} ${phaseInfo2?.section ?? ""}`.toLowerCase();
	const stopWords = new Set([
		"the",
		"and",
		"for",
		"with",
		"from",
		"that",
		"this",
		"will",
		"are",
		"was",
		"has",
		"have",
		"been",
		"not",
		"but",
		"all",
		"can",
		"into",
		"each",
		"when",
		"any",
		"use",
		"new",
	]);
	const phaseKeywords = new Set(
		phaseText
			.split(/[\s\-_/.,;:()[\]{}|]+/)
			.map((w) => w.replace(/[^a-z0-9]/g, ""))
			.filter((w) => w.length > 2 && !stopWords.has(w)),
	);
	const phaseInfoDisk = findPhaseInternal(cwd, phase!);
	const phasePlans: string[] = [];
	if (phaseInfoDisk?.found) {
		try {
			const phaseDir = path.join(cwd, phaseInfoDisk.directory);
			for (const pf of fs
				.readdirSync(phaseDir)
				.filter((f) => f.endsWith("-PLAN.md"))) {
				try {
					const planContent = fs.readFileSync(path.join(phaseDir, pf), "utf-8");
					const fmFiles = planContent.match(/files_modified:\s*\[([^\]]*)\]/);
					if (fmFiles)
						phasePlans.push(
							...fmFiles[1]
								.split(",")
								.map((s) => s.trim().replace(/['"]/g, ""))
								.filter(Boolean),
						);
				} catch {
					/* ok */
				}
			}
		} catch {
			/* ok */
		}
	}
	const matches: unknown[] = [];
	for (const todo of todos) {
		let score = 0;
		const reasons: string[] = [];
		const todoWords = `${todo.title} ${todo.body}`
			.toLowerCase()
			.split(/[\s\-_/.,;:()[\]{}|]+/)
			.map((w) => w.replace(/[^a-z0-9]/g, ""))
			.filter((w) => w.length > 2 && !stopWords.has(w));
		const matchedKeywords = todoWords.filter((w) => phaseKeywords.has(w));
		if (matchedKeywords.length > 0) {
			score += Math.min(matchedKeywords.length * 0.2, 0.6);
			reasons.push(
				`keywords: ${[...new Set(matchedKeywords)].slice(0, 5).join(", ")}`,
			);
		}
		if (
			todo.area !== "general" &&
			phaseText.includes(todo.area.toLowerCase())
		) {
			score += 0.3;
			reasons.push(`area: ${todo.area}`);
		}
		if (todo.files.length > 0 && phasePlans.length > 0) {
			const fileOverlap = todo.files.filter((f) =>
				phasePlans.some((pf) => pf.includes(f) || f.includes(pf)),
			);
			if (fileOverlap.length > 0) {
				score += 0.4;
				reasons.push(`files: ${fileOverlap.slice(0, 3).join(", ")}`);
			}
		}
		if (score > 0)
			matches.push({
				file: todo.file,
				title: todo.title,
				area: todo.area,
				score: Math.round(score * 100) / 100,
				reasons,
			});
	}
	(matches as Array<{ score: number }>).sort((a, b) => b.score - a.score);
	output({ phase, matches, todo_count: todos.length }, raw);
}

export function cmdScaffold(
	cwd: string,
	type: string | undefined,
	options: { phase?: string | null; name?: string | null },
	raw: boolean,
): void {
	const { phase, name } = options;
	const padded = phase ? normalizePhaseName(phase) : "00";
	const today = new Date().toISOString().split("T")[0];
	const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
	const phaseDir = phaseInfo ? path.join(cwd, phaseInfo.directory) : null;
	if (phase && !phaseDir && type !== "phase-dir")
		gsdError(`Phase ${phase} directory not found`);
	let filePath: string, content: string;
	switch (type) {
		case "context":
			filePath = path.join(phaseDir!, `${padded}-CONTEXT.md`);
			content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || "Unnamed"}"\ncreated: ${today}\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || "Unnamed"} - Context\n\n## Decisions\n\n_Decisions will be captured during /gsd-discuss-phase ${phase}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
			break;
		case "uat":
			filePath = path.join(phaseDir!, `${padded}-UAT.md`);
			content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || "Unnamed"}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || "Unnamed"} - User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
			break;
		case "verification":
			filePath = path.join(phaseDir!, `${padded}-VERIFICATION.md`);
			content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || "Unnamed"}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || "Unnamed"} - Verification\n\n## Goal-Backward Verification\n\n**Phase Goal:** [From ROADMAP.md]\n\n## Checks\n\n| # | Requirement | Status | Evidence |\n|---|------------|--------|----------|\n\n## Result\n\n_Pending verification_\n`;
			break;
		case "phase-dir": {
			if (!phase || !name)
				gsdError("phase and name required for phase-dir scaffold");
			const slug = generateSlugInternal(name!);
			const dirName = `${padded}-${slug}`;
			const phasesParent = planningPaths(cwd).phases;
			fs.mkdirSync(phasesParent, { recursive: true });
			const dirPath = path.join(phasesParent, dirName);
			fs.mkdirSync(dirPath, { recursive: true });
			output(
				{
					created: true,
					directory: toPosixPath(path.relative(cwd, dirPath)),
					path: dirPath,
				},
				raw,
				dirPath,
			);
			return;
		}
		default:
			gsdError(
				`Unknown scaffold type: ${type}. Available: context, uat, verification, phase-dir`,
			);
			return;
	}
	if (fs.existsSync(filePath)) {
		output(
			{ created: false, reason: "already_exists", path: filePath },
			raw,
			"exists",
		);
		return;
	}
	fs.writeFileSync(filePath, content, "utf-8");
	const relPath = toPosixPath(path.relative(cwd, filePath));
	output({ created: true, path: relPath }, raw, relPath);
}

export function cmdStats(cwd: string, format: string, raw: boolean): void {
	const phasesDir = planningPaths(cwd).phases,
		roadmapPath = planningPaths(cwd).roadmap,
		reqPath = planningPaths(cwd).requirements,
		statePath = planningPaths(cwd).state;
	const milestone = getMilestoneInfo(cwd),
		isDirInMilestone = getMilestonePhaseFilter(cwd);
	const phasesByNumber = new Map<
		string,
		{
			number: string;
			name: string;
			plans: number;
			summaries: number;
			status: string;
		}
	>();
	let totalPlans = 0,
		totalSummaries = 0;
	try {
		const roadmapContent = extractCurrentMilestone(
			fs.readFileSync(roadmapPath, "utf-8"),
			cwd,
		);
		const headingPattern =
			/#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
		let match: RegExpExecArray | null;
		while ((match = headingPattern.exec(roadmapContent)) !== null)
			phasesByNumber.set(match[1], {
				number: match[1],
				name: match[2].replace(/\(INSERTED\)/i, "").trim(),
				plans: 0,
				summaries: 0,
				status: "Not Started",
			});
	} catch {
		/* ok */
	}
	try {
		const dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.filter(isDirInMilestone)
			.sort((a, b) => comparePhaseNum(a, b));
		for (const dir of dirs) {
			const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
			const phaseNum = dm ? dm[1] : dir,
				phaseName = dm && dm[2] ? dm[2].replace(/-/g, " ") : "";
			const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
			const plans = phaseFiles.filter(
				(f) => f.endsWith("-PLAN.md") || f === "PLAN.md",
			).length;
			const summaries = phaseFiles.filter(
				(f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md",
			).length;
			totalPlans += plans;
			totalSummaries += summaries;
			let status: string;
			if (plans === 0) status = "Not Started";
			else if (summaries >= plans) status = "Complete";
			else if (summaries > 0) status = "In Progress";
			else status = "Planned";
			const existing = phasesByNumber.get(phaseNum);
			phasesByNumber.set(phaseNum, {
				number: phaseNum,
				name: existing?.name || phaseName,
				plans,
				summaries,
				status,
			});
		}
	} catch {
		/* ok */
	}
	const phases = [...phasesByNumber.values()].sort((a, b) =>
		comparePhaseNum(a.number, b.number),
	);
	const completedPhases = phases.filter((p) => p.status === "Complete").length;
	const planPercent =
		totalPlans > 0
			? Math.min(100, Math.round((totalSummaries / totalPlans) * 100))
			: 0;
	const percent =
		phases.length > 0
			? Math.min(100, Math.round((completedPhases / phases.length) * 100))
			: 0;
	let requirementsTotal = 0,
		requirementsComplete = 0;
	try {
		if (fs.existsSync(reqPath)) {
			const reqContent = fs.readFileSync(reqPath, "utf-8");
			requirementsComplete = (reqContent.match(/^- \[x\] \*\*/gm) || []).length;
			requirementsTotal =
				requirementsComplete +
				(reqContent.match(/^- \[ \] \*\*/gm) || []).length;
		}
	} catch {
		/* ok */
	}
	let lastActivity: string | null = null;
	try {
		if (fs.existsSync(statePath)) {
			const sc = fs.readFileSync(statePath, "utf-8");
			lastActivity =
				(sc.match(/^last_activity:\s*(.+)$/im) ??
					sc.match(/\*\*Last Activity:\*\*\s*(.+)/i) ??
					sc.match(/^Last Activity:\s*(.+)$/im))?.[1]?.trim() ?? null;
		}
	} catch {
		/* ok */
	}
	let gitCommits = 0,
		gitFirstCommitDate: string | null = null;
	const cc = execGit(cwd, ["rev-list", "--count", "HEAD"]);
	if (cc.exitCode === 0) gitCommits = parseInt(cc.stdout, 10) || 0;
	const rh = execGit(cwd, ["rev-list", "--max-parents=0", "HEAD"]);
	if (rh.exitCode === 0 && rh.stdout) {
		const fh = execGit(cwd, [
			"show",
			"-s",
			"--format=%as",
			rh.stdout.split("\n")[0].trim(),
		]);
		if (fh.exitCode === 0) gitFirstCommitDate = fh.stdout || null;
	}
	const result = {
		milestone_version: milestone.version,
		milestone_name: milestone.name,
		phases,
		phases_completed: completedPhases,
		phases_total: phases.length,
		total_plans: totalPlans,
		total_summaries: totalSummaries,
		percent,
		plan_percent: planPercent,
		requirements_total: requirementsTotal,
		requirements_complete: requirementsComplete,
		git_commits: gitCommits,
		git_first_commit_date: gitFirstCommitDate,
		last_activity: lastActivity,
	};
	if (format === "table") {
		const barWidth = 10,
			filled = Math.round((percent / 100) * barWidth);
		const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
		let out = `# ${milestone.version} ${milestone.name} — Statistics\n\n**Progress:** [${bar}] ${completedPhases}/${phases.length} phases (${percent}%)\n`;
		if (totalPlans > 0)
			out += `**Plans:** ${totalSummaries}/${totalPlans} complete (${planPercent}%)\n`;
		out += `**Phases:** ${completedPhases}/${phases.length} complete\n`;
		if (requirementsTotal > 0)
			out += `**Requirements:** ${requirementsComplete}/${requirementsTotal} complete\n`;
		out +=
			"\n| Phase | Name | Plans | Completed | Status |\n|-------|------|-------|-----------|--------|\n";
		for (const p of phases)
			out += `| ${p.number} | ${p.name} | ${p.plans} | ${p.summaries} | ${p.status} |\n`;
		if (gitCommits > 0) {
			out += `\n**Git:** ${gitCommits} commits`;
			if (gitFirstCommitDate) out += ` (since ${gitFirstCommitDate})`;
			out += "\n";
		}
		if (lastActivity) out += `**Last activity:** ${lastActivity}\n`;
		output({ rendered: out }, raw, out);
	} else {
		output(result, raw);
	}
}
