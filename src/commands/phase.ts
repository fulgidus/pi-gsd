import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class PhaseNextDecimalCommand extends BaseCommand {
  static override description = "Get next decimal phase number";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(PhaseNextDecimalCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const phase = await import("../lib/phase.js");
    phase.cmdPhaseNextDecimal(cwd, args.phase, raw);
  }
}

export class PhaseAddCommand extends BaseCommand {
  static override description = "Add a new phase";
  static override flags = {
    ...BaseCommand.baseFlags,
    id: Flags.string({ description: "Custom phase ID" }),
  };
  static override strict = false;

  async run() {
    const { flags, argv } = await this.parse(PhaseAddCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const phase = await import("../lib/phase.js");
    const desc = (argv as string[]).join(" ");
    phase.cmdPhaseAdd(cwd, desc, raw, flags.id ?? null);
  }
}

export class PhaseInsertCommand extends BaseCommand {
  static override description = "Insert a phase at position";
  static override args = {
    position: Args.string({ required: true }),
    description: Args.string({ required: false }),
  };
  static override flags = { ...BaseCommand.baseFlags };
  static override strict = false;

  async run() {
    const { flags, argv } = await this.parse(PhaseInsertCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const rawArgv = argv as string[];
    const phase = await import("../lib/phase.js");
    phase.cmdPhaseInsert(cwd, rawArgv[0], rawArgv.slice(1).join(" "), raw);
  }
}

export class PhaseRemoveCommand extends BaseCommand {
  static override description = "Remove a phase";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({ description: "Force removal", default: false }),
  };

  async run() {
    const { flags, args } = await this.parse(PhaseRemoveCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const phase = await import("../lib/phase.js");
    phase.cmdPhaseRemove(cwd, args.phase, { force: flags.force }, raw);
  }
}

export class PhaseCompleteCommand extends BaseCommand {
  static override description = "Mark a phase as complete";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(PhaseCompleteCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const phase = await import("../lib/phase.js");
    phase.cmdPhaseComplete(cwd, args.phase, raw);
  }
}

export class PhasePlanIndexCommand extends BaseCommand {
  static override description = "Get phase plan index";
  static override args = { phase: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(PhasePlanIndexCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdPhasePlanIndex } = await import("../lib/phase.js");
    cmdPhasePlanIndex(cwd, args.phase, raw);
  }
}
