import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class ConfigGetCommand extends BaseCommand {
  static override description = "Get a config value";
  static override args = { key: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(ConfigGetCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdConfigGet } = await import("../lib/config.js");
    cmdConfigGet(cwd, args.key, raw);
  }
}

export class ConfigSetCommand extends BaseCommand {
  static override description = "Set a config value";
  static override args = {
    key: Args.string({ required: false }),
    value: Args.string({ required: false }),
  };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(ConfigSetCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdConfigSet } = await import("../lib/config.js");
    cmdConfigSet(cwd, args.key, args.value, raw);
  }
}

export class ConfigSetModelProfileCommand extends BaseCommand {
  static override description = "Set the active model profile";
  static override args = { profile: Args.string({ required: true }) };
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags, args } = await this.parse(ConfigSetModelProfileCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdConfigSetModelProfile } = await import("../lib/config.js");
    cmdConfigSetModelProfile(cwd, args.profile, raw);
  }
}

export class ConfigNewProjectCommand extends BaseCommand {
  static override description = "Initialise a new project config";
  static override flags = {
    ...BaseCommand.baseFlags,
    choices: Flags.string({ description: "Choices JSON" }),
  };

  async run() {
    const { flags } = await this.parse(ConfigNewProjectCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdConfigNewProject } = await import("../lib/config.js");
    cmdConfigNewProject(cwd, flags.choices, raw);
  }
}

export class ConfigEnsureSectionCommand extends BaseCommand {
  static override description = "Ensure a config section exists";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(ConfigEnsureSectionCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdConfigEnsureSection } = await import("../lib/config.js");
    cmdConfigEnsureSection(cwd, raw);
  }
}
