/**
 * src/schemas/wxp.zod.ts — Zod runtime schemas for the WXP engine.
 *
 * Single <arg> and <out> element types regardless of context.
 * All types inferred via z.infer<> — zero `any` except required z.lazy circular refs.
 */
import { z } from "zod";

// ─── <arg> ────────────────────────────────────────────────────────────────────

export const ArgTypeSchema = z.enum(["string", "number", "boolean", "flag"]);
export type ArgType = z.infer<typeof ArgTypeSchema>;

export const OutTypeSchema = z.enum(["string"]);
export type OutType = z.infer<typeof OutTypeSchema>;

export const ArgSchema = z.object({
  string: z.string().optional(),
  name: z.string().optional(),
  wrap: z.string().optional(),
  type: ArgTypeSchema.optional(),
  value: z.string().optional(),
  flag: z.string().optional(),
  optional: z.boolean().optional(),
  as: z.string().optional(),
});
export type Arg = z.infer<typeof ArgSchema>;

// ─── <out> ────────────────────────────────────────────────────────────────────

export const OutSchema = z.object({
  type: OutTypeSchema,
  name: z.string(),
});
export type Out = z.infer<typeof OutSchema>;

// ─── <delimiter> ─────────────────────────────────────────────────────────────

export const DelimiterSchema = z.object({
  type: z.literal("string"),
  value: z.string(),
});
export type Delimiter = z.infer<typeof DelimiterSchema>;

// ─── <settings> (inside <gsd-arguments>) ────────────────────────────────────

export const ArgumentsSettingsSchema = z.object({
  keepExtraArgs: z.boolean().default(false),
  strictArgs: z.boolean().default(false),
  delimiters: z.array(DelimiterSchema).default([]),
});
export type ArgumentsSettings = z.infer<typeof ArgumentsSettingsSchema>;

// ─── <gsd-arguments> ─────────────────────────────────────────────────────────

export const ArgumentsNodeSchema = z.object({
  type: z.literal("arguments"),
  settings: ArgumentsSettingsSchema.default({}),
  args: z.array(ArgSchema).default([]),
});
export type ArgumentsNode = z.infer<typeof ArgumentsNodeSchema>;

// ─── <shell> ─────────────────────────────────────────────────────────────────

export const ShellNodeSchema = z.object({
  type: z.literal("shell"),
  command: z.string(),
  args: z.array(ArgSchema).default([]),
  outs: z.array(OutSchema).default([]),
  suppressErrors: z.boolean().default(false),
});
export type ShellNode = z.infer<typeof ShellNodeSchema>;

// ─── <string-op> ─────────────────────────────────────────────────────────────

export const StringOpNodeSchema = z.object({
  type: z.literal("string-op"),
  op: z.literal("split"),
  args: z.array(ArgSchema),
  outs: z.array(OutSchema),
});
export type StringOpNode = z.infer<typeof StringOpNodeSchema>;

// ─── <json-parse> ────────────────────────────────────────────────────────────
// Parses a JSON string variable into a scalar string or an array of JSON strings.
// path: optional dot-path like "$.phases" or "$.meta.name"

export const JsonParseNodeSchema = z.object({
  type: z.literal("json-parse"),
  src: z.string(),
  path: z.string().optional(),
  out: z.string(),
});
export type JsonParseNode = z.infer<typeof JsonParseNodeSchema>;

// ─── <display> ───────────────────────────────────────────────────────────────
// Emits ctx.ui.notify(). msg supports {varname} and {var.prop} interpolation.

export const DisplayLevelSchema = z.enum(["info", "warning", "error"]);
export type DisplayLevel = z.infer<typeof DisplayLevelSchema>;

export const DisplayNodeSchema = z.object({
  type: z.literal("display"),
  msg: z.string(),
  level: DisplayLevelSchema.default("info"),
});
export type DisplayNode = z.infer<typeof DisplayNodeSchema>;

// ─── Condition operands ───────────────────────────────────────────────────────
// <left> and <right> use the same attribute set as <arg>

export const OperandSchema = ArgSchema;
export type Operand = z.infer<typeof OperandSchema>;

// ─── Condition expressions ────────────────────────────────────────────────────
// Binary ops: have <left> and <right> operands
// Logical ops: <and>/<or> wrap arrays of ConditionExpr (recursive via z.lazy)

export const BinaryCondOpSchema = z.enum([
  "equals",
  "not-equals",
  "starts-with",
  "contains",
  "less-than",
  "greater-than",
  "less-than-or-equal",
  "greater-than-or-equal",
]);
export type BinaryCondOp = z.infer<typeof BinaryCondOpSchema>;

