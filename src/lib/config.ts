/**
 * config.ts — Planning config CRUD operations.
 *
 * Ported from lib/config.cjs. All command signatures preserved.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { gsdError, output, planningRoot } from "./core.js";
import {
	formatAgentToModelMapAsTable,
	getAgentToModelMapForProfile,
	type ProfileKey,
	VALID_PROFILES,
} from "./model-profiles.js";
import type { PlanningConfig } from "./schemas.js";

// ─── Valid config keys ────────────────────────────────────────────────────────

const VALID_CONFIG_KEYS = new Set([
	"mode",
	"granularity",
	"parallelization",
	"commit_docs",
	"model_profile",
	"search_gitignored",
	"brave_search",
	"firecrawl",
	"exa_search",
	"workflow.research",
	"workflow.plan_check",
	"workflow.verifier",
	"workflow.nyquist_validation",
	"workflow.ui_phase",
	"workflow.ui_safety_gate",
	"workflow.auto_advance",
	"workflow.node_repair",
	"workflow.node_repair_budget",
	"workflow.text_mode",
	"workflow.research_before_questions",
	"workflow.discuss_mode",
	"workflow.skip_discuss",
	"workflow._auto_chain_active",
	"git.branching_strategy",
	"git.phase_branch_template",
	"git.milestone_branch_template",
	"git.quick_branch_template",
	"planning.commit_docs",
	"planning.search_gitignored",
	"hooks.context_warnings",
]);

const CONFIG_KEY_SUGGESTIONS: Record<string, string> = {
	"workflow.nyquist_validation_enabled": "workflow.nyquist_validation",
	"agents.nyquist_validation_enabled": "workflow.nyquist_validation",
	"nyquist.validation_enabled": "workflow.nyquist_validation",
	"hooks.research_questions": "workflow.research_before_questions",
	"workflow.research_questions": "workflow.research_before_questions",
};

function isValidConfigKey(keyPath: string): boolean {
	if (VALID_CONFIG_KEYS.has(keyPath)) return true;
	if (/^agent_skills\.[a-zA-Z0-9_-]+$/.test(keyPath)) return true;
	return false;
}

function validateKnownConfigKeyPath(keyPath: string): void {
	const suggested = CONFIG_KEY_SUGGESTIONS[keyPath];
	if (suggested)
		gsdError(`Unknown config key: ${keyPath}. Did you mean ${suggested}?`);
}

// ─── New project config builder ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNewProjectConfig(
	userChoices: Partial<PlanningConfig>,
): Record<string, unknown> {
	const choices = userChoices || {};
	const homedir = os.homedir();

	const braveKeyFile = path.join(homedir, ".gsd", "brave_api_key");
	const hasBraveSearch = !!(
		process.env["BRAVE_API_KEY"] || fs.existsSync(braveKeyFile)
	);
	const firecrawlKeyFile = path.join(homedir, ".gsd", "firecrawl_api_key");
	const hasFirecrawl = !!(
		process.env["FIRECRAWL_API_KEY"] || fs.existsSync(firecrawlKeyFile)
	);
	const exaKeyFile = path.join(homedir, ".gsd", "exa_api_key");
	const hasExaSearch = !!(
		process.env["EXA_API_KEY"] || fs.existsSync(exaKeyFile)
	);

	const globalDefaultsPath = path.join(homedir, ".gsd", "defaults.json");
	let userDefaults: Record<string, unknown> = {};
	try {
		if (fs.existsSync(globalDefaultsPath)) {
			userDefaults = JSON.parse(fs.readFileSync(globalDefaultsPath, "utf-8"));
			if ("depth" in userDefaults && !("granularity" in userDefaults)) {
				const m: Record<string, string> = {
					quick: "coarse",
					standard: "standard",
					comprehensive: "fine",
				};
				userDefaults.granularity =
					m[userDefaults.depth as string] || (userDefaults.depth as string);
				delete userDefaults.depth;
				try {
					fs.writeFileSync(
						globalDefaultsPath,
						JSON.stringify(userDefaults, null, 2),
						"utf-8",
					);
				} catch {
					/* ok */
				}
			}
		}
	} catch {
		/* ok */
	}

	const hardcoded = {
		model_profile: "balanced",
		commit_docs: true,
		parallelization: true,
		search_gitignored: false,
		brave_search: hasBraveSearch,
		firecrawl: hasFirecrawl,
		exa_search: hasExaSearch,
		git: {
			branching_strategy: "none",
			phase_branch_template: "gsd/phase-{phase}-{slug}",
			milestone_branch_template: "gsd/{milestone}-{slug}",
			quick_branch_template: null,
		},
		workflow: {
			research: true,
			plan_check: true,
			verifier: true,
			nyquist_validation: true,
			auto_advance: false,
			node_repair: true,
			node_repair_budget: 2,
			ui_phase: true,
			ui_safety_gate: true,
			text_mode: false,
			research_before_questions: false,
			discuss_mode: "discuss",
			skip_discuss: false,
		},
		hooks: { context_warnings: true },
		agent_skills: {},
	};

	return {
		...hardcoded,
		...userDefaults,
		...choices,
		git: {
			...hardcoded.git,
			...(userDefaults.git || {}),
			...(choices.git || {}),
		},
		workflow: {
			...hardcoded.workflow,
			...(userDefaults.workflow || {}),
			...(choices.workflow || {}),
		},
		hooks: {
			...hardcoded.hooks,
			...(userDefaults.hooks || {}),
			...(choices.hooks || {}),
		},
		agent_skills: {
			...hardcoded.agent_skills,
			...(userDefaults.agent_skills || {}),
			...(choices.agent_skills || {}),
		},
	};
}

