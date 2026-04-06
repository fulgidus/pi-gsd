/**
 * ast.ts — Converts raw XmlNode trees into typed WXP AST nodes.
 * <arg> is <arg> everywhere. Context determines attribute meaning.
 */

import {
  ArgSchema,
  OutSchema,
  ArgumentsSettingsSchema,
  BinaryCondOpSchema,
  SortBySchema,
} from "../schemas/wxp.zod.js";
import type {
  XmlNode,
  WxpOperation,
  ShellNode,
  StringOpNode,
  JsonParseNode,
  DisplayNode,
  IfNode,
  ForEachNode,
  ArgumentsNode,
  IncludeNode,
  VersionTag,
  ExecuteBlock,
  PasteNode,
  ConditionExpr,
  Arg,
  Out,
} from "../schemas/wxp.zod.js";

export class WxpAstError extends Error {
  constructor(message: string, public readonly node: XmlNode) {
    super(`WXP AST error at <${node.tag}>: ${message}`);
    this.name = "WxpAstError";
  }
}

// ─── <arg> ────────────────────────────────────────────────────────────────────

function parseArg(node: XmlNode): Arg {
  return ArgSchema.parse({
    string:   node.attrs["string"],
    name:     node.attrs["name"],
    wrap:     node.attrs["wrap"],
    type:     node.attrs["type"],
    value:    node.attrs["value"],
    flag:     node.attrs["flag"],
    optional: "optional" in node.attrs ? true : undefined,
    as:       node.attrs["as"],
  });
}

// ─── <out> ────────────────────────────────────────────────────────────────────

function parseOut(node: XmlNode): Out {
  return OutSchema.parse({
    type: node.attrs["type"],
    name: node.attrs["name"],
  });
}

// ─── <shell> ─────────────────────────────────────────────────────────────────

function buildShellNode(node: XmlNode): ShellNode {
  const command = node.attrs["command"];
  if (!command) throw new WxpAstError(`requires command="..."`, node);

  const argsContainer = node.children.find((c) => c.tag === "args");
  const outsContainer = node.children.find((c) => c.tag === "outs");

  const args: Arg[] = argsContainer
    ? argsContainer.children.filter((c) => c.tag === "arg").map(parseArg)
    : [];

  const outs: Out[] = outsContainer
    ? outsContainer.children.filter((c) => c.tag === "out").map(parseOut)
    : [];

  const suppressErrors = outsContainer
    ? outsContainer.children.some((c) => c.tag === "suppress-errors")
    : false;

  return { type: "shell", command, args, outs, suppressErrors };
}

// ─── <string-op> ─────────────────────────────────────────────────────────────

function buildStringOpNode(node: XmlNode): StringOpNode {
  const op = node.attrs["op"];
  if (op !== "split") throw new WxpAstError(`only op="split" is supported in v1`, node);

  const argsContainer = node.children.find((c) => c.tag === "args");
  const outsContainer = node.children.find((c) => c.tag === "outs");
  if (!argsContainer || !outsContainer) {
    throw new WxpAstError(`requires <args> and <outs> children`, node);
  }

  return {
    type: "string-op",
    op: "split",
    args: argsContainer.children.filter((c) => c.tag === "arg").map(parseArg),
    outs: outsContainer.children.filter((c) => c.tag === "out").map(parseOut),
  };
}

// ─── <json-parse> ────────────────────────────────────────────────────────────

function buildJsonParseNode(node: XmlNode): JsonParseNode {
  const src = node.attrs["src"];
  const out = node.attrs["out"];
  if (!src) throw new WxpAstError(`requires src="..."`, node);
  if (!out) throw new WxpAstError(`requires out="..."`, node);
  return { type: "json-parse", src, path: node.attrs["path"], out };
}

// ─── <display> ───────────────────────────────────────────────────────────────

function buildDisplayNode(node: XmlNode): DisplayNode {
  const msg = node.attrs["msg"];
  if (!msg) throw new WxpAstError(`requires msg="..."`, node);
  const level = node.attrs["level"];
  return {
    type: "display",
    msg,
    level: (level === "warning" || level === "error" ? level : "info"),
  };
}

// ─── Condition operands ───────────────────────────────────────────────────────

const BINARY_COND_TAGS = new Set([
  "equals", "not-equals", "starts-with", "contains",
  "less-than", "greater-than", "less-than-or-equal", "greater-than-or-equal",
]);

const LOGICAL_COND_TAGS = new Set(["and", "or"]);

function isConditionTag(tag: string): boolean {
  return BINARY_COND_TAGS.has(tag) || LOGICAL_COND_TAGS.has(tag);
}

export function buildConditionExpr(node: XmlNode): ConditionExpr {
  // Logical: <and>/<or> — children are condition expressions
  if (node.tag === "and" || node.tag === "or") {
    const children = node.children
      .filter((c) => isConditionTag(c.tag))
      .map(buildConditionExpr);
    return { op: node.tag, children } as ConditionExpr;
  }

  // Binary: has <left> and <right>
  const leftNode  = node.children.find((c) => c.tag === "left");
  const rightNode = node.children.find((c) => c.tag === "right");
  if (!leftNode || !rightNode) {
    throw new WxpAstError(`<${node.tag}> requires <left> and <right>`, node);
  }

  const parsed = BinaryCondOpSchema.safeParse(node.tag);
  if (!parsed.success) throw new WxpAstError(`unknown condition operator "${node.tag}"`, node);

  return { op: parsed.data, left: parseArg(leftNode), right: parseArg(rightNode) };
}

