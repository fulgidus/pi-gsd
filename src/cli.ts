#!/usr/bin/env node
/**
 * cli.ts — GSD Tools CLI entry point.
 *
 * Faithfully ports gsd-tools.cjs to TypeScript.
 * Every command, flag, and subcommand is preserved exactly.
 */

import fs from "fs";
import path from "path";
import {
	findProjectRoot,
	getActiveWorkstream,
	gsdError,
	planningDir,
	resolveWorktreeRoot,
} from "./lib/core.js";
import { formatOutput, type OutputFormat } from "./output.js";

// ─── Arg parsing helpers ──────────────────────────────────────────────────────

function parseNamedArgs(
	args: string[],
	valueFlags: string[] = [],
	booleanFlags: string[] = [],
): Record<string, string | boolean | null> {
	const result: Record<string, string | boolean | null> = {};
	for (const flag of valueFlags) {
		const idx = args.indexOf(`--${flag}`);
		result[flag] =
			idx !== -1 &&
			args[idx + 1] !== undefined &&
			!args[idx + 1].startsWith("--")
				? args[idx + 1]
				: null;
	}
	for (const flag of booleanFlags) {
		result[flag] = args.includes(`--${flag}`);
	}
	return result;
}

function parseMultiwordArg(args: string[], flag: string): string | null {
	const idx = args.indexOf(`--${flag}`);
	if (idx === -1) return null;
	const tokens: string[] = [];
	for (let i = idx + 1; i < args.length; i++) {
		if (args[i].startsWith("--")) break;
		tokens.push(args[i]);
	}
	return tokens.length > 0 ? tokens.join(" ") : null;
}

