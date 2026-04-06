import { z } from "zod";

// ─── Leaf condition schemas ──────────────────────────────────────────────────

export const EqualsCondSchema = z.object({
  type: z.literal("equals"),
  value: z.string(),
});

export const StartsWithCondSchema = z.object({
  type: z.literal("starts-with"),
  value: z.string(),
});

export const ConditionSchema = z.discriminatedUnion("type", [
  EqualsCondSchema,
  StartsWithCondSchema,
]);

// ─── Shell node ───────────────────────────────────────────────────────────────

export const ShellNodeSchema = z.object({
  type: z.literal("shell"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  result: z.string(), // variable name for stdout capture
});

// ─── Paste node ───────────────────────────────────────────────────────────────

export const PasteNodeSchema = z.object({
  type: z.literal("paste"),
  name: z.string(),
});

// ─── String-op node ───────────────────────────────────────────────────────────

export const StringOpNodeSchema = z.object({
  type: z.literal("string-op"),
  op: z.literal("split"),
  var: z.string(),
  delimiter: z.string(),
  result: z.string(),
});

// ─── Argument mapping (for <gsd-include> children) ───────────────────────────

export const ArgMappingSchema = z.object({
  name: z.string(),
  as: z.string(),
});

// ─── Arguments node ───────────────────────────────────────────────────────────

export const ArgumentsNodeSchema = z.object({
  type: z.literal("arguments"),
  positionals: z
    .array(z.object({ name: z.string(), greedy: z.boolean().default(false) }))
    .default([]),
  flags: z
    .array(z.object({ name: z.string(), boolean: z.boolean().default(false) }))
    .default([]),
});

// ─── Include node ─────────────────────────────────────────────────────────────

export const IncludeNodeSchema = z.object({
  type: z.literal("include"),
  path: z.string(),
  includeArguments: z.boolean().default(false),
  argMappings: z.array(ArgMappingSchema).default([]),
});

// ─── Version tag ─────────────────────────────────────────────────────────────

export const VersionTagSchema = z.object({
  type: z.literal("version"),
  v: z.string(),
  doNotUpdate: z.boolean().default(false),
});

// ─── If node (forward-declared to allow recursion) ───────────────────────────

// We use z.lazy for the recursive children reference.
// The top-level WxpOperationSchema is defined after all leaf schemas.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for z.lazy circular ref
const IfNodeSchemaBase: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("if"),
    var: z.string(),
    condition: ConditionSchema,
    children: z.array(WxpOperationSchema),
  }),
);

export const IfNodeSchema = IfNodeSchemaBase;

// ─── Execute block ────────────────────────────────────────────────────────────

export const ExecuteBlockSchema = z.object({
  type: z.literal("execute"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for z.lazy circular ref
  children: z.array(z.lazy((): z.ZodType<any> => WxpOperationSchema)),
});

// ─── Top-level operation union ────────────────────────────────────────────────

export const WxpOperationSchema: z.ZodType<WxpOperation> = z.lazy(() =>
  z.union([
    ShellNodeSchema,
    PasteNodeSchema,
    IfNodeSchemaBase,
    StringOpNodeSchema,
    ArgumentsNodeSchema,
    IncludeNodeSchema,
    ExecuteBlockSchema,
    VersionTagSchema,
  ]),
);

// ─── Document schema ─────────────────────────────────────────────────────────

export const WxpDocumentSchema = z.object({
  filePath: z.string(),
  operations: z.array(WxpOperationSchema),
});

// ─── Variable entry schema ────────────────────────────────────────────────────

export const WxpVariableSchema = z.object({
  name: z.string(),
  value: z.string(),
  owner: z.string().optional(), // file stem that defined this variable
});

// ─── Security config schema ───────────────────────────────────────────────────

export const WxpSecurityConfigSchema = z.object({
  trustedPaths: z.array(z.string()),
  shellAllowlist: z.array(z.string()),
  shellTimeoutMs: z.number().default(30_000),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type EqualsCond = z.infer<typeof EqualsCondSchema>;
export type StartsWithCond = z.infer<typeof StartsWithCondSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type ShellNode = z.infer<typeof ShellNodeSchema>;
export type PasteNode = z.infer<typeof PasteNodeSchema>;
export type StringOpNode = z.infer<typeof StringOpNodeSchema>;
export type ArgMapping = z.infer<typeof ArgMappingSchema>;
export type ArgumentsNode = z.infer<typeof ArgumentsNodeSchema>;
export type IncludeNode = z.infer<typeof IncludeNodeSchema>;
export type VersionTag = z.infer<typeof VersionTagSchema>;
export type WxpVariable = z.infer<typeof WxpVariableSchema>;
export type WxpSecurityConfig = z.infer<typeof WxpSecurityConfigSchema>;

// Recursive types need explicit interface definition alongside z.lazy
export interface IfNode {
  type: "if";
  var: string;
  condition: Condition;
  children: WxpOperation[];
}

export interface ExecuteBlock {
  type: "execute";
  children: WxpOperation[];
}

export type WxpOperation =
  | ShellNode
  | PasteNode
  | IfNode
  | StringOpNode
  | ArgumentsNode
  | IncludeNode
  | ExecuteBlock
  | VersionTag;

export type WxpDocument = z.infer<typeof WxpDocumentSchema>;
