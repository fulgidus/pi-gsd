/**
 * roadmap.ts - Roadmap parsing and update operations.
 */

import fs from "fs";
import path from "path";
import {
	comparePhaseNum,
	escapeRegex,
	extractCurrentMilestone,
	findPhaseInternal,
	gsdError,
	loadConfig,
	normalizePhaseName,
	output,
	planningPaths,
	replaceInCurrentMilestone,
	stripShippedMilestones,
} from "./core.js";
import { extractFrontmatter } from "./frontmatter.js";

export function cmdRoadmapGetPhase(
	cwd: string,
	phaseNum: string | undefined,
	raw: boolean,
): void {
	const roadmapPath = planningPaths(cwd).roadmap;
	if (!fs.existsSync(roadmapPath)) {
		output({ found: false, error: "ROADMAP.md not found" }, raw, "");
		return;
	}
	try {
		const content = extractCurrentMilestone(
			fs.readFileSync(roadmapPath, "utf-8"),
			cwd,
		);
		const escapedPhase = escapeRegex(phaseNum ?? "");
		const phasePattern = new RegExp(
			`#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`,
			"i",
		);
		const headerMatch = content.match(phasePattern);
		if (!headerMatch) {
			const checklistPattern = new RegExp(
				`-\\s*\\[[ x]\\]\\s*\\*\\*Phase\\s+${escapedPhase}:\\s*([^*]+)\\*\\*`,
				"i",
			);
			const checklistMatch = content.match(checklistPattern);
			if (checklistMatch) {
				output(
					{
						found: false,
						phase_number: phaseNum,
						phase_name: checklistMatch[1].trim(),
						error: "malformed_roadmap",
						message: `Phase ${phaseNum} exists in summary list but missing detail section.`,
					},
					raw,
					"",
				);
				return;
			}
			output({ found: false, phase_number: phaseNum }, raw, "");
			return;
		}
		const phaseName = headerMatch[1].trim();
		const headerIndex = headerMatch.index!;
		const restOfContent = content.slice(headerIndex);
		const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
		const sectionEnd = nextHeaderMatch
			? headerIndex + nextHeaderMatch.index!
			: content.length;
		const section = content.slice(headerIndex, sectionEnd).trim();
		const goalMatch = section.match(/\*\*Goal(?::\*\*|\*\*:)\s*([^\n]+)/i);
		const criteriaMatch = section.match(
			/\*\*Success Criteria\*\*[^\n]*:\s*\n((?:\s*\d+\.\s*[^\n]+\n?)+)/i,
		);
		const success_criteria = criteriaMatch
			? criteriaMatch[1]
					.trim()
					.split("\n")
					.map((l) => l.replace(/^\s*\d+\.\s*/, "").trim())
					.filter(Boolean)
			: [];
		output(
			{
				found: true,
				phase_number: phaseNum,
				phase_name: phaseName,
				goal: goalMatch ? goalMatch[1].trim() : null,
				success_criteria,
				section,
			},
			raw,
			section,
		);
	} catch (e) {
		gsdError("Failed to read ROADMAP.md: " + (e as Error).message);
	}
}

interface RoadmapPhaseItem {
	number: string;
	name: string;
	goal: string | null;
	depends_on: string | null;
	plan_count: number;
	summary_count: number;
	has_context: boolean;
	has_research: boolean;
	disk_status: string;
	roadmap_complete: boolean;
}

