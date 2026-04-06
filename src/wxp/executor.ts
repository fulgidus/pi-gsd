import { evaluateCondition, evaluateConditionExpr } from "./conditions.js";
import { executeShell, WxpShellError } from "./shell.js";
import { executeStringOp } from "./string-ops.js";
import type {
  ExecuteBlock,
  WxpOperation,
  WxpExecContext,
  ForEachNode,
  SortBy,
} from "../schemas/wxp.zod.js";
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

// ─── <display> ───────────────────────────────────────────────────────────────

/** Resolve {varname} and {var.prop} interpolations in a display msg template. */
function resolveDisplayMsg(msg: string, vars: VariableStore): string {
  return msg.replace(/\{([^}]+)\}/g, (_, name: string) => vars.resolve(name) ?? "");
}

// ─── <json-parse> ────────────────────────────────────────────────────────────

function executeJsonParse(
  op: Extract<WxpOperation, { type: "json-parse" }>,
  vars: VariableStore,
): void {
  const jsonStr = vars.get(op.src);
  if (jsonStr === undefined) {
    throw new Error(`<json-parse>: source variable '${op.src}' is not defined`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`<json-parse>: variable '${op.src}' does not contain valid JSON`);
  }

  // Extract value via optional path (e.g. "$.phases" → extract key "phases")
  if (op.path) {
    const pathParts = op.path.replace(/^\$\.?/, "").split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON traversal
    let current: any = parsed;
    for (const key of pathParts) {
      if (current === null || typeof current !== "object") {
        throw new Error(`<json-parse>: path '${op.path}' not found in '${op.src}'`);
      }
      current = current[key];
    }
    parsed = current;
  }

  // Store result
  if (Array.isArray(parsed)) {
    // Store as array of JSON strings for <for-each>
    const items = parsed.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
    vars.setArray(op.out, items, undefined);
  } else if (parsed !== null && typeof parsed === "object") {
    // Store as JSON string
    vars.set(op.out, JSON.stringify(parsed), undefined);
  } else {
    // Scalar — store as string
    vars.set(op.out, parsed === undefined || parsed === null ? "" : String(parsed), undefined);
  }
}

// ─── <for-each> ──────────────────────────────────────────────────────────────

function executeForEach(node: ForEachNode, vars: VariableStore, ctx: WxpExecContext): void {
  let items = vars.getArray(node.var);
  if (!items) {
    // Treat missing array as empty (not an error — may be conditional)
    return;
  }

  // Apply <where> filter
  if (node.where) {
    items = items.filter((itemJson) => {
      vars.set(node.item, itemJson, undefined);
      return evaluateConditionExpr(node.where!, vars);
    });
  }

  // Apply <sort-by>
  if (node.sortBy) {
    items = sortItems(items, node.item, node.sortBy, vars);
  }

  // Iterate
  for (const itemJson of items) {
    vars.set(node.item, itemJson, undefined);
    for (const child of node.children) {
      executeOperation(child, vars, ctx);
    }
  }
}

function sortItems(
  items: string[],
  itemVar: string,
  sortBy: SortBy,
  vars: VariableStore,
): string[] {
  return [...items].sort((aJson, bJson) => {
    vars.set(itemVar, aJson, undefined);
    const aRaw = vars.resolve(`${itemVar}.${sortBy.key}`) ??
      (itemVar === sortBy.key ? (vars.get(itemVar) ?? "") : "");

    vars.set(itemVar, bJson, undefined);
    const bRaw = vars.resolve(`${itemVar}.${sortBy.key}`) ??
      (itemVar === sortBy.key ? (vars.get(itemVar) ?? "") : "");

    const cmp = sortBy.type === "number"
      ? Number(aRaw) - Number(bRaw)
      : aRaw.localeCompare(bRaw);

    return sortBy.order === "desc" ? -cmp : cmp;
  });
}

// ─── Generic operation dispatch ───────────────────────────────────────────────

function executeOperation(op: WxpOperation, vars: VariableStore, ctx: WxpExecContext): void {
  switch (op.type) {
    case "shell":
      executeShell(op, vars, ctx.config);
      break;
    case "if": {
      const branch = evaluateCondition(op, vars);
      const children = branch ? op.then : (op.else ?? []);
      for (const child of children) executeOperation(child, vars, ctx);
      break;
    }
    case "string-op":
      executeStringOp(op, vars);
      break;
    case "json-parse":
      executeJsonParse(op, vars);
      break;
    case "display": {
      const msg = resolveDisplayMsg(op.msg, vars);
      ctx.onDisplay(msg, op.level);
      break;
    }
    case "for-each":
      executeForEach(op, vars, ctx);
      break;
    case "execute":
      executeBlock(op, vars, ctx);
      break;
    default:
      // paste, arguments, include, version — handled by resolution loop in index.ts
      break;
  }
}

export function executeBlock(
  block: ExecuteBlock,
  vars: VariableStore,
  ctx: WxpExecContext,
): void {
  try {
    for (const child of block.children) {
      executeOperation(child, vars, ctx);
    }
  } catch (err) {
    if (err instanceof WxpShellError || err instanceof Error) {
      throw new WxpExecutionError(err, vars.snapshot(), `Execute block failed: ${err.message}`);
    }
    throw err;
  }
}
