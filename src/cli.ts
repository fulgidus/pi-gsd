#!/usr/bin/env node
/**
 * cli.ts - GSD Tools CLI entry point.
 *
 * Oclif-based command router (CLI-01, CLI-02, CLI-03).
 * All commands are typed oclif classes in src/commands/.
 * Commander.js has been removed (CLI-05).
 */

import fs from "fs";
import path from "path";
import {
  findProjectRoot,
  getActiveWorkstream,
  gsdError,
  resolveWorktreeRoot,
} from "./lib/core.js";
import { formatOutput, type OutputFormat } from "./output.js";
import type { Command } from "@oclif/core";

// ─── Oclif command map (CLI-01, CLI-02, CLI-03) ───────────────────────────────

type CommandConstructor = typeof Command & { run(argv: string[]): Promise<void> };

async function buildCommandMap(): Promise<Record<string, CommandConstructor>> {
  const {
    StateJsonCommand,
    StateGetCommand,
    StateUpdateCommand,
    StatePatchCommand,
    StateAdvancePlanCommand,
    StateLoadCommand,
    StateUpdateProgressCommand,
    StateReconcileCommand,
    InitCommand,
    RoadmapAnalyzeCommand,
    RoadmapGetPhaseCommand,
    RoadmapUpdatePlanProgressCommand,
    ConfigGetCommand,
    ConfigSetCommand,
    ConfigSetModelProfileCommand,
    ConfigNewProjectCommand,
    ConfigEnsureSectionCommand,
    PhaseNextDecimalCommand,
    PhaseAddCommand,
    PhaseAddBatchCommand,
    PhaseInsertCommand,
    PhaseRemoveCommand,
    PhaseCompleteCommand,
    PhasePlanIndexCommand,
    MilestoneCompleteCommand,
    RequirementsMarkCompleteCommand,
    ValidateConsistencyCommand,
    ValidateHealthCommand,
    ValidateAgentsCommand,
    VerifyCommand,
    AuditUatCommand,
    WorkstreamCreateCommand,
    WorkstreamListCommand,
    WorkstreamStatusCommand,
    WorkstreamCompleteCommand,
    WorkstreamSetCommand,
    WorkstreamGetCommand,
    WorkstreamProgressCommand,
    ScaffoldCommand,
    CommitCommand,
    FrontmatterGetCommand,
    FrontmatterSetCommand,
    FrontmatterMergeCommand,
    TemplateSelectCommand,
    TemplateFillCommand,
    ProgressCommand,
    StatsCommand,
    TodoCompleteCommand,
    TodoMatchPhaseCommand,
    SummaryExtractCommand,
    WxpProcessCommand,
  } = await import("./commands/index.js");

  return {
    // state
    "state json": StateJsonCommand as unknown as CommandConstructor,
    "state get": StateGetCommand as unknown as CommandConstructor,
    "state update": StateUpdateCommand as unknown as CommandConstructor,
    "state patch": StatePatchCommand as unknown as CommandConstructor,
    "state advance-plan": StateAdvancePlanCommand as unknown as CommandConstructor,
    "state load": StateLoadCommand as unknown as CommandConstructor,
    "state update-progress": StateUpdateProgressCommand as unknown as CommandConstructor,
    "state reconcile": StateReconcileCommand as unknown as CommandConstructor,
    // init
    "init": InitCommand as unknown as CommandConstructor,
    // roadmap
    "roadmap analyze": RoadmapAnalyzeCommand as unknown as CommandConstructor,
    "roadmap get-phase": RoadmapGetPhaseCommand as unknown as CommandConstructor,
    "roadmap update-plan-progress": RoadmapUpdatePlanProgressCommand as unknown as CommandConstructor,
    // config
    "config-get": ConfigGetCommand as unknown as CommandConstructor,
    "config-set": ConfigSetCommand as unknown as CommandConstructor,
    "config-set-model-profile": ConfigSetModelProfileCommand as unknown as CommandConstructor,
    "config-new-project": ConfigNewProjectCommand as unknown as CommandConstructor,
    "config-ensure-section": ConfigEnsureSectionCommand as unknown as CommandConstructor,
    // phase
    "phase next-decimal": PhaseNextDecimalCommand as unknown as CommandConstructor,
    "phase add": PhaseAddCommand as unknown as CommandConstructor,
    "phase add-batch": PhaseAddBatchCommand as unknown as CommandConstructor,
    "phase insert": PhaseInsertCommand as unknown as CommandConstructor,
    "phase remove": PhaseRemoveCommand as unknown as CommandConstructor,
    "phase complete": PhaseCompleteCommand as unknown as CommandConstructor,
    "phase-plan-index": PhasePlanIndexCommand as unknown as CommandConstructor,
    // milestone
    "milestone complete": MilestoneCompleteCommand as unknown as CommandConstructor,
    "requirements mark-complete": RequirementsMarkCompleteCommand as unknown as CommandConstructor,
    // validate / verify
    "validate consistency": ValidateConsistencyCommand as unknown as CommandConstructor,
    "validate health": ValidateHealthCommand as unknown as CommandConstructor,
    "validate agents": ValidateAgentsCommand as unknown as CommandConstructor,
    "verify": VerifyCommand as unknown as CommandConstructor,
    "audit-uat": AuditUatCommand as unknown as CommandConstructor,
    // workstream
    "workstream create": WorkstreamCreateCommand as unknown as CommandConstructor,
    "workstream list": WorkstreamListCommand as unknown as CommandConstructor,
    "workstream status": WorkstreamStatusCommand as unknown as CommandConstructor,
    "workstream complete": WorkstreamCompleteCommand as unknown as CommandConstructor,
    "workstream set": WorkstreamSetCommand as unknown as CommandConstructor,
    "workstream get": WorkstreamGetCommand as unknown as CommandConstructor,
    "workstream progress": WorkstreamProgressCommand as unknown as CommandConstructor,
    // scaffold
    "scaffold": ScaffoldCommand as unknown as CommandConstructor,
    // commit
    "commit": CommitCommand as unknown as CommandConstructor,
    // frontmatter
    "frontmatter get": FrontmatterGetCommand as unknown as CommandConstructor,
    "frontmatter set": FrontmatterSetCommand as unknown as CommandConstructor,
    "frontmatter merge": FrontmatterMergeCommand as unknown as CommandConstructor,
    // template
    "template select": TemplateSelectCommand as unknown as CommandConstructor,
    "template fill": TemplateFillCommand as unknown as CommandConstructor,
    // progress / stats / todo
    "progress": ProgressCommand as unknown as CommandConstructor,
    "stats": StatsCommand as unknown as CommandConstructor,
    "todo complete": TodoCompleteCommand as unknown as CommandConstructor,
    "todo match-phase": TodoMatchPhaseCommand as unknown as CommandConstructor,
    "summary-extract": SummaryExtractCommand as unknown as CommandConstructor,
    // wxp (CLI-04)
    "wxp process": WxpProcessCommand as unknown as CommandConstructor,
  };
}

