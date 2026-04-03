/**
 * milestone.ts — Milestone and requirements lifecycle operations.
 */

import fs from "fs";
import path from "path";
import {
	escapeRegex,
	extractOneLinerFromBody,
	getMilestonePhaseFilter,
	gsdError,
	normalizeMd,
	output,
	planningPaths,
} from "./core.js";
import { extractFrontmatter } from "./frontmatter.js";
import { stateReplaceFieldWithFallback, writeStateMd } from "./state.js";

export function cmdRequirementsMarkComplete(
	cwd: string,
	reqIdsRaw: string[],
	raw: boolean,
): void {
	if (!reqIdsRaw || reqIdsRaw.length === 0)
		gsdError("requirement IDs required.");
	const reqIds = reqIdsRaw
		.join(" ")
		.replace(/[[\]]/g, "")
		.split(/[,\s]+/)
		.map((r) => r.trim())
		.filter(Boolean);
	if (reqIds.length === 0) gsdError("no valid requirement IDs found");
	const reqPath = planningPaths(cwd).requirements;
	if (!fs.existsSync(reqPath)) {
		output(
			{ updated: false, reason: "REQUIREMENTS.md not found", ids: reqIds },
			raw,
			"no requirements file",
		);
		return;
	}
	let reqContent = fs.readFileSync(reqPath, "utf-8");
	const updated: string[] = [],
		alreadyComplete: string[] = [],
		notFound: string[] = [];
	for (const reqId of reqIds) {
		let found = false;
		const esc = escapeRegex(reqId);
		const checkboxPattern = new RegExp(
			`(-\\s*\\[)[ ](\\]\\s*\\*\\*${esc}\\*\\*)`,
			"gi",
		);
		if (checkboxPattern.test(reqContent)) {
			reqContent = reqContent.replace(
				new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${esc}\\*\\*)`, "gi"),
				"$1x$2",
			);
			found = true;
		}
		const tablePattern = new RegExp(
			`(\\|\\s*${esc}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`,
			"gi",
		);
		if (tablePattern.test(reqContent)) {
			reqContent = reqContent.replace(
				new RegExp(`(\\|\\s*${esc}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, "gi"),
				"$1 Complete $2",
			);
			found = true;
		}
		if (found) {
			updated.push(reqId);
		} else if (
			new RegExp(`-\\s*\\[x\\]\\s*\\*\\*${esc}\\*\\*`, "gi").test(reqContent) ||
			new RegExp(`\\|\\s*${esc}\\s*\\|[^|]+\\|\\s*Complete\\s*\\|`, "gi").test(
				reqContent,
			)
		) {
			alreadyComplete.push(reqId);
		} else {
			notFound.push(reqId);
		}
	}
	if (updated.length > 0) fs.writeFileSync(reqPath, reqContent, "utf-8");
	output(
		{
			updated: updated.length > 0,
			marked_complete: updated,
			already_complete: alreadyComplete,
			not_found: notFound,
			total: reqIds.length,
		},
		raw,
		`${updated.length}/${reqIds.length} requirements marked complete`,
	);
}

