import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class FrontmatterGetCommand extends BaseCommand {
  static override description = "Get frontmatter field from a file";
  static override args = { file: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    field: Flags.string({ description: "Field name" }),
  };

  async run() {
    const { flags, args } = await this.parse(FrontmatterGetCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const fm = await import("../lib/frontmatter.js");
    fm.cmdFrontmatterGet(cwd, args.file, flags.field ?? null, raw);
  }
}

export class FrontmatterSetCommand extends BaseCommand {
  static override description = "Set frontmatter field in a file";
  static override args = { file: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    field: Flags.string({ description: "Field name" }),
    value: Flags.string({ description: "Field value" }),
  };

  async run() {
    const { flags, args } = await this.parse(FrontmatterSetCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const fm = await import("../lib/frontmatter.js");
    fm.cmdFrontmatterSet(cwd, args.file, flags.field, flags.value, raw);
  }
}

export class FrontmatterMergeCommand extends BaseCommand {
  static override description = "Merge frontmatter data into a file";
  static override args = { file: Args.string({ required: true }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    data: Flags.string({ description: "JSON data to merge" }),
  };

  async run() {
    const { flags, args } = await this.parse(FrontmatterMergeCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const fm = await import("../lib/frontmatter.js");
    fm.cmdFrontmatterMerge(cwd, args.file, flags.data, raw);
  }
}
