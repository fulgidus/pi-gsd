import type { StringOpNode } from "./schema.js";
import type { VariableStore } from "./variables.js";

export class WxpStringOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WxpStringOpError";
  }
}

/**
 * Execute a <string-op op="split"> node.
 * Reads the source variable, splits by delimiter, stores as newline-joined result.
 * Throws WxpStringOpError if the source variable is undefined.
 */
export function executeStringOp(node: StringOpNode, vars: VariableStore): void {
  const source = vars.get(node.var);
  if (source === undefined) {
    throw new WxpStringOpError(
      `string-op split: variable '${node.var}' is not defined in the variable store`,
    );
  }
  const parts = source.split(node.delimiter);
  vars.set(node.result, parts.join("\n"), undefined);
}
