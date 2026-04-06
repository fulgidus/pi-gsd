import type {
  IfNode,
  ConditionExpr,
  BinaryCondExpr,
  AndCondExpr,
  OrCondExpr,
  Operand,
} from "../schemas/wxp.zod.js";
import type { VariableStore } from "./variables.js";

// ─── Operand resolution ───────────────────────────────────────────────────────

function resolveOperand(op: Operand, vars: VariableStore): string {
  // Variable reference (name= or name.prop=)
  if (op.name !== undefined) return vars.resolve(op.name) ?? "";
  // Typed literal (type= value=)
  if (op.value !== undefined) return op.value;
  return "";
}

/** Coerce an operand value to a number for numeric comparisons. */
function resolveNumber(op: Operand, vars: VariableStore): number {
  return Number(resolveOperand(op, vars));
}

/** Returns true if either operand has type="number", signalling numeric comparison. */
function isNumericComparison(expr: BinaryCondExpr): boolean {
  return expr.left.type === "number" || expr.right.type === "number";
}

// ─── Binary condition evaluation ─────────────────────────────────────────────

function evaluateBinary(expr: BinaryCondExpr, vars: VariableStore): boolean {
  const numeric = isNumericComparison(expr);

  if (numeric) {
    const l = resolveNumber(expr.left, vars);
    const r = resolveNumber(expr.right, vars);
    switch (expr.op) {
      case "equals":                return l === r;
      case "not-equals":            return l !== r;
      case "less-than":             return l < r;
      case "greater-than":          return l > r;
      case "less-than-or-equal":    return l <= r;
      case "greater-than-or-equal": return l >= r;
      case "starts-with":           return String(l).startsWith(String(r));
      case "contains":              return String(l).includes(String(r));
    }
  }

  const l = resolveOperand(expr.left, vars);
  const r = resolveOperand(expr.right, vars);
  switch (expr.op) {
    case "equals":                return l === r;
    case "not-equals":            return l !== r;
    case "starts-with":           return l.startsWith(r);
    case "contains":              return l.includes(r);
    case "less-than":             return Number(l) < Number(r);
    case "greater-than":          return Number(l) > Number(r);
    case "less-than-or-equal":    return Number(l) <= Number(r);
    case "greater-than-or-equal": return Number(l) >= Number(r);
  }
}

// ─── Recursive condition evaluation ──────────────────────────────────────────

export function evaluateConditionExpr(expr: ConditionExpr, vars: VariableStore): boolean {
  switch (expr.op) {
    case "and":
      return (expr as AndCondExpr).children.every((c) => evaluateConditionExpr(c, vars));
    case "or":
      return (expr as OrCondExpr).children.some((c) => evaluateConditionExpr(c, vars));
    default:
      return evaluateBinary(expr as BinaryCondExpr, vars);
  }
}

/** Convenience: evaluate an <if> node's condition. */
export function evaluateCondition(node: IfNode, vars: VariableStore): boolean {
  return evaluateConditionExpr(node.condition, vars);
}
