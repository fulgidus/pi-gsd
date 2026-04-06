# Stack Research: pi-gsd WXP Milestone

**Research date:** 2026-04-06
**Milestone:** v1.0 — WXP + oclif + type cleanup + harness distribution

## Existing Stack (do not re-research)

- TypeScript 5.x, Node ≥18, tsup bundler, zod ^3.x, commander.js (being replaced)

---

## New Dependencies

### oclif `^4.22` — CLI framework replacement

**Current latest:** 4.22.96 (as of 2026-04-06, verified via npm)

**Why oclif over alternatives:**
- Class-based commands with static `flags` and `args` typed via `Flags.*` / `Args.*` decorators — zero manual parsing
- `this.parse(MyCommand)` returns fully typed `{flags, args}` — no `Record<string, any>`
- Auto-discovered command tree from `src/commands/` directory — no registration boilerplate
- Built-in `--help` and `--version` from class metadata
- Plugin architecture for future extensibility

**Migration from commander.js:**
- Each `case` in `cli.ts` switch → a class in `src/commands/<name>.ts` extending `Command`
- `program.option()` → `static flags = { name: Flags.string({...}) }`
- `program.argument()` → `static args = { name: Args.string({...}) }`
- `action()` handler body → `async run()` method
- No official migration script — manual refactor, one command at a time
- **Breaking change:** Help format, error message format, exit codes differ. Document for downstream workflow XML.

**Package:** `@oclif/core` (not `oclif` itself — `oclif` is the CLI scaffolder, `@oclif/core` is the runtime)

```bash
npm install @oclif/core
npm remove commander
```

---

### vitest `^2.x` — Test framework

**Current latest:** 2.x (4.1.2 per npm, 2026-04-06)

**Why vitest:**
- TypeScript-native: no ts-jest, no babel, no separate transform config
- Compatible with tsup (same esbuild chain)
- Config in `vite.config.ts` or inline in `package.json` — no separate `jest.config.*`
- `vi.mock()`, `vi.spyOn()` — mock execFileSync for shell tests without spawning processes
- Snapshot testing for preprocessor output (WXP pipeline tests)

**Setup:** Add `vitest` to devDependencies, add `"test": "vitest run"` script. No other config needed.

```bash
npm install -D vitest
```

---

### XML parsing strategy — **custom lexer, NOT a full XML library**

**Recommendation: Custom regex-based lexer over xmldom / fast-xml-parser / node-expat**

**Why NOT a full XML parser:**
- WXP tags appear inside markdown — a full XML parser expects a root element and rejects mixed content
- Markdown code blocks (` ```xml `) contain WXP-lookalike tags that must be skipped
- Full XML parsers are document-oriented; WXP needs token extraction from a text stream
- `fast-xml-parser` and `xmldom` both choke on markdown-mixed content without pre-processing that is itself complex

**Why a custom lexer is acceptable:**
- WXP tags are well-defined: always `<gsd-*>` or `<gsd-*/>` with no namespace conflicts
- No unbounded nesting (include inside execute, but not recursive execute)
- The character set of attribute values is constrained (no unescaped `<` inside attribute values)

**Lexer design:**
1. First pass: identify and mark code fences (` ``` ` blocks) — skip all content inside them
2. Second pass: extract `<gsd-*` tokens with a greedy regex over the non-fence regions
3. Build a lightweight AST: `{ tag, attrs, children, raw, offset }` per token
4. Done-marker: mutate the raw string to replace processed tags (see resolution loop)

**Pitfall:** Self-closing `<gsd-include ... />` vs children `<gsd-include ...>...</gsd-include>` — the lexer must handle both. Regex: `/<gsd-[a-z-]+(\s[^>]*)?\s*\/?>` for open/self-closing detection.

**No new runtime dependency needed.** Custom lexer lives in `src/wxp/parser.ts`.

---

### Zod `^3.x` — Already a dependency, expand usage

**Pattern: Zod-first types via `z.infer<>`**

```typescript
// schema.ts
export const ShellArgSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('string'), value: z.string() }),
  z.object({ kind: z.literal('varref'), name: z.string(), wrap: z.string().optional() }),
]);
export type ShellArg = z.infer<typeof ShellArgSchema>;
```

Zero hand-written interfaces. All types inferred. Schema validates XML AST at parse time AND serves as the TypeScript type source.

---

### XSD 1.1 — For IDE support (no new runtime dependency)

**Author:** `src/schemas/wxp.xsd` by hand — XSD 1.1 syntax is well-supported in VSCode via Red Hat XML extension
**Validation:** Zod handles runtime validation. XSD is documentation/IDE only.
**Published:** Alongside the package for external tooling.
**No npm package needed for XSD itself.**

---

## What NOT to Use

| Library | Why not |
| --- | --- |
| `xmldom` | Document-oriented, fails on markdown-mixed content |
| `fast-xml-parser` | Same issue; also adds 200KB to bundle |
| `node-expat` | Native binding, breaks in environments without build tools |
| `valibot` | Redundant — zod already in tree, no migration benefit |
| `ts-migrate` | Overkill — `any` is isolated to 6 files, manual fix is faster |
| `jest` | Heavy config, TypeScript transforms required; vitest is strictly better here |
| `yargs` | Another CLI framework — pick oclif and commit |

---

## Build Integration

- `tsup src/cli.ts --format cjs` continues to work with oclif (oclif supports CJS bundles)
- Add `src/wxp/` to tsup entry if WXP needs to be imported externally (unlikely for v1)
- Add `"test": "vitest run"` to `package.json` scripts
- `npm run typecheck` must pass at zero errors before any merge
