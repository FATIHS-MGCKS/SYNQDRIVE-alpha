# Battery V2 Stage 1 — Pipeline Defect Closure — 2026-08-30

## Production evidence (read-only audit)

Vehicles: KS MS 661 (`c10351f8-…`), KS MX 2024 (`a60c0749-…`).

| Defect | Production shape | Outcome before fix |
|--------|------------------|-------------------|
| **A — liveness** | Trip `ea7696b6…` finalized `2026-08-30T13:57:50.848Z`; no `LV_REST_WINDOW` 50+ min later; PM2 restart ~14:53Z | Primary enqueue lost/interrupted; reconciliation only re-enqueued jobs; no direct arming |
| **B — trip binding** | Sessions `d8b4db92…`, `dde74be4…`: anchor = trip N `endTime`, `trip_id` = trip N-1 | FSM used `lastActivityAt` when `tripEndAt` differed; P2002 idempotent return did not repair `trip_id` |
| **C — REST temporal** | Session `4d2bef5f…`: REST_60M/6H due, metadata `ENQUEUED`, Bull failed in ~15s, DLQ `PROVIDER_UNAVAILABLE` | Handler threw on retryable pending evidence; Bull exhausted before 30m grace; `ENQUEUED` blocked reconciliation; DLQ blocked re-enqueue |
| **D — LOCK_CONTENTION** | 2× `BATTERY_LV_REST_SESSION_OPEN` DLQ on KS MS 661 | DLQ permanently suppressed producer; replay env-gated |

#1393 opening policy and #1383 observation-independent opening are **preserved**.

## Root causes

### A — Missing session after finalization / deploy

1. Primary path enqueues `BATTERY_LV_REST_SESSION_OPEN` at trip finalization.
2. Reconciliation previously only called `enqueueSessionOpenForFinalizedTrip()` — not direct arming.
3. Lost/interrupted Bull jobs with no DLQ row left no durable recovery trigger.
4. `isDeadLetter()` suppressed all subsequent enqueues when DLQ existed.

### B — Cross-trip `trip_id` mis-binding

1. `TRIP_ENDED` anchor used `signal.lastActivityAt` instead of authoritative `tripEndAt`.
2. `createIdempotent` P2002 path returned existing session without repairing `trip_id`.
3. Bridge `resolveFinalizedTripForAnchor` could pick closest trip inside ±120s without exact `endTime` preference.

### C — REST_60M / REST_6H stuck `ENQUEUED`

1. Handler threw retryable `BatteryV2ProviderError` → BullMQ 3×5s exhausted (~15s).
2. Evaluation retry grace (30m) never reached.
3. Metadata stayed `ENQUEUED`; `isLvRestTargetAlreadyScheduled()` treated that as blocking reconciliation.
4. `PROVIDER_UNAVAILABLE` DLQ blocked producer re-enqueue.

### D — LOCK_CONTENTION permanent loss

Same DLQ suppression + env-gated replay (`BATTERY_V2_DLQ_REPLAY_ENABLED`) allowed transient lock contention to create a permanent liveness hole.

## Corrected architecture

### Session canonical identity invariant

When an authoritative finalized trip is known:

- `session.trip_id === trip.id`
- `session.startedAt / anchor === trip.endTime`
- `idempotencyKey === lv-rest:{vehicleId}:{trip.endTime ms}`

Explicit `tripId` from primary/reconciliation/arming **never** replaced by fuzzy bridge resolution. Bridge-only path may resolve trip from anchor when no authoritative trip was supplied; resolved trip then owns both anchor and `trip_id`.

### Job / session lifecycle (old → new)