// ─── <if> ────────────────────────────────────────────────────────────────────

function buildIfNode(node: XmlNode): IfNode {
  const condContainer = node.children.find((c) => c.tag === "condition");
  if (!condContainer) throw new WxpAstError(`requires <condition>`, node);

  const exprNode = condContainer.children.find((c) => isConditionTag(c.tag));
  if (!exprNode) {
    throw new WxpAstError(
      `<condition> requires a condition operator child (equals, not-equals, and, or, ...)`,
      condContainer,
    );
  }

  const condition = buildConditionExpr(exprNode);
  const thenContainer = node.children.find((c) => c.tag === "then");
  const elseContainer = node.children.find((c) => c.tag === "else");

  return {
    type: "if",
    condition,
    then: thenContainer ? thenContainer.children.flatMap(buildOperation) : [],
    else: elseContainer ? elseContainer.children.flatMap(buildOperation) : undefined,
  };
}

// ─── <for-each> ──────────────────────────────────────────────────────────────

function buildForEachNode(node: XmlNode): ForEachNode {
  const varName  = node.attrs["var"];
  const itemName = node.attrs["item"];
  if (!varName)  throw new WxpAstError(`requires var="..."`, node);
  if (!itemName) throw new WxpAstError(`requires item="..."`, node);

  // <where> child — optional filter
  const whereContainer = node.children.find((c) => c.tag === "where");
  let where: ConditionExpr | undefined;
  if (whereContainer) {
    const exprNode = whereContainer.children.find((c) => isConditionTag(c.tag));
    if (exprNode) where = buildConditionExpr(exprNode);
  }

  // <sort-by> child — optional sort
  const sortByNode = node.children.find((c) => c.tag === "sort-by");
  let sortBy: ForEachNode["sortBy"];
  if (sortByNode) {
    sortBy = SortBySchema.parse({
      key:   sortByNode.attrs["key"] ?? "",
      type:  sortByNode.attrs["type"],
      order: sortByNode.attrs["order"],
    });
  }

  // Body: all children except <where> and <sort-by>
  const children = node.children
    .filter((c) => c.tag !== "where" && c.tag !== "sort-by")
    .flatMap(buildOperation);

  return { type: "for-each", var: varName, item: itemName, where, sortBy, children };
}

// ─── <gsd-arguments> ─────────────────────────────────────────────────────────

function buildArgumentsNode(node: XmlNode): ArgumentsNode {
  const settingsNode = node.children.find((c) => c.tag === "settings");

  const keepExtraArgs = settingsNode?.children.some((c) => c.tag === "keep-extra-args") ?? false;
  const strictArgs    = settingsNode?.children.some((c) => c.tag === "strict-args")     ?? false;
  const delimContainer = settingsNode?.children.find((c) => c.tag === "delimiters");
  const delimiters = delimContainer
    ? delimContainer.children
        .filter((c) => c.tag === "delimiter" && c.attrs["type"] === "string")
        .map((c) => ({ type: "string" as const, value: c.attrs["value"] ?? "" }))
    : [];

  const settings = ArgumentsSettingsSchema.parse({ keepExtraArgs, strictArgs, delimiters });
  const args = node.children.filter((c) => c.tag === "arg").map(parseArg);

  return { type: "arguments", settings, args };
}

// ─── <gsd-include> ───────────────────────────────────────────────────────────

function buildIncludeNode(node: XmlNode): IncludeNode {
  const p = node.attrs["path"];
  if (!p) throw new WxpAstError(`requires path="..."`, node);

  const argMappingsContainer = node.children.find((c) => c.tag === "gsd-arguments");
  const argMappings = argMappingsContainer
    ? argMappingsContainer.children.filter((c) => c.tag === "arg").map(parseArg)
    : [];

  return {
    type: "include",
    path: p,
    select: node.attrs["select"],
    includeArguments: "include-arguments" in node.attrs,
    argMappings,
  };
}

// ─── Generic operation dispatcher ────────────────────────────────────────────

export function buildOperation(node: XmlNode): WxpOperation[] {
  switch (node.tag) {
    case "shell":        return [buildShellNode(node)];
    case "string-op":    return [buildStringOpNode(node)];
    case "json-parse":   return [buildJsonParseNode(node)];
    case "display":      return [buildDisplayNode(node)];
    case "if":           return [buildIfNode(node)];
    case "for-each":     return [buildForEachNode(node)];
    case "gsd-arguments": return [buildArgumentsNode(node)];
    case "gsd-paste":
      return [{ type: "paste", name: node.attrs["name"] ?? "" } satisfies PasteNode];
    case "gsd-include":  return [buildIncludeNode(node)];
    case "gsd-version":
      return [{
        type: "version",
        v: node.attrs["v"] ?? "",
        doNotUpdate: "do-not-update" in node.attrs,
      } satisfies VersionTag];
    case "gsd-execute":
      return [{
        type: "execute",
        children: node.children.flatMap(buildOperation),
      } satisfies ExecuteBlock];
    default:
      return [];
  }
}
