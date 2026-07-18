# Document Action Executor Framework (V4.9.611)

**Date:** 2026-07-17  
**Prompt:** 36/84 — Shared DocumentActionExecutor framework with ARCHIVE and LINK executors

## Scope

| Module | Role |
|--------|------|
| `document-action.types.ts` | Action requirements, execution statuses, plan execution records |
| `document-action-plan.types.ts` | Plan version, fingerprint, idempotency key helpers |
| `document-action.errors.ts` | Structured business, technical, and plan validation errors |
| `document-action-executor.interface.ts` | Per-type executor contract |
| `document-action-plan.builder.ts` | Builds confirmed plans from existing semantic planners |
| `document-action-plan.store.ts` | Persists plan + execution audit in `plausibility._pipeline` |
| `document-action-executor.registry.ts` | Action type → executor registry (no monolithic switch) |
| `document-action-orchestrator.service.ts` | Validates plan, executes required/optional actions, audits results |
| `executors/archive-document-action.executor.ts` | `ARCHIVE_DOCUMENT` |
| `executors/link-entity-document-action.executor.ts` | `SUGGEST_ENTITY_LINK` |

## Execution rules

1. **One executor per action type** — registry dispatch, no monolithic `apply()` branching for archive path.
2. **Confirmed plan required** — `assertExecutableActionPlan()` blocks DRAFT/INVALIDATED plans.
3. **Version + fingerprint** — execution rejects stale plans when confirmed data changes.
4. **Idempotency key** — `{extractionId}:v{version}:{fingerprint}:a{sequence}:{action}`.
5. **Required vs optional** — required actions fail the plan; optional failures are logged/skipped; informational actions are skipped.
6. **Auditable** — plan + per-action execution stored under `plausibility._pipeline.actionPlan` and `actionPlanExecution`.
7. **Domain reuse** — archive executor reuses `assessArchiveApplyGate` / `buildArchiveApplyPayload`; link executor reuses `buildEntityLinkSuggestions`.

## Confirm / apply wiring

- `DocumentExtractionService.confirm()` routes `OTHER` and `VEHICLE_CONDITION` through `DocumentActionOrchestratorService`.
- Legacy `DocumentExtractionApplyService.apply()` remains for other document types until dedicated executors exist.
- `retryConfirmedApply()` uses the same orchestrator path for archive documents.

## Initial executors

| Action | Requirement | Result |
|--------|-------------|--------|
| `ARCHIVE_DOCUMENT` | REQUIRED | `resultEntityId = extractionId`, `archived: true` |
| `SUGGEST_ENTITY_LINK` | OPTIONAL | suggestion-only or accepted links from `confirmedData.acceptedEntityLinks` |

## Tests

- `document-action-plan.types.spec.ts` — fingerprint + idempotency key stability
- `document-action-orchestrator.service.spec.ts` — plan build, execute, idempotent retry, fingerprint mismatch, blocked plan
- `executors/archive-document-action.executor.spec.ts`
- `executors/link-entity-document-action.executor.spec.ts`

## Future work

- Prisma `document_action_plans` / `document_actions` tables (see `cursor/document-action-planner-engine-7ddc` branch)
- Additional executors per semantic action (damage create, invoice draft, tire measurement, …)
- Gradual migration off `DocumentExtractionApplyService` type branching
