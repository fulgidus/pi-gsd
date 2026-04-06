import { Args } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class RoadmapAnalyzeCommand extends BaseCommand {
  static override description = "Analyze roadmap phases and status";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(RoadmapAnalyzeCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const roadmap = await import("../lib/roadmap.js");
    roadmap.cmdRoadmapAnalyze(cwd, raw);
  }
}

export class RoadmapGetPhaseCommand extends BaseCommand {
  static override description = "Get details for a specific phase";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(RoadmapGetPhaseCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const roadmap = await import("../lib/roadmap.js");
    roadmap.cmdRoadmapGetPhase(cwd, args.phase, raw);
  }
}

export class RoadmapUpdatePlanProgressCommand extends BaseCommand {
  static override description = "Update plan progress in roadmap";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(RoadmapUpdatePlanProgressCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const roadmap = await import("../lib/roadmap.js");
    roadmap.cmdRoadmapUpdatePlanProgress(cwd, args.phase, raw);
  }
}
