---
plan: 02-02
status: complete
completed_at: 2026-04-06
---

## Summary

Completed Wave 2: remaining command groups migrated.

### Delivered

- `src/commands/milestone.ts` — `MilestoneCompleteCommand`, `RequirementsMarkCompleteCommand`
- `src/commands/verify.ts` — `ValidateConsistencyCommand`, `ValidateHealthCommand`, `ValidateAgentsCommand`, `VerifyCommand`, `AuditUatCommand`
- `src/commands/workstream.ts` — 7 workstream commands
- `src/commands/scaffold.ts` — `ScaffoldCommand`
- `src/commands/commit.ts` — `CommitCommand`
- `src/commands/frontmatter.ts` — `FrontmatterGetCommand`, `FrontmatterSetCommand`, `FrontmatterMergeCommand`
- `src/commands/template.ts` — `TemplateSelectCommand`, `TemplateFillCommand`
- `src/commands/progress.ts` — `ProgressCommand`, `StatsCommand`, `TodoCompleteCommand`, `TodoMatchPhaseCommand`, `SummaryExtractCommand`
- `src/commands/index.ts` — re-exports all command classes

### Verification

- `npm run typecheck` → zero errors ✓
- `npm test` → 93/93 passed ✓
