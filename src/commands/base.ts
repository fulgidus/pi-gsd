import { Command, Flags } from "@oclif/core";
import path from "node:path";
import fs from "node:fs";
import {
  findProjectRoot,
  getActiveWorkstream,
  gsdError,
  resolveWorktreeRoot,
} from "../lib/core.js";

/**
 * BaseCommand — extends oclif Command with GSD global flags.
 * All pi-gsd-tools commands extend this.
 */
export abstract class BaseCommand extends Command {
  static override enableJsonFlag = false;

  static override baseFlags = {
    cwd: Flags.string({ description: "Working directory", default: "" }),
    ws: Flags.string({ description: "Workstream override", default: "" }),
    raw: Flags.boolean({ description: "Raw JSON output", default: false }),
    output: Flags.string({
      description: "Output format",
      options: ["json", "toon"],
      default: "json",
    }),
    pick: Flags.string({ description: "JSONPath pick expression", default: "" }),
  };

  /** Resolve cwd + ws from flags and environment, following GSD conventions. */
  protected resolveContext(flags: {
    cwd?: string;
    ws?: string;
    raw?: boolean;
    output?: string;
    pick?: string;
  }): { cwd: string; ws: string | null; raw: boolean } {
    let cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();

    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      gsdError(`Invalid --cwd: ${cwd}`);
    }

    // Worktree resolution
    if (!fs.existsSync(path.join(cwd, ".planning"))) {
      const worktreeRoot = resolveWorktreeRoot(cwd);
      if (worktreeRoot !== cwd) cwd = worktreeRoot;
    }

    let ws: string | null = null;
    if (flags.ws) {
      ws = flags.ws;
    } else if (process.env["GSD_WORKSTREAM"]) {
      ws = process.env["GSD_WORKSTREAM"].trim();
    } else {
      ws = getActiveWorkstream(cwd);
    }

    if (ws && !/^[a-zA-Z0-9_-]+$/.test(ws)) gsdError("Invalid workstream name");
    if (ws) process.env["GSD_WORKSTREAM"] = ws;

    // Root resolution (most commands)
    cwd = findProjectRoot(cwd);

    return { cwd, ws, raw: flags.raw ?? false };
  }
}
