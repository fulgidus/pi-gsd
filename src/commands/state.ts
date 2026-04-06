import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class StateJsonCommand extends BaseCommand {
  static override description = "Output GSD state as JSON";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(StateJsonCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const state = await import("../lib/state.js");
    state.cmdStateJson(cwd, raw);
  }
}

export class StateGetCommand extends BaseCommand {
  static override description = "Get a specific state field";
  static override args = { field: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(StateGetCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const state = await import("../lib/state.js");
    state.cmdStateGet(cwd, args.field, raw);
  }
}

export class StateUpdateCommand extends BaseCommand {
  static override description = "Update a state field";
  static override args = {
    field: Args.string({ required: true }),
    value: Args.string({ required: true }),
  };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(StateUpdateCommand);
    const { cwd } = this.resolveContext(flags);
    const state = await import("../lib/state.js");
    state.cmdStateUpdate(cwd, args.field, args.value);
  }
}

export class StatePatchCommand extends BaseCommand {
  static override description = "Patch multiple state fields";
  static override args = { pairs: Args.string({ required: false }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    field: Flags.string({ multiple: true, description: "field=value pair" }),
  };

  async run() {
    const { flags, argv } = await this.parse(StatePatchCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const state = await import("../lib/state.js");
    // Parse remaining argv as key value pairs
    const patches: Record<string, string> = {};
    const rawArgv = (argv as string[]).filter((a) => !a.startsWith("--"));
    for (let i = 0; i < rawArgv.length; i += 2) {
      const key = rawArgv[i].replace(/^--/, "");
      if (key && rawArgv[i + 1] !== undefined) patches[key] = rawArgv[i + 1];
    }
    state.cmdStatePatch(cwd, patches, raw);
  }
}

export class StateAdvancePlanCommand extends BaseCommand {
  static override description = "Advance to next plan";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(StateAdvancePlanCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const state = await import("../lib/state.js");
    state.cmdStateAdvancePlan(cwd, raw);
  }
}

export class StateLoadCommand extends BaseCommand {
  static override description = "Load and display state";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(StateLoadCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const state = await import("../lib/state.js");
    state.cmdStateLoad(cwd, raw);
  }
}

export class StateUpdateProgressCommand extends BaseCommand {
  static override description = "Update progress counters";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(StateUpdateProgressCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const state = await import("../lib/state.js");
    state.cmdStateUpdateProgress(cwd, raw);
  }
}