function extractField(obj: unknown, fieldPath: string): unknown {
	const parts = fieldPath.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		const bracketMatch = part.match(/^(.+?)\[(-?\d+)]$/);
		if (bracketMatch) {
			const key = bracketMatch[1];
			const index = parseInt(bracketMatch[2], 10);
			current = (current as Record<string, unknown>)[key];
			if (!Array.isArray(current)) return undefined;
			current = index < 0 ? current[current.length + index] : current[index];
		} else {
			current = (current as Record<string, unknown>)[part];
		}
	}
	return current;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	// --cwd override
	let cwd = process.cwd();
	const cwdEqArg = args.find((arg) => arg.startsWith("--cwd="));
	const cwdIdx = args.indexOf("--cwd");
	if (cwdEqArg) {
		const value = cwdEqArg.slice("--cwd=".length).trim();
		if (!value) gsdError("Missing value for --cwd");
		args.splice(args.indexOf(cwdEqArg), 1);
		cwd = path.resolve(value);
	} else if (cwdIdx !== -1) {
		const value = args[cwdIdx + 1];
		if (!value || value.startsWith("--")) gsdError("Missing value for --cwd");
		args.splice(cwdIdx, 2);
		cwd = path.resolve(value);
	}
	if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory())
		gsdError(`Invalid --cwd: ${cwd}`);

	// Worktree resolution
	if (!fs.existsSync(path.join(cwd, ".planning"))) {
		const worktreeRoot = resolveWorktreeRoot(cwd);
		if (worktreeRoot !== cwd) cwd = worktreeRoot;
	}

	// --ws workstream override
	const wsEqArg = args.find((arg) => arg.startsWith("--ws="));
	const wsIdx = args.indexOf("--ws");
	let ws: string | null = null;
	if (wsEqArg) {
		ws = wsEqArg.slice("--ws=".length).trim();
		if (!ws) gsdError("Missing value for --ws");
		args.splice(args.indexOf(wsEqArg), 1);
	} else if (wsIdx !== -1) {
		ws = args[wsIdx + 1];
		if (!ws || ws.startsWith("--")) gsdError("Missing value for --ws");
		args.splice(wsIdx, 2);
	} else if (process.env["GSD_WORKSTREAM"]) {
		ws = process.env["GSD_WORKSTREAM"].trim();
	} else {
		ws = getActiveWorkstream(cwd);
	}
	if (ws && !/^[a-zA-Z0-9_-]+$/.test(ws)) gsdError("Invalid workstream name");
	if (ws) process.env["GSD_WORKSTREAM"] = ws;

	// --raw flag
	const rawIndex = args.indexOf("--raw");
	const raw = rawIndex !== -1;
	if (rawIndex !== -1) args.splice(rawIndex, 1);

	// --output / -o flag  (new feature)
	let outputFormat: OutputFormat = "json";
	const outputIdx = args.findIndex((a) => a === "--output" || a === "-o");
	if (outputIdx !== -1) {
		const fmt = args[outputIdx + 1];
		if (!fmt || fmt.startsWith("--")) gsdError("Missing value for --output");
		if (fmt !== "json" && fmt !== "toon")
			gsdError('--output must be "json" or "toon"');
		outputFormat = fmt as OutputFormat;
		args.splice(outputIdx, 2);
	}

	// --pick / -p flag  (new feature — JSONPath extraction)
	let pickPath: string | null = null;
	const pickIdx = args.findIndex((a) => a === "--pick" || a === "-p");
	if (pickIdx !== -1) {
		pickPath = args[pickIdx + 1];
		if (!pickPath || pickPath.startsWith("--"))
			gsdError("Missing value for --pick");
		args.splice(pickIdx, 2);
	}

	// Legacy --pick <field> support (dot-notation, not JSONPath)
	const legacyPickIdx = args.indexOf("--pick");
	let legacyPickField: string | null = null;
	if (legacyPickIdx !== -1) {
		legacyPickField = args[legacyPickIdx + 1];
		if (!legacyPickField || legacyPickField.startsWith("--"))
			gsdError("Missing value for --pick");
		args.splice(legacyPickIdx, 2);
	}

	const command = args[0];
	if (!command) {
		gsdError(
			"Usage: gsd-tools <command> [args] [--raw] [--output json|toon] [--pick <path>] [--cwd <path>] [--ws <name>]\n" +
				"Commands: state, resolve-model, find-phase, commit, verify, frontmatter, template, " +
				"generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, init, workstream, " +
				"phase, roadmap, milestone, scaffold, progress, audit-uat, uat, validate, stats, todo, frontmatter, verify-summary",
		);
	}

	// Root resolution for commands that touch .planning/
	const SKIP_ROOT_RESOLUTION = new Set([
		"generate-slug",
		"current-timestamp",
		"verify-path-exists",
		"verify-summary",
		"template",
		"frontmatter",
		"generate-model-profiles-md",
	]);
	if (!SKIP_ROOT_RESOLUTION.has(command)) {
		cwd = findProjectRoot(cwd);
	}

	// When --pick (legacy) or --output (toon) is active, intercept stdout to reformat
	if (legacyPickField || pickPath || outputFormat !== "json") {
		const origWriteSync = fs.writeSync.bind(fs);
		const chunks: string[] = [];
		(fs as unknown as { writeSync: typeof fs.writeSync }).writeSync = (
			fd: number,
			data: string | Buffer | NodeJS.ArrayBufferView,
			...rest: unknown[]
		): number => {
			if (fd === 1) {
				chunks.push(String(data));
				return String(data).length;
			}
			return (origWriteSync as (...args: unknown[]) => number)(
				fd,
				data,
				...rest,
			);
		};
		const cleanup = () => {
			(fs as unknown as { writeSync: typeof fs.writeSync }).writeSync =
				origWriteSync as typeof fs.writeSync;
			const captured = chunks.join("");
			let jsonStr = captured;
			if (jsonStr.startsWith("@file:"))
				jsonStr = fs.readFileSync(jsonStr.slice(6), "utf-8");
			try {
				const obj = JSON.parse(jsonStr);
				let result: unknown = obj;
				if (legacyPickField) result = extractField(obj, legacyPickField) ?? "";
				const formatted = formatOutput(
					result,
					outputFormat,
					pickPath ?? undefined,
				);
				origWriteSync(1, formatted);
			} catch {
				origWriteSync(1, captured);
			}
		};
		try {
			await runCommand(command, args, cwd, raw);
			cleanup();
		} catch (e) {
			(fs as unknown as { writeSync: typeof fs.writeSync }).writeSync =
				origWriteSync as typeof fs.writeSync;
			throw e;
		}
		return;
	}

	await runCommand(command, args, cwd, raw);
}

// ─── Command router ───────────────────────────────────────────────────────────

