import { Args } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class InitCommand extends BaseCommand {
  static override description = "Initialise a GSD workflow context";
  static override args = {
    workflow: Args.string({ required: true }),
    phase: Args.string({ required: false }),
    rest: Args.string({ required: false }),
  };
  static override flags = { ...BaseCommand.baseFlags };
  static override strict = false;

  async run() {
    const { flags, argv } = await this.parse(InitCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const rawArgv = argv as string[];
    const workflow = rawArgv[0];
    const init = await import("../lib/init.js");
    const { gsdError } = await import("../lib/core.js");

    switch (workflow) {
      case "execute-phase": return init.cmdInitExecutePhase(cwd, rawArgv[1], raw);
      case "plan-phase": return init.cmdInitPlanPhase(cwd, rawArgv[1], raw);
      case "new-project": return init.cmdInitNewProject(cwd, raw);
      case "new-milestone": return init.cmdInitNewMilestone(cwd, raw);
      case "quick": return init.cmdInitQuick(cwd, rawArgv.slice(1).join(" "), raw);
      case "resume": return init.cmdInitResume(cwd, raw);
      case "verify-work": return init.cmdInitVerifyWork(cwd, rawArgv[1], raw);
      case "phase-op": return init.cmdInitPhaseOp(cwd, rawArgv[1], raw);
      case "todos": return init.cmdInitTodos(cwd, rawArgv[1], raw);
      case "milestone-op": return init.cmdInitMilestoneOp(cwd, raw);
      case "map-codebase": return init.cmdInitMapCodebase(cwd, raw);
      case "progress": return init.cmdInitProgress(cwd, raw);
      case "manager": return init.cmdInitManager(cwd, raw);
      case "new-workspace": return init.cmdInitNewWorkspace(cwd, raw);
      case "list-workspaces": return init.cmdInitListWorkspaces(cwd, raw);
      case "remove-workspace": return init.cmdInitRemoveWorkspace(cwd, rawArgv[1], raw);
      default:
        gsdError(`Unknown init workflow: ${workflow}`);
    }
  }
}
