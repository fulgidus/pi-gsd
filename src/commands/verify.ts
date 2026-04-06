import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";

export class ValidateConsistencyCommand extends BaseCommand {
  static override description = "Validate planning consistency";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(ValidateConsistencyCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const v = await import("../lib/verify.js");
    v.cmdValidateConsistency(cwd, raw);
  }
}

export class ValidateHealthCommand extends BaseCommand {
  static override description = "Check .planning/ health";
  static override flags = {
    ...BaseCommand.baseFlags,
    repair: Flags.boolean({ description: "Auto-repair issues", default: false }),
  };

  async run() {
    const { flags } = await this.parse(ValidateHealthCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const v = await import("../lib/verify.js");
    v.cmdValidateHealth(cwd, { repair: flags.repair }, raw);
  }
}

export class ValidateAgentsCommand extends BaseCommand {
  static override description = "Validate agent configurations";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(ValidateAgentsCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const v = await import("../lib/verify.js");
    v.cmdValidateAgents(cwd, raw);
  }
}

export class VerifyCommand extends BaseCommand {
  static override description = "Run UAT verification";
  static override args = { phase: Args.string({ required: false }) };
  static override flags = {
    ...BaseCommand.baseFlags,
    plan: Flags.string({ description: "Plan to verify" }),
  };

  async run() {
    const { flags, args } = await this.parse(VerifyCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const v = await import("../lib/verify.js");
    // verify command runs consistency check as primary action
    v.cmdValidateConsistency(cwd, raw);
  }
}

export class AuditUatCommand extends BaseCommand {
  static override description = "Audit UAT results";
  static override flags = { ...BaseCommand.baseFlags };

  async run() {
    const { flags } = await this.parse(AuditUatCommand);
    const { cwd, raw } = this.resolveContext(flags);
    const { cmdAuditUat } = await import("../lib/uat.js");
    cmdAuditUat(cwd, raw);
  }
}
