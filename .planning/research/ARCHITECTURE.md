# Architecture Research: pi-gsd WXP Milestone

**Research date:** 2026-04-06
**Milestone:** v1.0 — WXP + oclif + type cleanup + harness distribution

## Existing Architecture

```
src/
├── cli.ts              (~9k lines, lazy-loaded commander.js router)
├── output.ts           (--output toon / --pick JSONPath formatting)
└── lib/                (16 domain modules)
    ├── core.ts         (config loading, model aliases, GSD config)
    ├── state.ts        (STATE.md r/w)
    ├── roadmap.ts      (ROADMAP.md r/w)
    ├── phase.ts        (phase lifecycle)
    ├── milestone.ts    (milestone management)
    ├── config.ts       (config.json CRUD)
    ├── frontmatter.ts  (YAML frontmatter r/w — has any debt)
    ├── schemas.ts      (Zod schemas for .planning/ structures)
    ├── security.ts     (existing — path validation)
    ├── template.ts     (template selection/filling)
    ├── workstream.ts   (workstream management)
    ├── verify.ts       (health/consistency checks)
    └── ...

.gsd/
├── extensions/
│   └── gsd-hooks.ts    (pi extension: context event, <gsd-include> resolution)
└── harnesses/
    └── pi/get-shit-done/  (workflow files, currently symlinked)
```

---

## New Architecture (after WXP milestone)

```
src/
├── wxp/                          ← NEW
│   ├── index.ts                  main entry: processWxp(text, cwd, vars?) → string
│   ├── parser.ts                 XML token extraction from markdown text
│   ├── arguments.ts              <gsd-arguments> parsing + $ARGUMENTS two-pass split
│   ├── executor.ts               <gsd-execute> block runner (top-to-bottom)
│   ├── shell.ts                  <shell> execution (execFileSync, allowlist, timeout)
│   ├── conditions.ts             <if>/<equals>/<starts-with> evaluation
│   ├── string-ops.ts             <string-op> (split in v1)
│   ├── variables.ts              typed variable store (get/set/resolve/prefix)
│   ├── paste.ts                  <gsd-paste> replacement
│   ├── security.ts               trusted-path check, allowlist enforcement
│   ├── schema.ts                 Zod schemas for all WXP types (single source of truth)
│   └── schemas/
│       └── wxp.xsd               XSD 1.1 canonical schema (IDE + docs)
├── commands/                     ← NEW (oclif command classes)
│   ├── state/
│   │   ├── index.ts              (state - parent)
│   │   ├── json.ts               state json
│   │   ├── update.ts             state update
│   │   └── ...
│   ├── phase/
│   │   ├── add.ts
│   │   ├── complete.ts
│   │   └── ...
│   ├── milestone/
│   ├── roadmap/
│   ├── init/
│   ├── config/
│   ├── workstream/
│   ├── wxp/
│   └── ...
├── lib/                          (existing, cleaned up — zero any)
│   └── frontmatter.ts            FrontmatterObject → YamlValue recursive type
├── cli.ts                        oclif run() entrypoint (replaces 9k-line switch)
└── output.ts
```

---

## Integration Point: pi Context Event

**How WXP wires into the existing extension:**

```typescript
// .gsd/extensions/gsd-hooks.ts (simplified current structure)
export async function context(messages, options) {
  // Phase 1 (existing): <gsd-include> resolution
  const resolvedText = await resolveIncludes(messages[0].content, cwd);
  
  // Phase 2 (NEW): WXP processing
  const processedText = await processWxp(resolvedText, cwd, {});
  
  messages[0].content = processedText;
  return { messages };
}
```

**Interface for `processWxp`:**
```typescript
export async function processWxp(
  text: string,
  cwd: string,
  initialVars?: Record<string, WxpValue>
): Promise<string>
// Throws WxpError on any failure (total crash semantics)
// Returns clean text with all WXP tags stripped
```

**Error notification pattern:**
```typescript
// On WxpError, the context event returns:
return {
  messages: [],  // blocks LLM call
  notification: {
    level: "error",
    title: "WXP Processing Failed",
    body: error.stateReport  // full variable namespace + pending blocks
  }
}
```

---

## Resolution Loop Design

```
loop:
  1. Find unprocessed <gsd-include> tags not inside pending blocks
     → resolve file, inject content, mark <gsd-include done />
  2. Find <gsd-arguments> blocks not done
     → parse $ARGUMENTS, populate variables, mark done
  3. Find <gsd-execute> blocks not done
     → execute top-to-bottom (shell, if, string-op)
     → <if> evaluated: false branch marked <then done false />, true branch left
     → mark <gsd-execute done>
  4. Find <gsd-paste> tags not done
     → replace with variable value (missing var → throw WxpError)
     → mark done
  5. If new unprocessed tags introduced → goto 1
  6. Final gate: any WXP tag NOT marked done → throw WxpError
  7. Strip ALL WXP tags (including done markers) from final text

Loop termination: max 50 iterations (configurable). Exceeding limit → WxpError "Resolution loop exceeded max iterations — check for circular includes"
```

