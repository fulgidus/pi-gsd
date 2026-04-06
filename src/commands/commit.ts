import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class CommitCommand extends BaseCommand {
  static override description = "Commit GSD changes to git";
  static override flags = {
    ...BaseCommand.baseFlags,
    amend: Flags.boolean({ description: "Amend last commit", default: false }),
    "no-verify": Flags.boolean({ description: "Skip git hooks", default: false }),
    files: Flags.string({ description: "Files to include", multiple: true }),
  };
  static override strict = false;

  async run() {
    const { flags, argv } = await this.parse(CommitCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdCommit } = await import("../lib/commands.js");
    const rawArgv = argv as string[];
    const message = rawArgv.filter((a) => !a.startsWith("--")).join(" ") || undefined;
    cmdCommit(cwd, message, flags.files ?? [], raw, flags.amend, flags["no-verify"]);
  }
}