// ─── Legacy arg parsing (for remaining switch-based commands) ─────────────────

function parseNamedArgs(
  args: string[],
  valueFlags: string[] = [],
  booleanFlags: string[] = [],
): Record<string, string | boolean | null> {
  const result: Record<string, string | boolean | null> = {};
  for (const flag of valueFlags) {
    const idx = args.indexOf(`--${flag}`);
    result[flag] =
      idx !== -1 && args[idx + 1] !== undefined && !args[idx + 1].startsWith("--")
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

// ─── Command key resolution ───────────────────────────────────────────────────

function findCommandKey(
  argv: string[],
  map: Record<string, CommandConstructor>,
): string | null {
  // Try 2-token key first (e.g. "state json"), then 1-token (e.g. "commit")
  const twoToken = argv.slice(0, 2).join(" ");
  if (map[twoToken]) return twoToken;
  const oneToken = argv[0];
  if (oneToken && map[oneToken]) return oneToken;
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // --version / -v
  if (argv[0] === "--version" || argv[0] === "-v") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require("../package.json") as { version: string };
    process.stdout.write(`pi-gsd-tools v${version}\n`);
    return;
  }

  // --help / -h
  if (argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return;
  }
  // Strip --cwd
  let cwd = process.cwd();
  {
    const cwdEqArg = argv.find((a) => a.startsWith("--cwd="));
    const cwdIdx = argv.indexOf("--cwd");
    if (cwdEqArg) {
      const value = cwdEqArg.slice("--cwd=".length).trim();
      if (!value) gsdError("Missing value for --cwd");
      argv.splice(argv.indexOf(cwdEqArg), 1);
      cwd = path.resolve(value);
    } else if (cwdIdx !== -1) {
      const value = argv[cwdIdx + 1];
      if (!value || value.startsWith("--")) gsdError("Missing value for --cwd");
      argv.splice(cwdIdx, 2);
      cwd = path.resolve(value);
    }
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory())
      gsdError(`Invalid --cwd: ${cwd}`);
  }

  // Worktree resolution
  if (!fs.existsSync(path.join(cwd, ".planning"))) {
    const worktreeRoot = resolveWorktreeRoot(cwd);
    if (worktreeRoot !== cwd) cwd = worktreeRoot;
  }

  // --ws workstream
  {
    const wsEqArg = argv.find((a) => a.startsWith("--ws="));
    const wsIdx = argv.indexOf("--ws");
    let ws: string | null = null;
    if (wsEqArg) {
      ws = wsEqArg.slice("--ws=".length).trim();
      if (!ws) gsdError("Missing value for --ws");
      argv.splice(argv.indexOf(wsEqArg), 1);
    } else if (wsIdx !== -1) {
      ws = argv[wsIdx + 1];
      if (!ws || ws.startsWith("--")) gsdError("Missing value for --ws");
      argv.splice(wsIdx, 2);
    } else if (process.env["GSD_WORKSTREAM"]) {
      ws = process.env["GSD_WORKSTREAM"].trim();
    } else {
      ws = getActiveWorkstream(cwd);
    }
    if (ws && !/^[a-zA-Z0-9_-]+$/.test(ws)) gsdError("Invalid workstream name");
    if (ws) process.env["GSD_WORKSTREAM"] = ws;
  }

  // --raw
  const rawIndex = argv.indexOf("--raw");
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) argv.splice(rawIndex, 1);

  // --output
  let outputFormat: OutputFormat = "json";
  {
    const outputIdx = argv.findIndex((a) => a === "--output" || a === "-o");
    if (outputIdx !== -1) {
      const fmt = argv[outputIdx + 1];
      if (!fmt || fmt.startsWith("--")) gsdError("Missing value for --output");
      if (fmt !== "json" && fmt !== "toon") gsdError('--output must be "json" or "toon"');
      outputFormat = fmt as OutputFormat;
      argv.splice(outputIdx, 2);
    }
  }

  // --pick
  let pickPath: string | null = null;
  let legacyPickField: string | null = null;
  {
    const pickIdx = argv.findIndex((a) => a === "--pick" || a === "-p");
    if (pickIdx !== -1) {
      pickPath = argv[pickIdx + 1];
      if (!pickPath || pickPath.startsWith("--")) gsdError("Missing value for --pick");
      argv.splice(pickIdx, 2);
    }
  }

  if (!argv[0]) {
    printHelp();
    return;
  }

  // Inject cwd back as --cwd for oclif commands (BaseCommand reads it from flags)
  const oclifArgv = [...argv, "--cwd", cwd];
  if (raw) oclifArgv.push("--raw");

  // ── Try oclif command map first ────────────────────────────────────────────
  const commandMap = await buildCommandMap();
  const key = findCommandKey(argv, commandMap);

  if (key) {
    // Build argv for the oclif command: strip the command key tokens, pass rest
    const keyTokenCount = key.split(" ").length;
    const cmdArgv = [...argv.slice(keyTokenCount), "--cwd", cwd];
    if (raw) cmdArgv.push("--raw");

    // Output interception for --pick / --output toon
    if (legacyPickField || pickPath || outputFormat !== "json") {
      const origWriteSync = fs.writeSync.bind(fs);
      const chunks: string[] = [];
      (fs as unknown as { writeSync: typeof fs.writeSync }).writeSync = (
        fd: number,
        data: string | Buffer | NodeJS.ArrayBufferView,
        ...rest: unknown[]
      ): number => {
        if (fd === 1) { chunks.push(String(data)); return String(data).length; }
        return (origWriteSync as (...args: unknown[]) => number)(fd, data, ...rest);
      };
      try {
        await commandMap[key].run(cmdArgv);
      } finally {
        (fs as unknown as { writeSync: typeof fs.writeSync }).writeSync =
          origWriteSync as typeof fs.writeSync;
        const captured = chunks.join("");
        try {
          const obj = JSON.parse(captured);
          let result: unknown = obj;
          if (legacyPickField) result = extractField(obj, legacyPickField) ?? "";
          origWriteSync(1, formatOutput(result, outputFormat, pickPath ?? undefined));
        } catch { origWriteSync(1, captured); }
      }
      return;
    }

    await commandMap[key].run(cmdArgv);
    return;
  }

  // ── Fall through to legacy switch for remaining commands ───────────────────
  const command = argv[0];
  const args = argv;

  // Root resolution
  const SKIP_ROOT_RESOLUTION = new Set([
    "generate-slug", "current-timestamp", "verify-path-exists",
    "verify-summary", "template", "frontmatter", "generate-model-profiles-md",
  ]);
  if (!SKIP_ROOT_RESOLUTION.has(command)) {
    cwd = findProjectRoot(cwd);
  }

  const runLegacy = async () => {
    await runLegacyCommand(command, args, cwd, raw);
  };

  if (legacyPickField || pickPath || outputFormat !== "json") {
    const origWriteSync = fs.writeSync.bind(fs);
    const chunks: string[] = [];
    (fs as unknown as { writeSync: typeof fs.writeSync }).writeSync = (
      fd: number,
      data: string | Buffer | NodeJS.ArrayBufferView,
      ...rest: unknown[]
    ): number => {
      if (fd === 1) { chunks.push(String(data)); return String(data).length; }
      return (origWriteSync as (...args: unknown[]) => number)(fd, data, ...rest);
    };
    try {
      await runLegacy();
    } finally {
      (fs as unknown as { writeSync: typeof fs.writeSync }).writeSync =
        origWriteSync as typeof fs.writeSync;
      const captured = chunks.join("");
      try {
        const obj = JSON.parse(captured);
        let result: unknown = obj;
        if (legacyPickField) result = extractField(obj, legacyPickField) ?? "";
        origWriteSync(1, formatOutput(result, outputFormat, pickPath ?? undefined));
      } catch { origWriteSync(1, captured); }
    }
    return;
  }

  await runLegacy();
}

