/**
 * schemas.ts - Zod schemas for all .planning/ file structures.
 *
 * Covers: STATE.md frontmatter, ROADMAP.md phase entries, PLAN.md frontmatter,
 *         UAT.md checkpoint structure, and .planning/config.json.
 *
 * All schemas are permissive (use .passthrough()) to accept 100% of valid
 * GSD v1.30.0 .planning/ files without error, even if they carry extra fields.
 *
 * TypeScript types are exported via z.infer<>.
 */

import { z } from "zod";

// ─── STATE.md Frontmatter ─────────────────────────────────────────────────────

/**
 * Schema for STATE.md frontmatter key-value fields.
 *
 * STATE.md uses a bespoke "key: value" format (not strict YAML), parsed via
 * stateExtractField(). All fields are optional strings - the file may contain
 * only a subset depending on project state.
 */
export const StateFrontmatterSchema = z
	.object({
		/** Active milestone version (e.g. "1.0.0") */
		milestone: z.string().optional(),
		/** Human-readable milestone name */
		milestone_name: z.string().optional(),
		/** Current phase number (e.g. "3", "3.1") */
		current_phase: z.string().optional(),
		/** Descriptive name of the current phase */
		current_phase_name: z.string().optional(),
		/** Current plan filename (e.g. "001-PLAN.md") */
		current_plan: z.string().optional(),
		/** Total number of phases in the milestone */
		total_phases: z.coerce.number().int().nonnegative().optional(),
		/** Total number of plans within the current phase */
		total_plans_in_phase: z.coerce.number().int().nonnegative().optional(),
		/**
		 * Workflow status - free-text field.
		 * Common values: "In Progress", "Paused", "Stopped", "Complete".
		 */
		status: z.string().optional(),
		/** Percentage completion (e.g. "42%") */
		progress: z.string().optional(),
		/** ISO-8601 timestamp or human-readable last-activity string */
		last_activity: z.string().optional(),
		/** ISO-8601 or human-readable timestamp when work was paused */
		paused_at: z.string().optional(),
		/** ISO-8601 or human-readable timestamp when work was stopped */
		stopped_at: z.string().optional(),
	})
	.passthrough();

export type StateFrontmatter = z.infer<typeof StateFrontmatterSchema>;

// ─── ROADMAP.md Phase Entry ───────────────────────────────────────────────────

/**
 * Schema for a single parsed phase entry from ROADMAP.md.
 *
 * This represents the structured data returned by cmdRoadmapGetPhase() rather
 * than raw markdown - the roadmap file itself is free-form markdown.
 */
export const RoadmapPhaseEntrySchema = z
	.object({
		/** Indicates a successful lookup */
		found: z.literal(true),
		/** Phase identifier, e.g. "3", "3.1", "10B" */
		phase_number: z.string(),
		/** Human-readable phase title */
		phase_name: z.string(),
		/** One-line goal statement extracted from **Goal:** line (null if absent) */
		goal: z.string().nullable(),
		/** Ordered success criteria items */
		success_criteria: z.array(z.string()).default([]),
		/** Raw markdown section text (for debugging/display) */
		section: z.string().optional(),
	})
	.passthrough();

export type RoadmapPhaseEntry = z.infer<typeof RoadmapPhaseEntrySchema>;

// ─── PLAN.md Frontmatter ──────────────────────────────────────────────────────

/**
 * Schema for PLAN.md YAML frontmatter (written by /gsd-plan-phase).
 *
 * GSD v1.30.0 requires these 8 fields. Additional fields may be present
 * (handled by .passthrough()).
 */
export const PlanFrontmatterSchema = z
	.object({
		/** Phase number this plan belongs to */
		phase: z.union([z.string(), z.number()]),
		/** Plan slug / short identifier (e.g. "001") */
		plan: z.union([z.string(), z.number()]),
		/**
		 * Plan type.
		 * Common values: "implementation", "research", "verification", "ui".
		 */
		type: z.string(),
		/**
		 * Execution wave for parallelization (e.g. 1, 2, "1").
		 * Wave 1 plans may run in parallel; later waves depend on earlier ones.
		 */
		wave: z.union([z.string(), z.number()]),
		/**
		 * Dependency list - plan slugs that must complete before this plan runs.
		 * Can be an empty string, a comma-separated list, or an array.
		 */
		depends_on: z.union([z.string(), z.array(z.string())]),
		/**
		 * Files this plan intends to create or modify.
		 * Can be an empty string, comma-separated list, or array.
		 */
		files_modified: z.union([z.string(), z.array(z.string())]),
		/** Whether this plan can run without human intervention */
		autonomous: z.union([z.boolean(), z.string()]),
		/**
		 * Must-have deliverables / acceptance items.
		 * Can be an empty string, a comma-separated list, or an array.
		 */
		must_haves: z.union([z.string(), z.array(z.string())]),
	})
	.passthrough();

export type PlanFrontmatter = z.infer<typeof PlanFrontmatterSchema>;

/**
 * Schema for SUMMARY.md frontmatter (produced after phase execution).
 */