**Done-marker pattern:**
- Tags are mutated in the text string: `<gsd-execute>` → `<gsd-execute done>`
- Final strip regex: `/<gsd-[a-z-]+[^>]*done[^>]*>[\s\S]*?<\/gsd-[a-z-]+>|<gsd-[a-z-]+[^>]*done[^>]*\/>/g`
- String mutations make the loop stateful — each iteration works on the accumulated text

---

## Module Boundaries and Build Order

**Build order (dependency graph):**

```
1. src/wxp/schema.ts           (no deps — Zod schemas)
2. src/wxp/variables.ts        (deps: schema)
3. src/wxp/security.ts         (deps: schema — trusted paths, allowlist)
4. src/wxp/parser.ts           (deps: schema, variables)
5. src/wxp/shell.ts            (deps: schema, variables, security)
6. src/wxp/conditions.ts       (deps: schema, variables)
7. src/wxp/string-ops.ts       (deps: schema, variables)
8. src/wxp/arguments.ts        (deps: schema, variables, parser)
9. src/wxp/paste.ts            (deps: schema, variables)
10. src/wxp/executor.ts         (deps: shell, conditions, string-ops, paste, variables)
11. src/wxp/index.ts            (deps: parser, arguments, executor, paste, security)
```

**Phase implications for roadmap:**
- Phase 1 (WXP Foundation): modules 1-11 + integration into gsd-hooks.ts + tests
- Phase 2 (oclif): `src/commands/` tree, remove commander.js — independent of Phase 1 (can overlap)
- Phase 3 (Workflows): requires Phase 1 complete; converts .md files one-by-one
- Phase 4 (Types): can start during Phase 1 (frontmatter.ts, config.ts are independent)
- Phase 5 (Harness): independent of all others — purely extension code change

---

## Testing Architecture

**Unit tests (per module):**
```
src/wxp/__tests__/
├── parser.test.ts          tag extraction, code-fence skipping, self-closing vs children
├── arguments.test.ts       two-pass parse, flags, positionals, greedy last string
├── variables.test.ts       get/set/collision detection/owner prefix
├── conditions.test.ts      equals, starts-with, type coercion
├── string-ops.test.ts      split operation
├── paste.test.ts           replacement, undefined var error
├── security.test.ts        trusted path validation, allowlist enforcement
└── shell.test.ts           execFileSync mock, timeout, non-zero exit
```

**Integration tests:**
```
src/wxp/__tests__/
└── pipeline.test.ts        full processWxp() call with fixture .md files
    fixtures/
    ├── basic-shell.md      <gsd-execute><shell>...</shell></gsd-execute>
    ├── conditional.md      <if> with true/false branches
    ├── nested-include.md   include that includes another file
    ├── collision.md        two includes with same variable names
    └── failure-*.md        each failure mode (bad allowlist, undefined var, timeout)
```

**Mock strategy:**
- `vi.mock('../shell', () => ({ runShell: vi.fn() }))` in unit tests
- Integration tests use real `execFileSync` with allowlisted commands only (`echo`, `cat`)

---

## oclif Command Tree (directory structure)

```
src/commands/
├── state/
│   ├── index.ts          (pi-gsd-tools state)
│   ├── json.ts           (pi-gsd-tools state json)
│   ├── update.ts         (pi-gsd-tools state update)
│   ├── get.ts            (pi-gsd-tools state get <key>)
│   └── patch.ts          (pi-gsd-tools state patch)
├── roadmap/
│   ├── get-phase.ts
│   ├── analyze.ts
│   └── update-plan-progress.ts
├── phase/
│   ├── add.ts
│   ├── insert.ts
│   ├── remove.ts
│   ├── complete.ts
│   └── next-decimal.ts
├── milestone/
│   └── complete.ts
├── verify/
│   ├── plan-structure.ts
│   └── phase-completeness.ts
├── init/
│   ├── execute-phase.ts
│   ├── plan-phase.ts
│   └── ...
├── config/
│   ├── get.ts
│   ├── set.ts
│   └── set-model-profile.ts
├── workstream/
│   ├── create.ts
│   ├── list.ts
│   ├── status.ts
│   └── complete.ts
└── wxp/
    └── process.ts        (for direct WXP operations)
```
