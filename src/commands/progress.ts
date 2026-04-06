import { Args } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class ProgressCommand extends BaseCommand {
  static override description = "Show project progress";
  static override args = { format: Args.string({ default: "json" }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(ProgressCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdProgressRender } = await import("../lib/commands.js");
    cmdProgressRender(cwd, args.format, raw);
  }
}

export class StatsCommand extends BaseCommand {
  static override description = "Show project statistics";
  static override args = { format: Args.string({ default: "json" }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(StatsCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdStats } = await import("../lib/commands.js");
    cmdStats(cwd, args.format, raw);
  }
}

export class TodoCompleteCommand extends BaseCommand {
  static override description = "Mark a todo as complete";
  static override args = { id: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(TodoCompleteCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdTodoComplete } = await import("../lib/commands.js");
    cmdTodoComplete(cwd, args.id, raw);
  }
}

export class TodoMatchPhaseCommand extends BaseCommand {
  static override description = "Match todos to phase";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(TodoMatchPhaseCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdTodoMatchPhase } = await import("../lib/commands.js");
    cmdTodoMatchPhase(cwd, args.phase, raw);
  }
}

export class SummaryExtractCommand extends BaseCommand {
  static override description = "Extract fields from summary files";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    fields: BaseCommand.baseFlags.pick, // reuse pick flag for field list
  };

  async run() {
    const { flags, args } = await this.parse(SummaryExtractCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdSummaryExtract } = await import("../lib/commands.js");
    const fields = flags.fields ? flags.fields.split(",") : null;
    cmdSummaryExtract(cwd, args.phase, fields, raw);
  }
}