export const SummaryFrontmatterSchema = z
	.object({
		/** Phase number (string or numeric) */
		phase: z.union([z.string(), z.number()]),
		/** Plan slug */
		plan: z.union([z.string(), z.number()]),
		/** Subsystem or area this plan affected */
		subsystem: z.string(),
		/** Comma-separated tags or array */
		tags: z.union([z.string(), z.array(z.string())]),
		/** Human-readable duration string (e.g. "45m", "2h") */
		duration: z.string(),
		/** ISO-8601 completion timestamp or human-readable date */
		completed: z.string(),
	})
	.passthrough();

export type SummaryFrontmatter = z.infer<typeof SummaryFrontmatterSchema>;

/**
 * Schema for VERIFICATION.md frontmatter.
 */
export const VerificationFrontmatterSchema = z
	.object({
		/** Phase number */
		phase: z.union([z.string(), z.number()]),
		/** Whether verification passed */
		verified: z.union([z.boolean(), z.string()]),
		/** Verification status label (e.g. "pass", "fail", "partial") */
		status: z.string(),
		/** Numeric score (0–100) */
		score: z.union([z.number(), z.string()]),
	})
	.passthrough();

export type VerificationFrontmatter = z.infer<
	typeof VerificationFrontmatterSchema
>;

// ─── UAT.md Checkpoint Structure ─────────────────────────────────────────────

/**
 * Schema for a single UAT checkpoint item parsed from a -UAT.md file.
 *
 * Matches the UatItem interface used by cmdAuditUat().
 */
export const UatCheckpointSchema = z
	.object({
		/** Optional numeric test index (1-based) */
		test: z.number().int().positive().optional(),
		/** Human-readable test name */
		name: z.string(),
		/** Expected outcome description */
		expected: z.string().optional(),
		/** Actual result ("pass", "fail", "blocked", "pending", etc.) */
		result: z.string(),
		/** Grouping category for this test */
		category: z.string(),
		/** Optional reason if test failed or is blocked */
		reason: z.string().optional(),
		/** Optional reference to blocking issue/phase */
		blocked_by: z.string().optional(),
	})
	.passthrough();

export type UatCheckpoint = z.infer<typeof UatCheckpointSchema>;

/**
 * Schema for the full structured UAT audit result (as returned by pi-gsd-tools).
 */
export const UatAuditResultSchema = z
	.object({
		phase: z.string(),
		phase_dir: z.string(),
		file: z.string(),
		file_path: z.string(),
		type: z.literal("uat"),
		status: z.string(),
		items: z.array(UatCheckpointSchema),
	})
	.passthrough();

export type UatAuditResult = z.infer<typeof UatAuditResultSchema>;

// ─── .planning/config.json ────────────────────────────────────────────────────

const GitConfigSchema = z
	.object({
		branching_strategy: z
			.enum(["none", "phase", "milestone", "workstream"])
			.default("none"),
		phase_branch_template: z.string().default("gsd/phase-{phase}-{slug}"),
		milestone_branch_template: z.string().default("gsd/{milestone}-{slug}"),
		quick_branch_template: z.string().nullable().default(null),
	})
	.passthrough();

const WorkflowConfigSchema = z
	.object({
		research: z.boolean().default(true),
		plan_check: z.boolean().default(true),
		verifier: z.boolean().default(true),
		nyquist_validation: z.boolean().default(true),
		auto_advance: z.boolean().default(false),
		node_repair: z.boolean().default(true),
		node_repair_budget: z.number().int().nonnegative().default(2),
		auto_retry_audit: z.boolean().default(true),
		auto_retry_audit_budget: z.number().int().nonnegative().default(1),
		auto_retry_tech_debt: z.boolean().default(true),
		auto_retry_tech_debt_budget: z.number().int().nonnegative().default(1),
		ui_phase: z.boolean().default(true),
		ui_safety_gate: z.boolean().default(true),
		text_mode: z.boolean().default(false),
		research_before_questions: z.boolean().default(false),
		discuss_mode: z.string().default("discuss"),
		skip_discuss: z.boolean().default(false),
		_auto_chain_active: z.boolean().default(false),
	})
	.passthrough();

const HooksConfigSchema = z
	.object({
		context_warnings: z.boolean().default(true),
		workflow_guard: z.boolean().default(false),
	})
	.passthrough();

/**
 * Schema for .planning/config.json.
 *
 * Generated by /gsd-new-project (cmdConfigNewProject) and persisted for the
 * lifetime of the project. The outer object uses .passthrough() so that
 * user-added agent_skills entries and future GSD keys are accepted.
 */
export const PlanningConfigSchema = z
	.object({
		model_profile: z
			.enum(["quality", "balanced", "budget", "inherit"])
			.default("balanced"),
		commit_docs: z.boolean().default(true),
		parallelization: z.boolean().default(true),
		search_gitignored: z.boolean().default(false),
		brave_search: z.boolean().default(false),
		firecrawl: z.boolean().default(false),
		exa_search: z.boolean().default(false),
		git: GitConfigSchema.default({}),
		workflow: WorkflowConfigSchema.default({}),
		hooks: HooksConfigSchema.default({}),
		/** Map of agent-type → enabled flag or config object */
		agent_skills: z.record(z.string(), z.unknown()).default({}),
	})
	.passthrough();

export type PlanningConfig = z.infer<typeof PlanningConfigSchema>;
export type GitConfig = z.infer<typeof GitConfigSchema>;
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
export type HooksConfig = z.infer<typeof HooksConfigSchema>;
