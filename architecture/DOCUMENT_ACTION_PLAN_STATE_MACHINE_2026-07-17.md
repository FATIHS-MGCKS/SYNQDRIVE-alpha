# Document Action Plan Apply Lifecycle State Machine (V4.9.617)

**Date:** 2026-07-17  
**Prompt:** 42/84 — Full action plan execution state machine

## Scope

| Module | Role |
|--------|------|
| `document-action-plan.state-machine.ts` | Lifecycle statuses, transitions, outcome resolver |
| `document-action-plan.store.ts` | Persist `actionPlanApplyLifecycle` in `plausibility._pipeline` |
| `document-action-orchestrator.service.ts` | Lifecycle transitions during prepare/execute |
| `document-extraction.service.ts` | Maps lifecycle → `APPLIED` / `PARTIALLY_APPLIED` extraction status |
| `schema.prisma` | `DocumentExtractionStatus.PARTIALLY_APPLIED` |

## Lifecycle flow

```
READY_FOR_ACTION_PREVIEW
  → READY_TO_APPLY
  → APPLYING
  → APPLIED | PARTIALLY_APPLIED | APPLIED_WITH_WARNINGS | APPLY_FAILED
```

Stored under `plausibility._pipeline.actionPlanApplyLifecycle`.

## Rules

1. **APPLIED** — all required actions succeeded; no optional failures.
2. **APPLIED_WITH_WARNINGS** — required succeeded; only suggestion optional actions failed (`SUGGEST_ENTITY_LINK`, `SUGGEST_DEADLINE_REMINDER`).
3. **PARTIALLY_APPLIED** — required succeeded; at least one non-suggestion optional action failed.
4. **APPLY_FAILED** — at least one required action failed; extraction stays `CONFIRMED` for retry.
5. **Per-action status** — preserved in `actionPlanExecution.actions[]`.
6. **Retry** — skips `SUCCEEDED` / `SKIPPED` actions; only re-runs failed actions with matching idempotency key.
7. **Plan lock** — plan not editable while lifecycle is `APPLYING` (`PLAN_LOCKED` error).
8. **Plan changes** — fingerprint mismatch or invalidation requires a new plan.
9. **Transactional updates** — `APPLYING` persisted before execution; terminal lifecycle + execution persisted after.

## Extraction status mapping

| Lifecycle | Extraction status |
|-----------|-------------------|
| `APPLIED` | `APPLIED` |
| `APPLIED_WITH_WARNINGS` | `APPLIED` |
| `PARTIALLY_APPLIED` | `PARTIALLY_APPLIED` |
| `APPLY_FAILED` | `CONFIRMED` (retryable) |

## Tests

- `document-action-plan.state-machine.spec.ts` — transitions + outcome resolver
- `document-action-plan.state-machine.integration.spec.ts` — full success, warnings, required-failure retry
