import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class ScaffoldCommand extends BaseCommand {
  static override description = "Scaffold a GSD artefact";
  static override args = { type: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    phase: Flags.string({ description: "Phase number" }),
    name: Flags.string({ description: "Artefact name" }),
  };

  async run() {
    const { flags, args } = await this.parse(ScaffoldCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdScaffold } = await import("../lib/commands.js");
    cmdScaffold(cwd, args.type, { phase: flags.phase ?? null, name: flags.name ?? null }, raw);
  }
}