| Stage | Old | New |
|-------|-----|-----|
| Trip finalize | enqueue session-open job | unchanged (primary) |
| Reconciliation missing session | enqueue-only recovery | **direct `ensureLvRestWindowForFinalizedTrip()`** first; recovery enqueue with `recovery: true` fallback |
| DLQ transient errors | permanent enqueue block | scheduler **always** clears `LOCK_CONTENTION`, `PROVIDER_UNAVAILABLE`, `TRANSIENT_INFRA`; recovery producers call `clearDeadLetter` + `ignoreDeadLetter` |
| REST evaluate retryable | throw → Bull exhaust → DLQ → stuck `ENQUEUED` | set `PENDING_EVALUATION`, return; reconciliation reschedules within grace |
| REST reconcile stuck target | `ENQUEUED` blocks forever | `isLvRestTargetTerminal()` only blocks COMPLETED/MISSED/CANCELLED/FAILED; dead-lettered `ENQUEUED` reset to `PENDING_EVALUATION` and rescheduled with `recovery: true` |
| Idempotent session race | stale `trip_id` kept | `repairCanonicalTripBindingIfNeeded()` on P2002 and arming `already_exists` |

### Queue durability semantics

- BullMQ job identity unchanged (`lv-rest-open:{vehicleId}:{anchorMs}`, `battery-rest:…`).
- Recovery enqueue removes terminal failed jobs before re-add (existing producer behavior).
- `ignoreDeadLetter` is **only** set on explicit reconciliation/recovery paths — never on primary hot path.

### Retry / dead-letter semantics

- **LOCK_CONTENTION / PROVIDER_UNAVAILABLE / TRANSIENT_INFRA**: replayable each reconciliation tick (max 25/batch).
- **REST retryable pending evidence**: handler defers (no throw/DLQ); metadata `PENDING_EVALUATION`; reconciliation reschedules until evaluation grace expires → canonical MISSED.
- **Non-retryable / grace exhausted**: terminal metadata (`MISSED`, `FAILED`, `CANCELLED`) — reconciliation does not reschedule.

## Files changed

- `lv-rest-window.state-machine.ts` — `resolveLvRestWindowAnchorAt()` prefers `tripEndAt`
- `battery-measurement-session.repository.ts` — trip binding repair on idempotent collision
- `lv-rest-window-session-arming.service.ts` — repair on `already_exists` / `duplicate_trip_end_event`
- `lv-rest-window-ingestion-bridge.service.ts` — exact `endTime` match before ±120s fallback
- `lv-rest-window-target.metadata.ts` — `isLvRestTargetTerminal()`
- `battery-v2-job-producer.service.ts` — `ignoreDeadLetter` option
- `battery-v2-job-dead-letter.service.ts` — `clearDeadLetter()`
- `battery-v2-lv-rest-session.producer.ts` — `recovery` flag + DLQ clear
- `battery-v2-rest-target.producer.ts` — `recovery` flag + DLQ clear
- `battery-v2-reconciliation.service.ts` — direct arming, trip binding repair, stuck-target rescue
- `battery-rest-target-evaluate.handler.ts` — defer retryable evaluation
- `battery-v2-reconciliation.scheduler.ts` — always clear replayable DLQ
- `battery-v2-jobs-producer.module.ts` — wire arming + session repository for reconciliation

## Tests

- `battery-v2-stage1-pipeline-defect-closure.spec.ts` (production-shaped A/B/D)
- Updated: `battery-v2-reconciliation.spec.ts`, `battery-rest-target-evaluate.handler.spec.ts`, `lv-rest-window-target.metadata.spec.ts`, `lv-rest-window.state-machine.spec.ts`, producer/audit/arming specs

## Preserved invariants

Shadow=true, publication=false, readiness=false, Stage 2 disabled, per-vehicle serialization, deterministic idempotency, charging/wake/active-trip gates, #1393 ICE opening policy, quality-policy semantics (no fabricated measurements).

## Remaining risks

- Pre-existing `battery-v2.service.spec.ts` failures on `main` (unrelated crank deprecation mocks).
- Stage 1 validation still requires deploy + natural trip observation after this fix lands.
- Very old anchors (>24h) remain intentionally not armed.
