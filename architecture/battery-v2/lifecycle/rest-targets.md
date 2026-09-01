# REST Targets (REST_60M / REST_6H)

**Epistemic status:** CONFIRMED (metadata FSM + reconciliation liveness)

## Target types

- `REST_60M` — delay from `getBatteryRest60mDelayMs()`
- `REST_6H` — delay from `getBatteryRest6hDelayMs()`

## Metadata status FSM (`lv-rest-window-target.metadata.ts`)

| Status | Reconciliation behavior (bootstrap) |
|--------|-------------------------------------|
| `SCHEDULED` | Blocks duplicate schedule (`isLvRestTargetAlreadyScheduled`) |
| `ENQUEUED` | Requires Bull liveness check; orphan → `PENDING_EVALUATION` |
| `RUNNING` | Treated as already scheduled — **orphan gap remains** |
| `PENDING_EVALUATION` | Reschedule on reconciliation cadence |
| `COMPLETED` / `MISSED` / `FAILED` / `CANCELLED` | Terminal — no reschedule |
| `SKIPPED` | **Semantics not reconstructed** (`BAT-V2-GAP-SKIPPED-REST-001`) |

## Three-layer liveness model

1. **Persisted metadata** (`scheduledTargets.REST_*`)
2. **BullMQ job** (`hasLiveJob(idempotencyKey)`)
3. **DLQ row** (`BatteryV2JobDeadLetterService`)

Metadata `ENQUEUED` ≠ live job.

## Evaluation outcomes

| Result | Metadata transition |
|--------|---------------------|
| Measurement exists | `COMPLETED` |
| Retryable missing evidence | `PENDING_EVALUATION` (no throw) |
| Grace exhausted | `MISSED` |
| Invalidated window | `CANCELLED` |
| Hard failure | `FAILED` |

**Handler:** `battery-rest-target-evaluate.handler.ts`

## Idempotency keys

Pattern: `battery-rest:{vehicleId}:{restWindowId}:{60m|6h}` via `BatteryV2RestTargetProducer.buildIdempotencyKey()`

**Contract:** `restWindowId` required on `BATTERY_REST_TARGET_EVALUATE` payload (`BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md`)