function printHelp(): void {
  process.stdout.write([
    "Usage: pi-gsd-tools <command> [subcommand] [args] [--raw] [--cwd <path>] [--ws <name>]",
    "",
    "Commands: state, init, roadmap, config-get, config-set, phase, milestone,",
    "  validate, verify, workstream, scaffold, commit, frontmatter, template,",
    "  progress, stats, todo, summary-extract, wxp, resolve-model, find-phase,",
    "  generate-slug, current-timestamp, list-todos, verify-path-exists,",
    "  audit-uat, uat, generate-model-profiles-md, and more.",
    "",
    "Add --help to any command for details.",
  ].join("\n") + "\n");
}

// ─── Legacy command router (for commands not yet with oclif classes) ──────────

async function runLegacyCommand(
  command: string,
  args: string[],
  cwd: string,
  raw: boolean,
): Promise<void> {
  switch (command) {
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
    case "commit-to-subrepo": {
      const { cmdCommitToSubrepo } = await import("./lib/commands.js");
      const filesIndex = args.indexOf("--files");
      const messageArgs = args.slice(1, filesIndex !== -1 ? filesIndex : args.length)
        .filter((a) => !a.startsWith("--"));
      const files = filesIndex !== -1
        ? args.slice(filesIndex + 1).filter((a) => !a.startsWith("--"))
        : [];
      cmdCommitToSubrepo(cwd, messageArgs.join(" ") || undefined, files, raw);
      break;
    }
    case "verify-summary": {
      const { cmdVerifySummary } = await import("./lib/verify.js");
      const checkCount = args[2] ? parseInt(args[2], 10) : 2;
      cmdVerifySummary(cwd, args[1], checkCount, raw);
      break;
    }
    case "generate-slug": {
      const { cmdGenerateSlug } = await import("./lib/commands.js");
      cmdGenerateSlug(args[1], raw);
      break;
    }
    case "current-timestamp": {
      const { cmdCurrentTimestamp } = await import("./lib/commands.js");
      cmdCurrentTimestamp(args[1], raw);
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
    case "phases": {
      const { cmdPhasesList } = await import("./lib/phase.js");
      cmdPhasesList(cwd, {}, raw);
      break;
    }
    case "requirements": {
      const { cmdRequirementsMarkComplete } = await import("./lib/milestone.js");
      if (args[1] === "mark-complete") cmdRequirementsMarkComplete(cwd, args.slice(2), raw);
      else gsdError("Unknown requirements subcommand. Available: mark-complete");
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
    case "state-snapshot": {
      const { cmdStateSnapshot } = await import("./lib/state.js");
      cmdStateSnapshot(cwd, raw);
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
    case "scan-sessions": {
      const { cmdScanSessions } = await import("./lib/profile-pipeline.js");
      const pathIdx = args.indexOf("--path"), harnessIdx = args.indexOf("--harness");
      await cmdScanSessions(
        pathIdx !== -1 ? args[pathIdx + 1] : null,
        { verbose: args.includes("--verbose"), json: args.includes("--json"),
          harness: harnessIdx !== -1 ? args[harnessIdx + 1] : null },
        raw,
      );
      break;
    }
    case "extract-messages": {
      const { cmdExtractMessages } = await import("./lib/profile-pipeline.js");
      const sessionIdx = args.indexOf("--session");
      const limitIdx = args.indexOf("--limit");
      const pathIdx = args.indexOf("--path");
      const isPiDirArg = (s: string) => s.startsWith("--") && s.endsWith("--") && s.length > 4;
      if (!args[1] || (args[1].startsWith("--") && !isPiDirArg(args[1])))
        gsdError("Usage: pi-gsd-tools extract-messages <project> [--session <id>] [--limit N]");
      await cmdExtractMessages(
        args[1],
        { sessionId: sessionIdx !== -1 ? args[sessionIdx + 1] : null,
          limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null },
        raw,
        pathIdx !== -1 ? args[pathIdx + 1] : null,
      );
      break;
    }
    case "profile-sample": {
      const { cmdProfileSample } = await import("./lib/profile-pipeline.js");
      const pathIdx = args.indexOf("--path"), limitIdx = args.indexOf("--limit");
      const maxPerIdx = args.indexOf("--max-per-project"), maxCharsIdx = args.indexOf("--max-chars");
      const harnessIdx = args.indexOf("--harness");
      await cmdProfileSample(
        pathIdx !== -1 ? args[pathIdx + 1] : null,
        { limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 150,
          maxPerProject: maxPerIdx !== -1 ? parseInt(args[maxPerIdx + 1], 10) : null,
          harness: harnessIdx !== -1 ? args[harnessIdx + 1] : null,
          maxChars: maxCharsIdx !== -1 ? parseInt(args[maxCharsIdx + 1], 10) : 500 },
        raw,
      );
      break;
    }
    case "write-profile": {
      const { cmdWriteProfile } = await import("./lib/profile-output.js");
      const inputIdx = args.indexOf("--input"), outputIdx = args.indexOf("--output");
      if (inputIdx === -1) gsdError("--input <analysis-json-path> is required");
      cmdWriteProfile(cwd, { input: args[inputIdx + 1], output: outputIdx !== -1 ? args[outputIdx + 1] : null }, raw);
      break;
    }
    case "profile-questionnaire": {
      const { cmdProfileQuestionnaire } = await import("./lib/profile-output.js");
      const answersIdx = args.indexOf("--answers");
      cmdProfileQuestionnaire({ answers: answersIdx !== -1 ? args[answersIdx + 1] : null }, raw);
      break;
    }
    case "generate-dev-preferences": {
      const { cmdGenerateDevPreferences } = await import("./lib/profile-output.js");
      const analysisIdx = args.indexOf("--analysis"), outputIdx = args.indexOf("--output");
      const stackIdx = args.indexOf("--stack");
      cmdGenerateDevPreferences(cwd, {
        analysis: analysisIdx !== -1 ? args[analysisIdx + 1] : null,
        output: outputIdx !== -1 ? args[outputIdx + 1] : null,
        stack: stackIdx !== -1 ? args[stackIdx + 1] : null,
      }, raw);
      break;
    }
    case "generate-claude-profile": {
      const { cmdGenerateClaudeProfile } = await import("./lib/profile-output.js");
      const analysisIdx = args.indexOf("--analysis"), outputIdx = args.indexOf("--output");
      cmdGenerateClaudeProfile(cwd, {
        analysis: analysisIdx !== -1 ? args[analysisIdx + 1] : null,
        output: outputIdx !== -1 ? args[outputIdx + 1] : null,
        global: args.includes("--global"),
      }, raw);
      break;
    }
    case "generate-claude-md": {
      const { cmdGenerateClaudeMd } = await import("./lib/profile-output.js");
      const outputIdx = args.indexOf("--output"), harnessIdx = args.indexOf("--harness");
      cmdGenerateClaudeMd(cwd, {
        output: outputIdx !== -1 ? args[outputIdx + 1] : null,
        auto: args.includes("--auto"),
        force: args.includes("--force"),
        harness: harnessIdx !== -1 ? args[harnessIdx + 1] : null,
      }, raw);
      break;
    }
    case "generate-model-profiles-md": {
      const { generateModelProfilesMd } = await import("./lib/model-profiles.js");
      const outputIdx = args.indexOf("--output");
      const content = generateModelProfilesMd();
      if (args.includes("--stdout")) { process.stdout.write(content); break; }
      const outPath = outputIdx !== -1
        ? path.resolve(args[outputIdx + 1])
        : path.resolve(__dirname, "..", "references", "model-profiles.md");
      fs.writeFileSync(outPath, content, "utf-8");
      raw ? process.stdout.write(outPath) : process.stdout.write(`Wrote ${outPath}\n`);
      break;
    }
    case "websearch": {
      const { cmdWebsearch } = await import("./lib/commands.js");
      const limitIdx = args.indexOf("--limit"), freshnessIdx = args.indexOf("--freshness");
      await cmdWebsearch(args[1], {
        limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10,
        freshness: freshnessIdx !== -1 ? args[freshnessIdx + 1] : null,
      }, raw);
      break;
    }
    case "map-codebase": {
      const { cmdInitMapCodebase } = await import("./lib/init.js");
      await cmdInitMapCodebase(cwd, raw);
      break;
    }
    case "new-project":
    case "new-milestone":
    case "plan-phase":
    case "execute-phase":
    case "verify-work":
    case "phase-op":
    case "milestone-op":
    case "resume":
    case "quick":
    case "manager":
    case "progress":
    case "new-workspace":
    case "list-workspaces":
    case "remove-workspace": {
      // These are routed via 'init <workflow>' in the oclif map
      gsdError(`Use: pi-gsd-tools init ${command} [args]`);
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