// ─── ensureConfigFile ─────────────────────────────────────────────────────────

export function ensureConfigFile(cwd: string): {
	created: boolean;
	reason?: string;
	path?: string;
} {
	const planningBase = planningRoot(cwd);
	const configPath = path.join(planningBase, "config.json");
	try {
		if (!fs.existsSync(planningBase))
			fs.mkdirSync(planningBase, { recursive: true });
	} catch (err) {
		gsdError("Failed to create .planning directory: " + (err as Error).message);
	}
	if (fs.existsSync(configPath))
		return { created: false, reason: "already_exists" };
	const config = buildNewProjectConfig({});
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
		return { created: true, path: ".planning/config.json" };
	} catch (err) {
		gsdError("Failed to create config.json: " + (err as Error).message);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setConfigValue(
	cwd: string,
	keyPath: string,
	parsedValue: any,
):
	| { updated: boolean; key: string; value: unknown; previousValue: unknown }
	| undefined {
	const configPath = path.join(planningRoot(cwd), "config.json");
	let config: Record<string, unknown> = {};
	try {
		if (fs.existsSync(configPath))
			config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
				string,
				unknown
			>;
	} catch (err) {
		gsdError("Failed to read config.json: " + (err as Error).message);
	}
	const keys = keyPath.split(".");
	let current: Record<string, unknown> = config;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (current[key] === undefined || typeof current[key] !== "object")
			current[key] = {};
		current = current[key] as Record<string, unknown>;
	}
	const previousValue = current[keys[keys.length - 1]];
	current[keys[keys.length - 1]] = parsedValue;
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
		return { updated: true, key: keyPath, value: parsedValue, previousValue };
	} catch (err) {
		gsdError("Failed to write config.json: " + (err as Error).message);
	}
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function cmdConfigNewProject(
	cwd: string,
	choicesJson: string | undefined,
	raw: boolean,
): void {
	const planningBase = planningRoot(cwd);
	const configPath = path.join(planningBase, "config.json");
	if (fs.existsSync(configPath)) {
		output({ created: false, reason: "already_exists" }, raw, "exists");
		return;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let userChoices: Partial<PlanningConfig> = {};
	if (choicesJson && choicesJson.trim()) {
		try {
			userChoices = JSON.parse(choicesJson) as Partial<PlanningConfig>;
		} catch (err) {
			gsdError(
				"Invalid JSON for config-new-project: " + (err as Error).message,
			);
		}
	}
	try {
		if (!fs.existsSync(planningBase))
			fs.mkdirSync(planningBase, { recursive: true });
	} catch (err) {
		gsdError("Failed to create .planning directory: " + (err as Error).message);
	}
	const config = buildNewProjectConfig(userChoices);
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
		output({ created: true, path: ".planning/config.json" }, raw, "created");
	} catch (err) {
		gsdError("Failed to write config.json: " + (err as Error).message);
	}
}

