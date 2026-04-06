import { evaluateCondition } from "./conditions.js";
import { executeShell, WxpShellError } from "./shell.js";
import { executeStringOp } from "./string-ops.js";
import type { ExecuteBlock, WxpSecurityConfig, WxpOperation } from "./schema.js";
import type { VariableStore } from "./variables.js";

export class WxpExecutionError extends Error {
  constructor(
    public readonly cause: Error,
    public readonly variableSnapshot: Record<string, string>,
    message: string,
  ) {
    super(message);
    this.name = "WxpExecutionError";
  }
}

function executeOperation(
  op: WxpOperation,
  vars: VariableStore,
  config: WxpSecurityConfig,
): void {
  switch (op.type) {
    case "shell":
      executeShell(op, vars, config);
      break;
    case "if":
      if (evaluateCondition(op, vars)) {
        for (const child of op.children) {
          executeOperation(child, vars, config);
        }
      }
      break;
    case "string-op":
      executeStringOp(op, vars);
      break;
    case "execute":
      executeBlock(op, vars, config);
      break;
    default:
      // paste, arguments, include, version handled by index.ts resolution loop
      break;
  }
}

export function executeBlock(
  block: ExecuteBlock,
  vars: VariableStore,
  config: WxpSecurityConfig,
): void {
  try {
    for (const child of block.children) {
      executeOperation(child, vars, config);
    }
  } catch (err) {
    if (err instanceof WxpShellError || err instanceof Error) {
      throw new WxpExecutionError(
        err,
        vars.snapshot(),
        `Execute block failed: ${err.message}`,
      );
    }
    throw err;
  }
}
