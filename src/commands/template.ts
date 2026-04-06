import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class TemplateSelectCommand extends BaseCommand {
  static override description = "Select a workflow template";
  static override args = { type: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(TemplateSelectCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdTemplateSelect } = await import("../lib/template.js");
    cmdTemplateSelect(cwd, args.type, raw);
  }
}

export class TemplateFillCommand extends BaseCommand {
  static override description = "Fill a template with values";
  static override args = { type: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    phase: Flags.string(),
    plan: Flags.string(),
    name: Flags.string(),
    type: Flags.string({ char: "t" }),
    wave: Flags.string(),
    fields: Flags.string({ description: "JSON fields" }),
  };

  async run() {
    const { flags, args } = await this.parse(TemplateFillCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdTemplateFill } = await import("../lib/template.js");
    let extraFields: Record<string, string> = {};
    if (flags.fields) {
      try { extraFields = JSON.parse(flags.fields) as Record<string, string>; } catch { /* ignore */ }
    }
    cmdTemplateFill(
      cwd,
      args.type,
      {
        phase: flags.phase ?? undefined,
        plan: flags.plan ?? undefined,
        name: flags.name ?? undefined,
        type: flags.type ?? undefined,
        wave: flags.wave ?? undefined,
        ...extraFields,
      },
      raw,
    );
  }
}