export function cmdConfigEnsureSection(cwd: string, raw: boolean): void {
	const result = ensureConfigFile(cwd);
	output(result, raw, result?.created ? "created" : "exists");
}

export function cmdConfigSet(
	cwd: string,
	keyPath: string | undefined,
	value: string | undefined,
	raw: boolean,
): void {
	if (!keyPath) gsdError("Usage: config-set <key.path> <value>");
	validateKnownConfigKeyPath(keyPath);
	if (!isValidConfigKey(keyPath))
		gsdError(
			`Unknown config key: "${keyPath}". Valid keys: ${[...VALID_CONFIG_KEYS].sort().join(", ")}, agent_skills.<agent-type>`,
		);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let parsedValue: any = value;
	if (value === "true") parsedValue = true;
	else if (value === "false") parsedValue = false;
	else if (value !== undefined && !isNaN(Number(value)) && value !== "")
		parsedValue = Number(value);
	else if (
		typeof value === "string" &&
		(value.startsWith("[") || value.startsWith("{"))
	) {
		try {
			parsedValue = JSON.parse(value);
		} catch {
			/* keep as string */
		}
	}
	const result = setConfigValue(cwd, keyPath, parsedValue);
	output(result, raw, `${keyPath}=${parsedValue}`);
}

export function cmdConfigGet(
	cwd: string,
	keyPath: string | undefined,
	raw: boolean,
): void {
	if (!keyPath) gsdError("Usage: config-get <key.path>");
	const configPath = path.join(planningRoot(cwd), "config.json");
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let config: Record<string, unknown> = {};
	try {
		if (fs.existsSync(configPath))
			config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
				string,
				unknown
			>;
		else gsdError("No config.json found at " + configPath);
	} catch (err) {
		if ((err as Error).message.startsWith("Error:")) throw err;
		gsdError("Failed to read config.json: " + (err as Error).message);
	}
	const keys = keyPath.split(".");
	let current: unknown = config;
	for (const key of keys) {
		if (
			current === undefined ||
			current === null ||
			typeof current !== "object"
		)
			gsdError(`Key not found: ${keyPath}`);
		current = (current as Record<string, unknown>)[key];
	}
	if (current === undefined) gsdError(`Key not found: ${keyPath}`);
	output(current, raw, String(current));
}

export function cmdConfigSetModelProfile(
	cwd: string,
	profile: string | undefined,
	raw: boolean,
): void {
	if (!profile)
		gsdError(`Usage: config-set-model-profile <${VALID_PROFILES.join("|")}>`);
	const normalizedProfile = profile.toLowerCase().trim() as ProfileKey;
	if (!VALID_PROFILES.includes(normalizedProfile))
		gsdError(
			`Invalid profile '${profile}'. Valid profiles: ${VALID_PROFILES.join(", ")}`,
		);
	ensureConfigFile(cwd);
	const result = setConfigValue(cwd, "model_profile", normalizedProfile);
	const previousProfile = (result?.previousValue as string) || "balanced";
	const agentToModelMap = getAgentToModelMapForProfile(normalizedProfile);
	const table = formatAgentToModelMapAsTable(agentToModelMap);
	const didChange = previousProfile !== normalizedProfile;
	const rawValue = didChange
		? `✓ Model profile set to: ${normalizedProfile} (was: ${previousProfile})\n\nAgents will now use:\n\n${table}\nNext spawned agents will use the new profile.`
		: `✓ Model profile is already set to: ${normalizedProfile}\n\nAgents are using:\n\n${table}`;
	output(
		{
			updated: true,
			profile: normalizedProfile,
			previousProfile,
			agentToModelMap,
		},
		raw,
		rawValue,
	);
}
