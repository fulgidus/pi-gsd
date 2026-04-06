import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class MilestoneCompleteCommand extends BaseCommand {
  static override description = "Complete the current milestone";
  static override args = { version: Args.string({ required: false }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({ description: "Milestone name" }),
    "archive-phases": Flags.boolean({ description: "Archive phases", default: false }),
  };

  async run() {
    const { flags, args } = await this.parse(MilestoneCompleteCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdMilestoneComplete } = await import("../lib/milestone.js");
    cmdMilestoneComplete(
      cwd,
      args.version ?? "",
      { name: flags.name ?? null, archivePhases: flags["archive-phases"] },
      raw,
    );
  }
}

export class RequirementsMarkCompleteCommand extends BaseCommand {
  static override description = "Mark requirements as complete";
  static override flags = { ...BaseCommand.baseFlags };
  static override strict = false;

  async run() {
    const { flags, argv } = await this.parse(RequirementsMarkCompleteCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdRequirementsMarkComplete } = await import("../lib/milestone.js");
    cmdRequirementsMarkComplete(cwd, argv as string[], raw);
  }
}