async function runCommand(
	command: string,
	args: string[],
	cwd: string,
	raw: boolean,
): Promise<void> {
	// Lazy imports — each module is only loaded when its command is used
	switch (command) {
		// ─── state ───────────────────────────────────────────────────────────────
		case "state": {
			const state = await import("./lib/state.js");
			const sub = args[1];
			if (sub === "json") state.cmdStateJson(cwd, raw);
			else if (sub === "update") state.cmdStateUpdate(cwd, args[2], args[3]);
			else if (sub === "get") state.cmdStateGet(cwd, args[2], raw);
			else if (sub === "patch") {
				const patches: Record<string, string> = {};
				for (let i = 2; i < args.length; i += 2) {
					const key = args[i].replace(/^--/, "");
					if (key && args[i + 1] !== undefined) patches[key] = args[i + 1];
				}
				state.cmdStatePatch(cwd, patches, raw);
			} else if (sub === "advance-plan") state.cmdStateAdvancePlan(cwd, raw);
			else if (sub === "record-metric") {
				const {
					phase: p,
					plan,
					duration,
					tasks,
					files,
				} = parseNamedArgs(args, [
					"phase",
					"plan",
					"duration",
					"tasks",
					"files",
				]) as Record<string, string | null>;
				state.cmdStateRecordMetric(
					cwd,
					{ phase: p, plan, duration, tasks, files },
					raw,
				);
			} else if (sub === "update-progress")
				state.cmdStateUpdateProgress(cwd, raw);
			else if (sub === "add-decision") {
				const {
					phase: p,
					summary,
					"summary-file": sf,
					rationale,
					"rationale-file": rf,
				} = parseNamedArgs(args, [
					"phase",
					"summary",
					"summary-file",
					"rationale",
					"rationale-file",
				]) as Record<string, string | null>;
				state.cmdStateAddDecision(
					cwd,
					{
						phase: p,
						summary,
						summary_file: sf,
						rationale: rationale || "",
						rationale_file: rf,
					},
					raw,
				);
			} else if (sub === "add-blocker") {
				const { text, "text-file": tf } = parseNamedArgs(args, [
					"text",
					"text-file",
				]) as Record<string, string | null>;
				state.cmdStateAddBlocker(cwd, { text, text_file: tf }, raw);
			} else if (sub === "resolve-blocker")
				state.cmdStateResolveBlocker(
					cwd,
					(parseNamedArgs(args, ["text"]) as Record<string, string | null>)
						.text,
					raw,
				);
			else if (sub === "record-session") {
				const { "stopped-at": sa, "resume-file": rf } = parseNamedArgs(args, [
					"stopped-at",
					"resume-file",
				]) as Record<string, string | null>;
				state.cmdStateRecordSession(
					cwd,
					{ stopped_at: sa, resume_file: rf || "None" },
					raw,
				);
			} else if (sub === "begin-phase") {
				const {
					phase: p,
					name,
					plans,
				} = parseNamedArgs(args, ["phase", "name", "plans"]) as Record<
					string,
					string | null
				>;
				state.cmdStateBeginPhase(
					cwd,
					p,
					name,
					plans !== null ? parseInt(plans!, 10) : null,
					raw,
				);
			} else if (sub === "signal-waiting") {
				const {
					type,
					question,
					options: opts,
					phase: p,
				} = parseNamedArgs(args, [
					"type",
					"question",
					"options",
					"phase",
				]) as Record<string, string | null>;
				state.cmdSignalWaiting(cwd, type, question, opts, p, raw);
			} else if (sub === "signal-resume") state.cmdSignalResume(cwd, raw);
			else state.cmdStateLoad(cwd, raw);
			break;
		}

		case "resolve-model": {
			const { cmdResolveModel } = await import("./lib/commands.js");
			cmdResolveModel(cwd, args[1], raw);
			break;
		}

		case "find-phase": {
			const { cmdFindPhase } = await import("./lib/phase.js");
			cmdFindPhase(cwd, args[1], raw);
			break;
		}

		case "commit": {
			const { cmdCommit } = await import("./lib/commands.js");
			const amend = args.includes("--amend"),
				noVerify = args.includes("--no-verify");
			const filesIndex = args.indexOf("--files");
			const endIndex = filesIndex !== -1 ? filesIndex : args.length;
			const messageArgs = args
				.slice(1, endIndex)
				.filter((a) => !a.startsWith("--"));
			const message = messageArgs.join(" ") || undefined;
			const files =
				filesIndex !== -1
					? args.slice(filesIndex + 1).filter((a) => !a.startsWith("--"))
					: [];
			cmdCommit(cwd, message, files, raw, amend, noVerify);
			break;
		}

		case "commit-to-subrepo": {
			const { cmdCommitToSubrepo } = await import("./lib/commands.js");
			const filesIndex = args.indexOf("--files");
			const files =
				filesIndex !== -1
					? args.slice(filesIndex + 1).filter((a) => !a.startsWith("--"))
					: [];
			cmdCommitToSubrepo(cwd, args[1], files, raw);
			break;
		}

		case "verify-summary": {
			const { cmdVerifySummary } = await import("./lib/verify.js");
			const countIndex = args.indexOf("--check-count");
			const checkCount =
				countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
			cmdVerifySummary(cwd, args[1], checkCount, raw);
			break;
		}

		case "template": {
			const { cmdTemplateSelect, cmdTemplateFill } = await import(
				"./lib/template.js"
			);
			const sub = args[1];
			if (sub === "select") cmdTemplateSelect(cwd, args[2], raw);
			else if (sub === "fill") {
				const templateType = args[2];
				const {
					phase,
					plan,
					name,
					type,
					wave,
					fields: fieldsRaw,
				} = parseNamedArgs(args, [
					"phase",
					"plan",
					"name",
					"type",
					"wave",
					"fields",
				]) as Record<string, string | null>;
				let fields: Record<string, unknown> = {};
				if (fieldsRaw) {
					const { safeJsonParse } = await import("./lib/security.js");
					const result = safeJsonParse(fieldsRaw, { label: "--fields" });
					if (!result.ok) gsdError(result.error);
					fields = result.value as Record<string, unknown>;
				}
				cmdTemplateFill(
					cwd,
					templateType,
					{
						phase,
						plan,
						name,
						fields,
						type: type || "execute",
						wave: wave || "1",
					},
					raw,
				);
			} else gsdError("Unknown template subcommand. Available: select, fill");
			break;
		}

		case "frontmatter": {
			const fm = await import("./lib/frontmatter.js");
			const sub = args[1],
				file = args[2];
			if (sub === "get")
				fm.cmdFrontmatterGet(
					cwd,
					file,
					(parseNamedArgs(args, ["field"]) as Record<string, string | null>)
						.field,
					raw,
				);
			else if (sub === "set") {
				const { field, value } = parseNamedArgs(args, [
					"field",
					"value",
				]) as Record<string, string | null>;
				fm.cmdFrontmatterSet(
					cwd,
					file,
					field ?? undefined,
					value ?? undefined,
					raw,
				);
			} else if (sub === "merge")
				fm.cmdFrontmatterMerge(
					cwd,
					file,
					(parseNamedArgs(args, ["data"]) as Record<string, string | null>)
						.data ?? undefined,
					raw,
				);
			else if (sub === "validate")
				fm.cmdFrontmatterValidate(
					cwd,
					file,
					(parseNamedArgs(args, ["schema"]) as Record<string, string | null>)
						.schema ?? undefined,
					raw,
				);
			else
				gsdError(
					"Unknown frontmatter subcommand. Available: get, set, merge, validate",
				);
			break;
		}

		case "verify": {
			const v = await import("./lib/verify.js");
			const sub = args[1];
			if (sub === "plan-structure") v.cmdVerifyPlanStructure(cwd, args[2], raw);
			else if (sub === "phase-completeness")
				v.cmdVerifyPhaseCompleteness(cwd, args[2], raw);
			else if (sub === "references") v.cmdVerifyReferences(cwd, args[2], raw);
			else if (sub === "commits") v.cmdVerifyCommits(cwd, args.slice(2), raw);
			else if (sub === "artifacts") v.cmdVerifyArtifacts(cwd, args[2], raw);
			else if (sub === "key-links") v.cmdVerifyKeyLinks(cwd, args[2], raw);
			else
				gsdError(
					"Unknown verify subcommand. Available: plan-structure, phase-completeness, references, commits, artifacts, key-links",
				);
			break;
		}

		case "generate-slug": {
			const { cmdGenerateSlug } = await import("./lib/commands.js");
			cmdGenerateSlug(args[1], raw);
			break;
		}

		case "current-timestamp": {
			const { cmdCurrentTimestamp } = await import("./lib/commands.js");
			cmdCurrentTimestamp(args[1] || "full", raw);
			break;
		}

		case "list-todos": {
			const { cmdListTodos } = await import("./lib/commands.js");
			cmdListTodos(cwd, args[1], raw);
			break;
		}

		case "verify-path-exists": {
			const { cmdVerifyPathExists } = await import("./lib/commands.js");
			cmdVerifyPathExists(cwd, args[1], raw);
			break;
		}

		case "config-ensure-section": {
			const { cmdConfigEnsureSection } = await import("./lib/config.js");
			cmdConfigEnsureSection(cwd, raw);
			break;
		}

		case "config-set": {
			const { cmdConfigSet } = await import("./lib/config.js");
			cmdConfigSet(cwd, args[1], args[2], raw);
			break;
		}

		case "config-set-model-profile": {
			const { cmdConfigSetModelProfile } = await import("./lib/config.js");
			cmdConfigSetModelProfile(cwd, args[1], raw);
			break;
		}

		case "config-get": {
			const { cmdConfigGet } = await import("./lib/config.js");
			cmdConfigGet(cwd, args[1], raw);
			break;
		}

		case "config-new-project": {
			const { cmdConfigNewProject } = await import("./lib/config.js");
			cmdConfigNewProject(cwd, args[1], raw);
			break;
		}

		case "agent-skills": {
			const { cmdAgentSkills } = await import("./lib/init.js");
			cmdAgentSkills(cwd, args[1], raw);
			break;
		}

		case "history-digest": {
			const { cmdHistoryDigest } = await import("./lib/commands.js");
			cmdHistoryDigest(cwd, raw);
			break;
		}

		case "phases": {
			const { cmdPhasesList } = await import("./lib/phase.js");
			const sub = args[1];
			if (sub === "list") {
				const typeIndex = args.indexOf("--type"),
					phaseIndex = args.indexOf("--phase");
				cmdPhasesList(
					cwd,
					{
						type: typeIndex !== -1 ? args[typeIndex + 1] : null,
						phase: phaseIndex !== -1 ? args[phaseIndex + 1] : null,
						includeArchived: args.includes("--include-archived"),
					},
					raw,
				);
			} else gsdError("Unknown phases subcommand. Available: list");
			break;
		}

		case "roadmap": {
			const roadmap = await import("./lib/roadmap.js");
			const sub = args[1];
			if (sub === "get-phase") roadmap.cmdRoadmapGetPhase(cwd, args[2], raw);
			else if (sub === "analyze") roadmap.cmdRoadmapAnalyze(cwd, raw);
			else if (sub === "update-plan-progress")
				roadmap.cmdRoadmapUpdatePlanProgress(cwd, args[2], raw);
			else
				gsdError(
					"Unknown roadmap subcommand. Available: get-phase, analyze, update-plan-progress",
				);
			break;
		}

		case "requirements": {
			const { cmdRequirementsMarkComplete } = await import(
				"./lib/milestone.js"
			);
			if (args[1] === "mark-complete")
				cmdRequirementsMarkComplete(cwd, args.slice(2), raw);
			else
				gsdError("Unknown requirements subcommand. Available: mark-complete");
			break;
		}

		case "phase": {
			const phase = await import("./lib/phase.js");
			const sub = args[1];
			if (sub === "next-decimal") phase.cmdPhaseNextDecimal(cwd, args[2], raw);
			else if (sub === "add") {
				const idIdx = args.indexOf("--id");
				let customId: string | null = null;
				const descArgs: string[] = [];
				for (let i = 2; i < args.length; i++) {
					if (args[i] === "--id" && i + 1 < args.length) {
						customId = args[i + 1];
						i++;
					} else descArgs.push(args[i]);
				}
				phase.cmdPhaseAdd(cwd, descArgs.join(" "), raw, customId);
			} else if (sub === "insert")
				phase.cmdPhaseInsert(cwd, args[2], args.slice(3).join(" "), raw);
			else if (sub === "remove")
				phase.cmdPhaseRemove(
					cwd,
					args[2],
					{ force: args.includes("--force") },
					raw,
				);
			else if (sub === "complete") phase.cmdPhaseComplete(cwd, args[2], raw);
			else
				gsdError(
					"Unknown phase subcommand. Available: next-decimal, add, insert, remove, complete",
				);
			break;
		}

		case "milestone": {
			const { cmdMilestoneComplete } = await import("./lib/milestone.js");
			if (args[1] === "complete") {
				const milestoneName = parseMultiwordArg(args, "name");
				cmdMilestoneComplete(
					cwd,
					args[2],
					{
						name: milestoneName,
						archivePhases: args.includes("--archive-phases"),
					},
					raw,
				);
			} else gsdError("Unknown milestone subcommand. Available: complete");
			break;
		}

		case "validate": {
			const v = await import("./lib/verify.js");
			const sub = args[1];
			if (sub === "consistency") v.cmdValidateConsistency(cwd, raw);
			else if (sub === "health")
				v.cmdValidateHealth(cwd, { repair: args.includes("--repair") }, raw);
			else if (sub === "agents") v.cmdValidateAgents(cwd, raw);
			else
				gsdError(
					"Unknown validate subcommand. Available: consistency, health, agents",
				);
			break;
		}

		case "progress": {
			const { cmdProgressRender } = await import("./lib/commands.js");
			cmdProgressRender(cwd, args[1] || "json", raw);
			break;
		}

		case "audit-uat": {
			const { cmdAuditUat } = await import("./lib/uat.js");
			cmdAuditUat(cwd, raw);
			break;
		}

		case "uat": {
			const uat = await import("./lib/uat.js");
			if (args[1] === "render-checkpoint") {
				uat.cmdRenderCheckpoint(
					cwd,
					parseNamedArgs(args, ["file"]) as { file?: string | null },
					raw,
				);
			} else gsdError("Unknown uat subcommand. Available: render-checkpoint");
			break;
		}

		case "stats": {
			const { cmdStats } = await import("./lib/commands.js");
			cmdStats(cwd, args[1] || "json", raw);
			break;
		}

		case "todo": {
			const sub = args[1];
			if (sub === "complete") {
				const { cmdTodoComplete } = await import("./lib/commands.js");
				cmdTodoComplete(cwd, args[2], raw);
			} else if (sub === "match-phase") {
				const { cmdTodoMatchPhase } = await import("./lib/commands.js");
				cmdTodoMatchPhase(cwd, args[2], raw);
			} else
				gsdError("Unknown todo subcommand. Available: complete, match-phase");
			break;
		}

		case "scaffold": {
			const { cmdScaffold } = await import("./lib/commands.js");
			cmdScaffold(
				cwd,
				args[1],
				{
					phase: (
						parseNamedArgs(args, ["phase"]) as Record<string, string | null>
					).phase,
					name: parseMultiwordArg(args, "name"),
				},
				raw,
			);
			break;
		}

		case "init": {
			const init = await import("./lib/init.js");
			const workflow = args[1];
			switch (workflow) {
				case "execute-phase":
					init.cmdInitExecutePhase(cwd, args[2], raw);
					break;
				case "plan-phase":
					init.cmdInitPlanPhase(cwd, args[2], raw);
					break;
				case "new-project":
					init.cmdInitNewProject(cwd, raw);
					break;
				case "new-milestone":
					init.cmdInitNewMilestone(cwd, raw);
					break;
				case "quick":
					init.cmdInitQuick(cwd, args.slice(2).join(" "), raw);
					break;
				case "resume":
					init.cmdInitResume(cwd, raw);
					break;
				case "verify-work":
					init.cmdInitVerifyWork(cwd, args[2], raw);
					break;
				case "phase-op":
					init.cmdInitPhaseOp(cwd, args[2], raw);
					break;
				case "todos":
					init.cmdInitTodos(cwd, args[2], raw);
					break;
				case "milestone-op":
					init.cmdInitMilestoneOp(cwd, raw);
					break;
				case "map-codebase":
					init.cmdInitMapCodebase(cwd, raw);
					break;
				case "progress":
					init.cmdInitProgress(cwd, raw);
					break;
				case "manager":
					init.cmdInitManager(cwd, raw);
					break;
				case "new-workspace":
					init.cmdInitNewWorkspace(cwd, raw);
					break;
				case "list-workspaces":
					init.cmdInitListWorkspaces(cwd, raw);
					break;
				case "remove-workspace":
					init.cmdInitRemoveWorkspace(cwd, args[2], raw);
					break;
				default:
					gsdError(
						`Unknown init workflow: ${workflow}\nAvailable: execute-phase, plan-phase, new-project, new-milestone, quick, resume, verify-work, phase-op, todos, milestone-op, map-codebase, progress, manager, new-workspace, list-workspaces, remove-workspace`,
					);
			}
			break;
		}

		case "phase-plan-index": {
			const { cmdPhasePlanIndex } = await import("./lib/phase.js");
			cmdPhasePlanIndex(cwd, args[1], raw);
			break;
		}

		case "state-snapshot": {
			const { cmdStateSnapshot } = await import("./lib/state.js");
			cmdStateSnapshot(cwd, raw);
			break;
		}

		case "summary-extract": {
			const { cmdSummaryExtract } = await import("./lib/commands.js");
			const fieldsIndex = args.indexOf("--fields");
			const fields =
				fieldsIndex !== -1 ? args[fieldsIndex + 1].split(",") : null;
			cmdSummaryExtract(cwd, args[1], fields, raw);
			break;
		}

		case "websearch": {
			const { cmdWebsearch } = await import("./lib/commands.js");
			const limitIdx = args.indexOf("--limit"),
				freshnessIdx = args.indexOf("--freshness");
			await cmdWebsearch(
				args[1],
				{
					limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10,
					freshness: freshnessIdx !== -1 ? args[freshnessIdx + 1] : null,
				},
				raw,
			);
			break;
		}

		// ─── Profiling pipeline ───────────────────────────────────────────────────

		case "scan-sessions": {
			const { cmdScanSessions } = await import("./lib/profile-pipeline.js");
			const pathIdx = args.indexOf("--path");
			await cmdScanSessions(
				pathIdx !== -1 ? args[pathIdx + 1] : null,
				{ verbose: args.includes("--verbose"), json: args.includes("--json") },
				raw,
			);
			break;
		}

		case "extract-messages": {
			const { cmdExtractMessages } = await import("./lib/profile-pipeline.js");
			const sessionIdx = args.indexOf("--session"),
				limitIdx = args.indexOf("--limit"),
				pathIdx = args.indexOf("--path");
			if (!args[1] || args[1].startsWith("--"))
				gsdError(
					"Usage: gsd-tools extract-messages <project> [--session <id>] [--limit N] [--path <dir>]",
				);
			await cmdExtractMessages(
				args[1],
				{
					sessionId: sessionIdx !== -1 ? args[sessionIdx + 1] : null,
					limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null,
				},
				raw,
				pathIdx !== -1 ? args[pathIdx + 1] : null,
			);
			break;
		}

		case "profile-sample": {
			const { cmdProfileSample } = await import("./lib/profile-pipeline.js");
			const pathIdx = args.indexOf("--path"),
				limitIdx = args.indexOf("--limit"),
				maxPerIdx = args.indexOf("--max-per-project"),
				maxCharsIdx = args.indexOf("--max-chars");
			await cmdProfileSample(
				pathIdx !== -1 ? args[pathIdx + 1] : null,
				{
					limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 150,
					maxPerProject:
						maxPerIdx !== -1 ? parseInt(args[maxPerIdx + 1], 10) : null,
					maxChars:
						maxCharsIdx !== -1 ? parseInt(args[maxCharsIdx + 1], 10) : 500,
				},
				raw,
			);
			break;
		}

		// ─── Profile output ───────────────────────────────────────────────────────

		case "write-profile": {
			const { cmdWriteProfile } = await import("./lib/profile-output.js");
			const inputIdx = args.indexOf("--input"),
				outputIdx2 = args.indexOf("--output");
			if (inputIdx === -1) gsdError("--input <analysis-json-path> is required");
			cmdWriteProfile(
				cwd,
				{
					input: args[inputIdx + 1],
					output: outputIdx2 !== -1 ? args[outputIdx2 + 1] : null,
				},
				raw,
			);
			break;
		}

		case "profile-questionnaire": {
			const { cmdProfileQuestionnaire } = await import(
				"./lib/profile-output.js"
			);
			const answersIdx = args.indexOf("--answers");
			cmdProfileQuestionnaire(
				{ answers: answersIdx !== -1 ? args[answersIdx + 1] : null },
				raw,
			);
			break;
		}

		case "generate-dev-preferences": {
			const { cmdGenerateDevPreferences } = await import(
				"./lib/profile-output.js"
			);
			const analysisIdx = args.indexOf("--analysis"),
				outputIdx2 = args.indexOf("--output"),
				stackIdx = args.indexOf("--stack");
			cmdGenerateDevPreferences(
				cwd,
				{
					analysis: analysisIdx !== -1 ? args[analysisIdx + 1] : null,
					output: outputIdx2 !== -1 ? args[outputIdx2 + 1] : null,
					stack: stackIdx !== -1 ? args[stackIdx + 1] : null,
				},
				raw,
			);
			break;
		}

		case "generate-claude-profile": {
			const { cmdGenerateClaudeProfile } = await import(
				"./lib/profile-output.js"
			);
			const analysisIdx = args.indexOf("--analysis"),
				outputIdx2 = args.indexOf("--output");
			cmdGenerateClaudeProfile(
				cwd,
				{
					analysis: analysisIdx !== -1 ? args[analysisIdx + 1] : null,
					output: outputIdx2 !== -1 ? args[outputIdx2 + 1] : null,
					global: args.includes("--global"),
				},
				raw,
			);
			break;
		}

		case "generate-claude-md": {
			const { cmdGenerateClaudeMd } = await import("./lib/profile-output.js");
			const outputIdx2 = args.indexOf("--output");
			const harnessIdx = args.indexOf("--harness");
			cmdGenerateClaudeMd(
				cwd,
				{
					output: outputIdx2 !== -1 ? args[outputIdx2 + 1] : null,
					auto: args.includes("--auto"),
					force: args.includes("--force"),
					harness: harnessIdx !== -1 ? args[harnessIdx + 1] : null,
				},
				raw,
			);
			break;
		}

		case "workstream": {
			const ws2 = await import("./lib/workstream.js");
			const sub = args[1];
			if (sub === "create") {
				const migrateNameIdx = args.indexOf("--migrate-name");
				ws2.cmdWorkstreamCreate(
					cwd,
					args[2],
					{
						migrate: !args.includes("--no-migrate"),
						migrateName:
							migrateNameIdx !== -1 ? args[migrateNameIdx + 1] : null,
					},
					raw,
				);
			} else if (sub === "list") ws2.cmdWorkstreamList(cwd, raw);
			else if (sub === "status") ws2.cmdWorkstreamStatus(cwd, args[2], raw);
			else if (sub === "complete")
				ws2.cmdWorkstreamComplete(cwd, args[2], {}, raw);
			else if (sub === "set") ws2.cmdWorkstreamSet(cwd, args[2], raw);
			else if (sub === "get") ws2.cmdWorkstreamGet(cwd, raw);
			else if (sub === "progress") ws2.cmdWorkstreamProgress(cwd, raw);
			else
				gsdError(
					"Unknown workstream subcommand. Available: create, list, status, complete, set, get, progress",
				);
			break;
		}

		case "generate-model-profiles-md": {
			const { generateModelProfilesMd, HARNESS_CONFIG } = await import(
				"./lib/model-profiles.js"
			);
			const harnessIdx = args.indexOf("--harness"),
				outputIdx2 = args.indexOf("--output");
			const toStdout = args.includes("--stdout");
			let harness = harnessIdx !== -1 ? args[harnessIdx + 1] : null;
			const outputOverride = outputIdx2 !== -1 ? args[outputIdx2 + 1] : null;
			if (!harness) {
				const binDir = __dirname;
				const match = binDir.match(/\.([a-z]+)\/get-shit-done\/bin/);
				harness = match ? match[1] : "agent";
			}
			if (!HARNESS_CONFIG[harness])
				gsdError(
					`Unknown harness: "${harness}". Valid values: ${Object.keys(HARNESS_CONFIG).join(", ")}`,
				);
			const content = generateModelProfilesMd(harness);
			if (toStdout) {
				process.stdout.write(content);
				break;
			}
			const outPath = outputOverride
				? path.resolve(outputOverride)
				: path.resolve(__dirname, "..", "references", "model-profiles.md");
			import("fs").then(({ writeFileSync }) =>
				writeFileSync(outPath, content, "utf-8"),
			);
			fs.writeFileSync(outPath, content, "utf-8");
			raw
				? process.stdout.write(outPath)
				: process.stdout.write(`Wrote ${outPath}\n`);
			break;
		}

		default:
			gsdError(`Unknown command: ${command}`);
	}
}

main().catch((err) => {
	process.stderr.write("Fatal: " + (err as Error).message + "\n");
	process.exit(1);
});
