/**
 * Mapping of GSD agent to model for each profile.
 *
 * This is the single source of truth for model profiles. The markdown reference file at
 * `get-shit-done/references/model-profiles.md` is auto-generated from this data via:
 *
 *   node gsd-tools.cjs generate-model-profiles-md [--harness <name>]
 *
 * Do NOT edit `references/model-profiles.md` by hand — changes will be overwritten.
 * To update profiles, edit MODEL_PROFILES below, then regenerate.
 */
const MODEL_PROFILES = {
  'gsd-planner': { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
  'gsd-roadmapper': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-executor': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-phase-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-project-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-codebase-mapper': { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'gsd-verifier': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-plan-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-integration-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-nyquist-auditor': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-ui-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-ui-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-ui-auditor': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
};
const VALID_PROFILES = Object.keys(MODEL_PROFILES['gsd-planner']);

/**
 * Harness configuration used by the markdown generator.
 *
 * Each entry describes the textual and command-syntax variations needed for
 * a specific harness's `references/model-profiles.md` file.
 *
 * Fields:
 *   runtimeName         — how the host tool is named in prose ("Claude", "Cursor", …)
 *   cmdPrefix           — slash-command prefix used by this harness ("/gsd:", "/gsd-", "$gsd-")
 *   providerHeader      — H2 heading for the non-Anthropic-provider section
 *   providerIntro       — opening sentence for that section
 *   rationaleAlias      — tool name used in the `inherit` design rationale paragraph
 *   nonRuntimeHeading   — H2 heading for the "using other runtimes" section
 *   nonRuntimeIntro     — opening sentence for that section
 */
const HARNESS_CONFIG = {
  claude: {
    runtimeName: 'Claude',
    cmdPrefix: '/gsd:',
    providerHeader: 'Using Claude Code with Non-Anthropic Providers (OpenRouter, Local)',
    providerIntro: "If you're using Claude Code with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:",
    rationaleAlias: "Claude Code",
    nonRuntimeHeading: 'Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI)',
    nonRuntimeIntro: "When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
  gemini: {
    runtimeName: 'Gemini CLI',
    cmdPrefix: '/gsd:',
    providerHeader: 'Using Gemini CLI with Non-Google Providers (OpenRouter, Local)',
    providerIntro: "If you're using Gemini CLI with OpenRouter, a local model, or any non-Google provider, set the `inherit` profile to prevent GSD from calling Google models for subagents:",
    rationaleAlias: "Gemini CLI",
    nonRuntimeHeading: 'Using Non-Gemini-CLI Runtimes (Codex, OpenCode, Claude Code)',
    nonRuntimeIntro: "When installed for a non-Gemini-CLI runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
  cursor: {
    runtimeName: 'Claude',
    cmdPrefix: '/gsd-',
    providerHeader: 'Using Cursor with Non-Anthropic Providers (OpenRouter, Local)',
    providerIntro: "If you're using Cursor with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:",
    rationaleAlias: "Cursor",
    nonRuntimeHeading: 'Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI)',
    nonRuntimeIntro: "When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
  windsurf: {
    runtimeName: 'Claude',
    cmdPrefix: '/gsd-',
    providerHeader: 'Using Windsurf with Non-Anthropic Providers (OpenRouter, Local)',
    providerIntro: "If you're using Windsurf with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:",
    rationaleAlias: "Windsurf",
    nonRuntimeHeading: 'Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI)',
    nonRuntimeIntro: "When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
  agent: {
    runtimeName: 'Claude',
    cmdPrefix: '/gsd-',
    providerHeader: 'Using Claude Code with Non-Anthropic Providers (OpenRouter, Local)',
    providerIntro: "If you're using Claude Code with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:",
    rationaleAlias: "Claude Code",
    nonRuntimeHeading: 'Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI)',
    nonRuntimeIntro: "When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
  github: {
    runtimeName: 'Claude',
    cmdPrefix: '/gsd-',
    providerHeader: 'Using Claude Code with Non-Anthropic Providers (OpenRouter, Local)',
    providerIntro: "If you're using Claude Code with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:",
    rationaleAlias: "Claude Code",
    nonRuntimeHeading: 'Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI)',
    nonRuntimeIntro: "When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
  opencode: {
    runtimeName: 'Claude',
    cmdPrefix: '/gsd-',
    providerHeader: 'Using Claude Code with Non-Anthropic Providers (OpenRouter, Local)',
    providerIntro: "If you're using Claude Code with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:",
    rationaleAlias: "Claude Code",
    nonRuntimeHeading: 'Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI)',
    nonRuntimeIntro: "When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
  codex: {
    runtimeName: 'Claude',
    cmdPrefix: '$gsd-',
    providerHeader: 'Using Claude Code with Non-Anthropic Providers (OpenRouter, Local)',
    providerIntro: "If you're using Claude Code with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:",
    rationaleAlias: "Claude Code",
    nonRuntimeHeading: 'Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI)',
    nonRuntimeIntro: "When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: \"omit\"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.",
  },
};

/**
 * Generates the full `references/model-profiles.md` content from MODEL_PROFILES.
 *
 * @param {string} [harness='agent'] - The harness key from HARNESS_CONFIG
 * @returns {string} Complete markdown file content, ready to write to disk
 */
function generateModelProfilesMd(harness = 'agent') {
  const cfg = HARNESS_CONFIG[harness] || HARNESS_CONFIG['agent'];
  const { runtimeName, cmdPrefix, providerHeader, providerIntro, rationaleAlias } = cfg; // nonRuntimeHeading/nonRuntimeIntro destructured below

  // ── Profile table ──────────────────────────────────────────────────────────
  const profiles = VALID_PROFILES; // ['quality', 'balanced', 'budget']
  const agents = Object.keys(MODEL_PROFILES);

  // Header row + separator — profile columns use backtick formatting in markdown
  const headerCols = ['Agent', ...profiles.map(p => '`' + p + '`'), '`inherit`'];
  const headerRow = '| ' + headerCols.join(' | ') + ' |';
  // Separator dashes match column header width for tidy rendering
  const sepRow = '|' + headerCols.map((col) => '-'.repeat(col.length + 2)).join('|') + '|';

  const tableRows = agents.map((agent) => {
    const profileValues = profiles.map((p) => MODEL_PROFILES[agent][p]);
    const cols = [agent, ...profileValues, 'inherit'];
    return '| ' + cols.join(' | ') + ' |';
  });

  const profileTable = [headerRow, sepRow, ...tableRows].join('\n');

  // ── Non-runtime section heading ────────────────────────────────────────────
  const { nonRuntimeHeading, nonRuntimeIntro } = cfg;

  // ── Command references (harness-specific prefix) ───────────────────────────
  const settingsCmd = `${cmdPrefix}settings`;
  const setProfileCmd = `${cmdPrefix}set-profile <profile>`;

  return `<!-- AUTO-GENERATED — do not edit by hand.
     Source of truth: get-shit-done/bin/lib/model-profiles.cjs
     Regenerate with: node get-shit-done/bin/gsd-tools.cjs generate-model-profiles-md --harness ${harness}
-->
# Model Profiles

Model profiles control which ${runtimeName} model each GSD agent uses. This allows balancing quality vs token spend, or inheriting the currently selected session model.

## Profile Definitions

${profileTable}

## Profile Philosophy

**quality** - Maximum reasoning power
- Opus for all decision-making agents
- Sonnet for read-only verification
- Use when: quota available, critical architecture work

**balanced** (default) - Smart allocation
- Opus only for planning (where architecture decisions happen)
- Sonnet for execution and research (follows explicit instructions)
- Sonnet for verification (needs reasoning, not just pattern matching)
- Use when: normal development, good balance of quality and cost

**budget** - Minimal Opus usage
- Sonnet for anything that writes code
- Haiku for research and verification
- Use when: conserving quota, high-volume work, less critical phases

**inherit** - Follow the current session model
- All agents resolve to \`inherit\`
- Best when you switch models interactively (for example OpenCode \`/model\`)
- **Required when using non-Anthropic providers** (OpenRouter, local models, etc.) — otherwise GSD may call Anthropic models directly, incurring unexpected costs
- Use when: you want GSD to follow your currently selected runtime model

## ${nonRuntimeHeading}

${nonRuntimeIntro}

To assign different models to different agents, add \`model_overrides\` with model IDs your runtime recognizes:

\`\`\`json
{
  "resolve_model_ids": "omit",
  "model_overrides": {
    "gsd-planner": "o3",
    "gsd-executor": "o4-mini",
    "gsd-debugger": "o3",
    "gsd-codebase-mapper": "o4-mini"
  }
}
\`\`\`

The same tiering logic applies: stronger models for planning and debugging, cheaper models for execution and mapping.

## ${providerHeader}

${providerIntro}

\`\`\`bash
# Via settings command
${settingsCmd}
# → Select "Inherit" for model profile

# Or manually in .planning/config.json
{
  "model_profile": "inherit"
}
\`\`\`

Without \`inherit\`, GSD's default \`balanced\` profile spawns specific Anthropic models (\`opus\`, \`sonnet\`, \`haiku\`) for each agent type, which can result in additional API costs through your non-Anthropic provider.

## Resolution Logic

Orchestrators resolve model before spawning:

\`\`\`
1. Read .planning/config.json
2. Check model_overrides for agent-specific override
3. If no override, look up agent in profile table
4. Pass model parameter to Task call
\`\`\`

## Per-Agent Overrides

Override specific agents without changing the entire profile:

\`\`\`json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "opus",
    "gsd-planner": "haiku"
  }
}
\`\`\`

Overrides take precedence over the profile. Valid values: \`opus\`, \`sonnet\`, \`haiku\`, \`inherit\`, or any fully-qualified model ID (e.g., \`"o3"\`, \`"openai/o3"\`, \`"google/gemini-2.5-pro"\`).

## Switching Profiles

Runtime: \`${setProfileCmd}\`

Per-project default: Set in \`.planning/config.json\`:
\`\`\`json
{
  "model_profile": "balanced"
}
\`\`\`

## Design Rationale

**Why Opus for gsd-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for gsd-executor?**
Executors follow explicit PLAN.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Sonnet (not Haiku) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code *delivers* what the phase promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why Haiku for gsd-codebase-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

**Why \`inherit\` instead of passing \`opus\` directly?**
${rationaleAlias}'s \`"opus"\` alias maps to a specific model version. Organizations may block older opus versions while allowing newer ones. GSD returns \`"inherit"\` for opus-tier agents, causing them to use whatever opus version the user has configured in their session. This avoids version conflicts and silent fallbacks to Sonnet.

**Why \`inherit\` profile?**
Some runtimes (including OpenCode) let users switch models at runtime (\`/model\`). The \`inherit\` profile keeps all GSD subagents aligned to that live selection.
`;
}

/**
 * Formats the agent-to-model mapping as a human-readable table (in string format).
 *
 * @param {Object<string, string>} agentToModelMap - A mapping from agent to model
 * @returns {string} A formatted table string
 */
function formatAgentToModelMapAsTable(agentToModelMap) {
  const agentWidth = Math.max('Agent'.length, ...Object.keys(agentToModelMap).map((a) => a.length));
  const modelWidth = Math.max(
    'Model'.length,
    ...Object.values(agentToModelMap).map((m) => m.length)
  );
  const sep = '─'.repeat(agentWidth + 2) + '┼' + '─'.repeat(modelWidth + 2);
  const header = ' ' + 'Agent'.padEnd(agentWidth) + ' │ ' + 'Model'.padEnd(modelWidth);
  let agentToModelTable = header + '\n' + sep + '\n';
  for (const [agent, model] of Object.entries(agentToModelMap)) {
    agentToModelTable += ' ' + agent.padEnd(agentWidth) + ' │ ' + model.padEnd(modelWidth) + '\n';
  }
  return agentToModelTable;
}

/**
 * Returns a mapping from agent to model for the given model profile.
 *
 * @param {string} normalizedProfile - The normalized (lowercase and trimmed) profile name
 * @returns {Object<string, string>} A mapping from agent to model for the given profile
 */
function getAgentToModelMapForProfile(normalizedProfile) {
  const agentToModelMap = {};
  for (const [agent, profileToModelMap] of Object.entries(MODEL_PROFILES)) {
    agentToModelMap[agent] = profileToModelMap[normalizedProfile];
  }
  return agentToModelMap;
}

module.exports = {
  MODEL_PROFILES,
  VALID_PROFILES,
  HARNESS_CONFIG,
  formatAgentToModelMapAsTable,
  getAgentToModelMapForProfile,
  generateModelProfilesMd,
};
