import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class WorkstreamCreateCommand extends BaseCommand {
  static override description = "Create a new workstream";
  static override args = { name: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    "no-migrate": Flags.boolean({ description: "Skip migration", default: false }),
    "migrate-name": Flags.string({ description: "Migration name" }),
  };

  async run() {
    const { flags, args } = await this.parse(WorkstreamCreateCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const ws = await import("../lib/workstream.js");
    ws.cmdWorkstreamCreate(
      cwd, args.name,
      { migrate: !flags["no-migrate"], migrateName: flags["migrate-name"] ?? null },
      raw,
    );
  }
}

export class WorkstreamListCommand extends BaseCommand {
  static override description = "List workstreams";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(WorkstreamListCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const ws = await import("../lib/workstream.js");
    ws.cmdWorkstreamList(cwd, raw);
  }
}

export class WorkstreamStatusCommand extends BaseCommand {
  static override description = "Show workstream status";
  static override args = { name: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(WorkstreamStatusCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const ws = await import("../lib/workstream.js");
    ws.cmdWorkstreamStatus(cwd, args.name, raw);
  }
}

export class WorkstreamCompleteCommand extends BaseCommand {
  static override description = "Complete a workstream";
  static override args = { name: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(WorkstreamCompleteCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const ws = await import("../lib/workstream.js");
    ws.cmdWorkstreamComplete(cwd, args.name, {}, raw);
  }
}

export class WorkstreamSetCommand extends BaseCommand {
  static override description = "Set active workstream";
  static override args = { name: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(WorkstreamSetCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const ws = await import("../lib/workstream.js");
    ws.cmdWorkstreamSet(cwd, args.name, raw);
  }
}

export class WorkstreamGetCommand extends BaseCommand {
  static override description = "Get active workstream";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(WorkstreamGetCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const ws = await import("../lib/workstream.js");
    ws.cmdWorkstreamGet(cwd, raw);
  }
}

export class WorkstreamProgressCommand extends BaseCommand {
  static override description = "Show workstream progress";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(WorkstreamProgressCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const ws = await import("../lib/workstream.js");
    ws.cmdWorkstreamProgress(cwd, raw);
  }
}
