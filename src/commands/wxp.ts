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
    arguments: Flags.string({ description: "Raw $ARGUMENTS string", default: "" }),
    "project-root": Flags.string({ description: "Project root directory", default: process.cwd() }),
    "pkg-root": Flags.string({ description: "Package root directory", default: process.cwd() }),
  };

  async run() {
    const { flags, args } = await this.parse(WxpProcessCommand);

    let content: string;
    let filePath: string;

    if (flags.input !== undefined) {
      content = flags.input;
      filePath = path.join(flags["project-root"], ".pi", "gsd", "workflows", "_inline.md");
    } else if (args.file) {
      const fs = await import("node:fs");
      filePath = path.resolve(args.file);
      content = fs.default.readFileSync(filePath, "utf8");
    } else {
      this.error("Provide a file argument or --input string");
      return;
    }

    const config = {
      trustedPaths: [
        { position: "project" as const, path: ".pi/gsd" },
        { position: "pkg" as const, path: "gsd" },
      ],
      untrustedPaths: [],
      shellAllowlist: [...DEFAULT_SHELL_ALLOWLIST],
      shellBanlist: [],
      shellTimeoutMs: 30_000,
    };

    try {
      const result = processWxp(
        content,
        filePath,
        config,
        flags["project-root"],
        flags["pkg-root"],
        flags.arguments,
      );
      process.stdout.write(result);
    } catch (err) {
      if (err instanceof WxpProcessingError) {
        this.error(err.message, { exit: 1 });
      }
      throw err;
    }
  }
}
