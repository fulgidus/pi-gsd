import type { IfNode } from "./schema.js";
import type { VariableStore } from "./variables.js";

/**
 * Evaluate an <if> node's condition against the variable store.
 * Returns true if the condition matches; false otherwise.
 * If the variable is not defined, the value is treated as empty string (no throw).
 */
export function evaluateCondition(node: IfNode, vars: VariableStore): boolean {
  const value = vars.get(node.var) ?? "";
  switch (node.condition.type) {
    case "equals":
      return value === node.condition.value;
    case "starts-with":
      return value.startsWith(node.condition.value);
  }
}