export interface BinaryCondExpr {
  op: BinaryCondOp;
  left: Operand;
  right: Operand;
}

export interface AndCondExpr {
  op: "and";
  children: ConditionExpr[];
}

export interface OrCondExpr {
  op: "or";
  children: ConditionExpr[];
}

export type ConditionExpr = BinaryCondExpr | AndCondExpr | OrCondExpr;

// Zod schemas (z.lazy for recursive and/or)
const BinaryCondExprSchema = z.object({
  op: BinaryCondOpSchema,
  left: OperandSchema,
  right: OperandSchema,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for z.lazy circular ref
export const ConditionExprSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    BinaryCondExprSchema,
    z.object({ op: z.literal("and"), children: z.array(ConditionExprSchema) }),
    z.object({ op: z.literal("or"),  children: z.array(ConditionExprSchema) }),
  ]),
);

// ─── <sort-by> (child of <for-each>) ─────────────────────────────────────────

export const SortBySchema = z.object({
  key: z.string(),
  type: z.enum(["string", "number"]).default("string"),
  order: z.enum(["asc", "desc"]).default("asc"),
});
export type SortBy = z.infer<typeof SortBySchema>;

// ─── <if> (recursive) ────────────────────────────────────────────────────────

export interface IfNode {
  type: "if";
  condition: ConditionExpr;
  then: WxpOperation[];
  else?: WxpOperation[];
}

// ─── <for-each> ──────────────────────────────────────────────────────────────

export interface ForEachNode {
  type: "for-each";
  /** Name of the array variable to iterate */
  var: string;
  /** Name assigned to each item during iteration */
  item: string;
  /** Optional pre-filter: only items matching this condition are iterated */
  where?: ConditionExpr;
  /** Optional sort before iteration */
  sortBy?: SortBy;
  children: WxpOperation[];
}

// ─── <gsd-execute> ───────────────────────────────────────────────────────────

export interface ExecuteBlock {
  type: "execute";
  children: WxpOperation[];
}

// ─── <gsd-paste> ─────────────────────────────────────────────────────────────

export const PasteNodeSchema = z.object({
  type: z.literal("paste"),
  name: z.string(),
});
export type PasteNode = z.infer<typeof PasteNodeSchema>;

// ─── <gsd-include> ───────────────────────────────────────────────────────────

export const IncludeNodeSchema = z.object({
  type: z.literal("include"),
  path: z.string(),
  select: z.string().optional(),
  includeArguments: z.boolean().default(false),
  argMappings: z.array(ArgSchema).default([]),
});
export type IncludeNode = z.infer<typeof IncludeNodeSchema>;

// ─── <gsd-version> ───────────────────────────────────────────────────────────

export const VersionTagSchema = z.object({
  type: z.literal("version"),
  v: z.string(),
  doNotUpdate: z.boolean().default(false),
});
export type VersionTag = z.infer<typeof VersionTagSchema>;

// ─── WxpOperation union ───────────────────────────────────────────────────────

export type WxpOperation =
  | ShellNode
  | StringOpNode
  | JsonParseNode
  | DisplayNode
  | IfNode
  | ForEachNode
  | ExecuteBlock
  | PasteNode
  | IncludeNode
  | VersionTag
  | ArgumentsNode;

// ─── Variable store entry ─────────────────────────────────────────────────────

export const WxpVariableSchema = z.object({
  name: z.string(),
  value: z.string(),
  owner: z.string().optional(),
});
export type WxpVariable = z.infer<typeof WxpVariableSchema>;

// ─── XML node (parser intermediate) ──────────────────────────────────────────

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  selfClosing: boolean;
}

// ─── Security config ──────────────────────────────────────────────────────────

export const TrustedPathEntrySchema = z.object({
  position: z.enum(["project", "pkg", "absolute"]),
  path: z.string(),
});

export const WxpSecurityConfigSchema = z.object({
  trustedPaths: z.array(TrustedPathEntrySchema),
  untrustedPaths: z.array(TrustedPathEntrySchema).default([]),
  shellAllowlist: z.array(z.string()),
  shellBanlist: z.array(z.string()).default([]),
  shellTimeoutMs: z.number().default(30_000),
});

export type TrustedPathEntry = z.infer<typeof TrustedPathEntrySchema>;
export type WxpSecurityConfig = z.infer<typeof WxpSecurityConfigSchema>;

// ─── Execution context (threads config + display callback through engine) ─────

export type DisplayCallback = (msg: string, level: DisplayLevel) => void;

export interface WxpExecContext {
  config: WxpSecurityConfig;
  projectRoot: string;
  pkgRoot: string;
  onDisplay: DisplayCallback;
}