export function cmdRoadmapAnalyze(cwd: string, raw: boolean): void {
	const roadmapPath = planningPaths(cwd).roadmap;
	if (!fs.existsSync(roadmapPath)) {
		output(
			{
				error: "ROADMAP.md not found",
				milestones: [],
				phases: [],
				current_phase: null,
			},
			raw,
		);
		return;
	}
	const rawContent = fs.readFileSync(roadmapPath, "utf-8");
	const content = extractCurrentMilestone(rawContent, cwd);
	const phasesDir = planningPaths(cwd).phases;

	const phasePattern =
		/#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
	const phases: RoadmapPhaseItem[] = [];
	let match: RegExpExecArray | null;

	while ((match = phasePattern.exec(content)) !== null) {
		const phaseNum = match[1],
			phaseName = match[2].replace(/\(INSERTED\)/i, "").trim();
		const sectionStart = match.index;
		const nextHeader = content
			.slice(sectionStart)
			.match(/\n#{2,4}\s+Phase\s+\d/i);
		const sectionEnd = nextHeader
			? sectionStart + nextHeader.index!
			: content.length;
		const section = content.slice(sectionStart, sectionEnd);
		const goalMatch = section.match(/\*\*Goal(?::\*\*|\*\*:)\s*([^\n]+)/i);
		const dependsMatch = section.match(
			/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i,
		);
		const normalized = normalizePhaseName(phaseNum);
		let diskStatus = "no_directory",
			planCount = 0,
			summaryCount = 0,
			hasContext = false,
			hasResearch = false;
		try {
			const dirs = fs
				.readdirSync(phasesDir, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name);
			const dirMatch = dirs.find(
				(d) => d.startsWith(normalized + "-") || d === normalized,
			);
			if (dirMatch) {
				const phaseFiles = fs.readdirSync(path.join(phasesDir, dirMatch));
				planCount = phaseFiles.filter(
					(f) => f.endsWith("-PLAN.md") || f === "PLAN.md",
				).length;
				summaryCount = phaseFiles.filter(
					(f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md",
				).length;
				hasContext = phaseFiles.some(
					(f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md",
				);
				hasResearch = phaseFiles.some(
					(f) => f.endsWith("-RESEARCH.md") || f === "RESEARCH.md",
				);
				if (summaryCount >= planCount && planCount > 0) diskStatus = "complete";
				else if (summaryCount > 0) diskStatus = "partial";
				else if (planCount > 0) diskStatus = "planned";
				else if (hasResearch) diskStatus = "researched";
				else if (hasContext) diskStatus = "discussed";
				else diskStatus = "empty";
			}
		} catch {
			/* ok */
		}
		const checkboxPattern = new RegExp(
			`-\\s*\\[(x| )\\]\\s*.*Phase\\s+${escapeRegex(phaseNum)}[:\\s]`,
			"i",
		);
		const checkboxMatch = content.match(checkboxPattern);
		const roadmapComplete = checkboxMatch ? checkboxMatch[1] === "x" : false;
		if (roadmapComplete && diskStatus !== "complete") diskStatus = "complete";
		phases.push({
			number: phaseNum,
			name: phaseName,
			goal: goalMatch ? goalMatch[1].trim() : null,
			depends_on: dependsMatch ? dependsMatch[1].trim() : null,
			plan_count: planCount,
			summary_count: summaryCount,
			has_context: hasContext,
			has_research: hasResearch,
			disk_status: diskStatus,
			roadmap_complete: roadmapComplete,
		});
	}

	const milestones: Array<{ heading: string; version: string }> = [];
	const milestonePattern = /##\s*(.*v(\d+(?:\.\d+)+)[^(\n]*)/gi;
	let mMatch: RegExpExecArray | null;
	while ((mMatch = milestonePattern.exec(content)) !== null)
		milestones.push({ heading: mMatch[1].trim(), version: "v" + mMatch[2] });

	const currentPhase =
		phases.find(
			(p) => p.disk_status === "planned" || p.disk_status === "partial",
		) ?? null;
	const nextPhase =
		phases.find((p) =>
			["empty", "no_directory", "discussed", "researched"].includes(
				p.disk_status,
			),
		) ?? null;
	const totalPlans = phases.reduce(
		(s: number, p: { plan_count: number }) => s + p.plan_count,
		0,
	);
	const totalSummaries = phases.reduce(
		(s: number, p: { summary_count: number }) => s + p.summary_count,
		0,
	);
	const completedPhases = phases.filter(
		(p: { disk_status: string }) => p.disk_status === "complete",
	).length;

	const checklistPattern = /-\s*\[[ x]\]\s*\*\*Phase\s+(\d+[A-Z]?(?:\.\d+)*)/gi;
	const checklistPhases = new Set<string>();
	let clm: RegExpExecArray | null;
	while ((clm = checklistPattern.exec(content)) !== null)
		checklistPhases.add(clm[1]);
	const detailPhases = new Set(phases.map((p: { number: string }) => p.number));
	const missingDetails = [...checklistPhases].filter(
		(p) => !detailPhases.has(p),
	);

	output(
		{
			milestones,
			phases,
			phase_count: phases.length,
			completed_phases: completedPhases,
			total_plans: totalPlans,
			total_summaries: totalSummaries,
			progress_percent:
				totalPlans > 0
					? Math.min(100, Math.round((totalSummaries / totalPlans) * 100))
					: 0,
			current_phase: currentPhase ? currentPhase.number : null,
			next_phase: nextPhase ? nextPhase.number : null,
			missing_phase_details: missingDetails.length > 0 ? missingDetails : null,
		},
		raw,
	);
}

export function cmdRoadmapUpdatePlanProgress(
	cwd: string,
	phaseNum: string | undefined,
	raw: boolean,
): void {
	if (!phaseNum)
		gsdError("phase number required for roadmap update-plan-progress");
	const roadmapPath = planningPaths(cwd).roadmap;
	const phaseInfo = findPhaseInternal(cwd, phaseNum!);
	if (!phaseInfo) gsdError(`Phase ${phaseNum} not found`);
	const planCount = phaseInfo!.plans.length,
		summaryCount = phaseInfo!.summaries.length;
	if (planCount === 0) {
		output(
			{
				updated: false,
				reason: "No plans found",
				plan_count: 0,
				summary_count: 0,
			},
			raw,
			"no plans",
		);
		return;
	}
	const isComplete = summaryCount >= planCount;
	const status = isComplete
		? "Complete"
		: summaryCount > 0
			? "In Progress"
			: "Planned";
	const today = new Date().toISOString().split("T")[0];
	if (!fs.existsSync(roadmapPath)) {
		output(
			{
				updated: false,
				reason: "ROADMAP.md not found",
				plan_count: planCount,
				summary_count: summaryCount,
			},
			raw,
			"no roadmap",
		);
		return;
	}
	let roadmapContent = fs.readFileSync(roadmapPath, "utf-8");
	const phaseEscaped = escapeRegex(phaseNum!);
	const tableRowPattern = new RegExp(
		`^(\\|\\s*${phaseEscaped}\\.?\\s[^|]*(?:\\|[^\\n]*))$`,
		"im",
	);
	const dateField = isComplete ? ` ${today} ` : "  ";
	roadmapContent = roadmapContent.replace(tableRowPattern, (fullRow) => {
		const cells = fullRow.split("|").slice(1, -1);
		if (cells.length === 5) {
			cells[2] = ` ${summaryCount}/${planCount} `;
			cells[3] = ` ${status.padEnd(11)}`;
			cells[4] = dateField;
		} else if (cells.length === 4) {
			cells[1] = ` ${summaryCount}/${planCount} `;
			cells[2] = ` ${status.padEnd(11)}`;
			cells[3] = dateField;
		}
		return "|" + cells.join("|") + "|";
	});
	const planCountPattern = new RegExp(
		`(#{2,4}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
		"i",
	);
	roadmapContent = replaceInCurrentMilestone(
		roadmapContent,
		planCountPattern,
		`$1${isComplete ? `${summaryCount}/${planCount} plans complete` : `${summaryCount}/${planCount} plans executed`}`,
	);
	if (isComplete) {
		const checkboxPattern = new RegExp(
			`(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${phaseEscaped}[:\\s][^\\n]*)`,
			"i",
		);
		roadmapContent = replaceInCurrentMilestone(
			roadmapContent,
			checkboxPattern,
			`$1x$2 (completed ${today})`,
		);
	}
	for (const summaryFile of phaseInfo!.summaries) {
		const planId = summaryFile
			.replace("-SUMMARY.md", "")
			.replace("SUMMARY.md", "");
		if (!planId) continue;
		roadmapContent = roadmapContent.replace(
			new RegExp(`(-\\s*\\[) (\\]\\s*${escapeRegex(planId)})`, "i"),
			"$1x$2",
		);
	}
	fs.writeFileSync(roadmapPath, roadmapContent, "utf-8");
	output(
		{
			updated: true,
			phase: phaseNum,
			plan_count: planCount,
			summary_count: summaryCount,
			status,
			complete: isComplete,
		},
		raw,
		`${summaryCount}/${planCount} ${status}`,
	);
}
