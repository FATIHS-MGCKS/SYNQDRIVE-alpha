# Workflow Idempotency Strategy (Phase 6 Prompt 29)

Occurrence- and action-based idempotency for SynqDrive workflow automation. Replaces insufficient entity-only deduplication with database-enforced unique keys and explainable audit decisions.

## Target formula

```
organizationId + workflowVersionId + actionStableId + occurrenceId = Action Idempotency Key
```

Stored as colon-separated string:

```
{organizationId}:{workflowVersionId}:{actionStableId}:{occurrenceId}
```

## Identifier definitions

| Identifier | Scope | Purpose |
|------------|-------|---------|
| **eventId** | Global | Unique domain event instance (UUID). Duplicate transport shares the same eventId. |
| **occurrenceId** | Business | Stable fact key — same occurrence re-delivered maps to the same idempotency scope. **No PII.** |
| **correlationId** | Process | Trace across events/runs in one business process. |
| **causationId** | Causal chain | Upstream `eventId` that caused this event. |
| **workflowRunId** | Execution | Primary key of `workflow_runs` row. |
| **actionId** | Execution | Primary key of `workflow_action_runs` row. |
| **providerIdempotencyKey** | Provider | Opaque key for email/webhook/SMS adapters — same formula as action key. |
| **deduplicationWindowMs** | Audit | Default 90 days (`WORKFLOW_IDEMPOTENCY_DEDUP_WINDOW_MS`). Uniqueness is **permanent** via DB constraints; window drives audit/explainability. |

## Key layers

| Layer | Formula | Unique constraint |
|-------|---------|-------------------|
| Outbox ingest | `{eventType}:{occurrenceId}` | `(organizationId, idempotencyKey)` |
| Workflow run | `{organizationId}:{workflowVersionId}:{occurrenceId}` | `(organizationId, workflowVersionId, occurrenceId)` |
| Action run | `{organizationId}:{workflowVersionId}:{actionStableId}:{occurrenceId}` | `(organizationId, workflowVersionId, actionStableId, occurrenceId)` |
| Timer | `timer:{occurrenceId}` | `(organizationId, idempotencyKey)` |
| Provider delivery | Same as action key | `(organizationId, idempotencyKey)` |

`actionStableId` = workflow definition `actionKey` (stable within version graph).

## occurrenceId resolution

1. Explicit `occurrenceId` on emit input or envelope `metadata.occurrenceId`
2. DTC / finding: `{eventType}:{vehicleId}:{dtcCode|findingKey}`
3. Booking timing: `{eventType}:{bookingId}:{milestoneDateOnly}`
4. One-shot entity events: `{eventType}:{entityId}`
5. Fallback: `event:{eventId}`

Reject occurrenceIds containing email/phone patterns.

## Atomic protection (no check-then-create)

All enqueue/create paths:

1. **INSERT** first
2. On `P2002` unique violation → fetch existing row → record `DUPLICATE_SUPPRESSED` in `workflow_idempotency_decisions`
3. Never rely on pre-insert `findUnique` as sole guard

## Collision safety

| Scenario | Behavior |
|----------|----------|
| Duplicate domain event delivery | Same `occurrenceId` → same outbox/run/action keys → suppressed |
| Two DTCs on same vehicle | Different `occurrenceId` (DTC code in key) → both execute |
| Two pickup-overdue bookings | Different `bookingId` in `occurrenceId` → both execute |
| Parallel workers | DB unique constraint → one wins, others get existing row |
| Provider webhook retry | `providerIdempotencyKey` prevents duplicate status change |
| Action retry | Same action run row; retry timer uses `retry:{runId}:{actionRunId}` occurrence |
| Cross-tenant | `organizationId` in every key → no cross-tenant collision |

## Replay modes

| Mode | occurrenceId | Use |
|------|--------------|-----|
| **SAME** | Unchanged | DLQ replay — idempotent, returns existing execution |
| **FORCE_NEW** | `{base}:force:{token}` | Manual force replay — requires permission + audit entry |

Force replay must not reuse provider idempotency keys without new occurrence suffix.

## Migration from legacy keys

| Legacy pattern | New mapping |
|----------------|-------------|
| `{eventId}:workflow:{definitionId}` | `event:{eventId}` occurrence + version-scoped run key |
| `{eventType}:{entityId}` outbox | `{eventType}:{occurrenceId}` |
| `{runKey}:action:{index}` | `{org}:{version}:{actionKey}:{occurrenceId}` |
| Legacy org engine `{base}:workflow:{workflowId}` | `{org}:legacy:{workflowId}:{occurrenceId}` |

Existing rows keep historical `idempotencyKey` values; new columns (`occurrenceId`, `actionStableId`) populated on new writes only.

## Module layout

```
backend/src/modules/workflows/idempotency/
  workflow-idempotency.types.ts
  workflow-idempotency-key.builder.ts
  workflow-idempotency-occurrence.resolver.ts
  workflow-idempotency.service.ts
  workflow-idempotency.module.ts
  workflow-idempotency.spec.ts
```

## Configuration

| Env | Default | Purpose |
|-----|---------|---------|
| `WORKFLOW_IDEMPOTENCY_DEDUP_WINDOW_MS` | 90 days | Audit window for explainability |

## Runtime Reliability Gate

| Check | Status |
|-------|--------|
| Unit tests (`workflow-idempotency.spec.ts`) | PASS |
| Outbox atomic dedup (`workflow-event-outbox.spec.ts`) | PASS |
| Orchestrator constraint replay (`workflow-run-state-machine.spec.ts`) | PASS |
| DB unique constraints migration | Applied (`20260726290000_workflow_idempotency`) |

**Runtime Reliability Gate: PASS**