export function cmdMilestoneComplete(
	cwd: string,
	version: string | undefined,
	options: { name?: string | null; archivePhases?: boolean },
	raw: boolean,
): void {
	if (!version)
		gsdError("version required for milestone complete (e.g., v1.0)");
	const roadmapPath = planningPaths(cwd).roadmap;
	const reqPath = planningPaths(cwd).requirements;
	const statePath = planningPaths(cwd).state;
	const milestonesPath = path.join(cwd, ".planning", "MILESTONES.md");
	const archiveDir = path.join(cwd, ".planning", "milestones");
	const phasesDir = planningPaths(cwd).phases;
	const today = new Date().toISOString().split("T")[0];
	const milestoneName = options.name || version;
	fs.mkdirSync(archiveDir, { recursive: true });
	const isDirInMilestone = getMilestonePhaseFilter(cwd);
	let phaseCount = 0,
		totalPlans = 0,
		totalTasks = 0;
	const accomplishments: string[] = [];
	try {
		const dirs = fs
			.readdirSync(phasesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort();
		for (const dir of dirs) {
			if (!isDirInMilestone(dir)) continue;
			phaseCount++;
			const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
			const plans = phaseFiles.filter(
				(f) => f.endsWith("-PLAN.md") || f === "PLAN.md",
			);
			const summaries = phaseFiles.filter(
				(f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md",
			);
			totalPlans += plans.length;
			for (const s of summaries) {
				try {
					const content = fs.readFileSync(
						path.join(phasesDir, dir, s),
						"utf-8",
					);
					const fm = extractFrontmatter(content);
					const oneLiner = fm["one-liner"] || extractOneLinerFromBody(content);
					if (oneLiner) accomplishments.push(oneLiner);
					const tasksFieldMatch = content.match(/\*\*Tasks:\*\*\s*(\d+)/);
					if (tasksFieldMatch) {
						totalTasks += parseInt(tasksFieldMatch[1], 10);
					} else {
						const xmlTaskMatches = content.match(/<task[\s>]/gi) || [];
						const mdTaskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
						totalTasks += xmlTaskMatches.length || mdTaskMatches.length;
					}
				} catch {
					/* ok */
				}
			}
		}
	} catch {
		/* ok */
	}
	if (fs.existsSync(roadmapPath))
		fs.writeFileSync(
			path.join(archiveDir, `${version}-ROADMAP.md`),
			fs.readFileSync(roadmapPath, "utf-8"),
			"utf-8",
		);
	if (fs.existsSync(reqPath))
		fs.writeFileSync(
			path.join(archiveDir, `${version}-REQUIREMENTS.md`),
			`# Requirements Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\n---\n\n` +
				fs.readFileSync(reqPath, "utf-8"),
			"utf-8",
		);
	const auditFile = path.join(
		cwd,
		".planning",
		`${version}-MILESTONE-AUDIT.md`,
	);
	if (fs.existsSync(auditFile))
		fs.renameSync(
			auditFile,
			path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`),
		);
	const accomplishmentsList = accomplishments.map((a) => `- ${a}`).join("\n");
	const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Phases completed:** ${phaseCount} phases, ${totalPlans} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || "- (none recorded)"}\n\n---\n\n`;
	if (fs.existsSync(milestonesPath)) {
		const existing = fs.readFileSync(milestonesPath, "utf-8");
		if (!existing.trim()) {
			fs.writeFileSync(
				milestonesPath,
				normalizeMd(`# Milestones\n\n${milestoneEntry}`),
				"utf-8",
			);
		} else {
			const headerMatch = existing.match(/^(#{1,3}\s+[^\n]*\n\n?)/);
			if (headerMatch)
				fs.writeFileSync(
					milestonesPath,
					normalizeMd(
						headerMatch[1] +
							milestoneEntry +
							existing.slice(headerMatch[1].length),
					),
					"utf-8",
				);
			else
				fs.writeFileSync(
					milestonesPath,
					normalizeMd(milestoneEntry + existing),
					"utf-8",
				);
		}
	} else {
		fs.writeFileSync(
			milestonesPath,
			normalizeMd(`# Milestones\n\n${milestoneEntry}`),
			"utf-8",
		);
	}
	if (fs.existsSync(statePath)) {
		let stateContent = fs.readFileSync(statePath, "utf-8");
		stateContent = stateReplaceFieldWithFallback(
			stateContent,
			"Status",
			null,
			`${version} milestone complete`,
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
			`${version} milestone completed and archived`,
		);
		writeStateMd(statePath, stateContent, cwd);
	}
	let phasesArchived = false;
	if (options.archivePhases) {
		try {
			const phaseArchiveDir = path.join(archiveDir, `${version}-phases`);
			fs.mkdirSync(phaseArchiveDir, { recursive: true });
			const dirs = fs
				.readdirSync(phasesDir, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name);
			let count = 0;
			for (const dir of dirs) {
				if (!isDirInMilestone(dir)) continue;
				fs.renameSync(
					path.join(phasesDir, dir),
					path.join(phaseArchiveDir, dir),
				);
				count++;
			}
			phasesArchived = count > 0;
		} catch {
			/* ok */
		}
	}
	output(
		{
			version,
			name: milestoneName,
			date: today,
			phases: phaseCount,
			plans: totalPlans,
			tasks: totalTasks,
			accomplishments,
			archived: {
				roadmap: fs.existsSync(path.join(archiveDir, `${version}-ROADMAP.md`)),
				requirements: fs.existsSync(
					path.join(archiveDir, `${version}-REQUIREMENTS.md`),
				),
				audit: fs.existsSync(
					path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`),
				),
				phases: phasesArchived,
			},
			milestones_updated: true,
			state_updated: fs.existsSync(statePath),
		},
		raw,
	);
}
