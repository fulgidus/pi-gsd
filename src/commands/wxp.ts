import { Args, Flags } from "@oclif/core";
import { Command } from "@oclif/core";
import path from "node:path";
import { processWxp, WxpProcessingError } from "../wxp/index.js";
import { DEFAULT_SHELL_ALLOWLIST } from "../wxp/security.js";

export class WxpProcessCommand extends Command {
  static override description = "Process WXP tags in a workflow file";
  static override args = {
    file: Args.string({ description: "File to process", required: false }),
  };
  static override flags = {
    input: Flags.string({ description: "Input content string (alternative to file)" }),
    "trusted-path": Flags.string({
      description: "Additional trusted path",
      multiple: true,
    }),
    arguments: Flags.string({ description: "Raw arguments string for $ARGUMENTS", default: "" }),
  };

  async run() {
    const { flags, args } = await this.parse(WxpProcessCommand);

    let content: string;
    let filePath: string;

    if (flags.input !== undefined) {
      content = flags.input;
      filePath = path.join(process.cwd(), ".pi", "gsd", "workflows", "_inline.md");
    } else if (args.file) {
      const fs = await import("node:fs");
      filePath = path.resolve(args.file);
      content = fs.default.readFileSync(filePath, "utf8");
    } else {
      this.error("Provide a file argument or --input string");
      return;
    }

    const trustedPaths = [
      path.join(process.cwd(), ".pi", "gsd"),
      ...(flags["trusted-path"] ?? []),
    ];

    const config = {
      trustedPaths,
      shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
      shellTimeoutMs: 30_000,
    };

    try {
      const result = processWxp(content, filePath, config, flags.arguments);
      process.stdout.write(result);
    } catch (err) {
      if (err instanceof WxpProcessingError) {
        this.error(err.message, { exit: 1 });
      }
      throw err;
    }
  }
}
