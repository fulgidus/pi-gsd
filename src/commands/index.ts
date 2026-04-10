// Re-export all command classes
export {
  StateJsonCommand,
  StateGetCommand,
  StateUpdateCommand,
  StatePatchCommand,
  StateAdvancePlanCommand,
  StateLoadCommand,
  StateUpdateProgressCommand,
  StateReconcileCommand,
} from "./state.js";

export { InitCommand } from "./init.js";

export {
  RoadmapAnalyzeCommand,
  RoadmapGetPhaseCommand,
  RoadmapUpdatePlanProgressCommand,
} from "./roadmap.js";

export {
  ConfigGetCommand,
  ConfigSetCommand,
  ConfigSetModelProfileCommand,
  ConfigNewProjectCommand,
  ConfigEnsureSectionCommand,
} from "./config.js";

export {
  PhaseNextDecimalCommand,
  PhaseAddCommand,
  PhaseAddBatchCommand,
  PhaseInsertCommand,
  PhaseRemoveCommand,
  PhaseCompleteCommand,
  PhasePlanIndexCommand,
} from "./phase.js";

export { MilestoneCompleteCommand, RequirementsMarkCompleteCommand } from "./milestone.js";

export {
  ValidateConsistencyCommand,
  ValidateHealthCommand,
  ValidateAgentsCommand,
  VerifyCommand,
  AuditUatCommand,
} from "./verify.js";

export {
  WorkstreamCreateCommand,
  WorkstreamListCommand,
  WorkstreamStatusCommand,
  WorkstreamCompleteCommand,
  WorkstreamSetCommand,
  WorkstreamGetCommand,
  WorkstreamProgressCommand,
} from "./workstream.js";

export { ScaffoldCommand } from "./scaffold.js";
export { CommitCommand } from "./commit.js";

export {
  FrontmatterGetCommand,
  FrontmatterSetCommand,
  FrontmatterMergeCommand,
} from "./frontmatter.js";

export { TemplateSelectCommand, TemplateFillCommand } from "./template.js";

export {
  ProgressCommand,
  StatsCommand,
  TodoCompleteCommand,
  TodoMatchPhaseCommand,
  SummaryExtractCommand,
} from "./progress.js";

export { WxpProcessCommand } from "./wxp.js";
