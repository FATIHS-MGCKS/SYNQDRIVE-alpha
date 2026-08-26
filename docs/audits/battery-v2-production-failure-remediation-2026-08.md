# Battery V2 Production Failure Remediation — August 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `battery-v2-production-failure-remediation-2026-08` |
| **Related** | `production-worker-queue-clickhouse-audit-2026-08` |
| **Branch** | `cursor/battery-v2-rest-window-contract-2026-08-c835` |
| **Queue** | `battery.v2` (`QUEUE_NAMES.BATTERY_V2`) |

---

## 1. Incident Summary

Production BullMQ showed **77 failed jobs** (audit 2026-08-26), of which **68** were `battery.v2` jobs failing with:

`REST target job missing restWindowId`

Failures were **not historical retention only** — reconciliation re-enqueued malformed jobs every ~5 minutes until terminal failure + dead-letter.

ClickHouse recovery (PR #1311) is unrelated; this remediation targets **Battery V2 REST target contract** only.

---

## 2. 68 Failed Jobs Breakdown

**Production forensics (read-only, 2026-08-26):**

| Cluster | Count | Job name | Idempotency prefix | `restWindowId` in payload | Failure reason |
|---------|-------|----------|--------------------|---------------------------|----------------|
| **BAT-C1** | **68** | `BATTERY_REST_TARGET_EVALUATE` | `rest-target:` | **absent** | `REST target job missing restWindowId` |

**Payload shape (all 68):** `organizationId`, `vehicleId`, `idempotencyKey`, `sourceEntityId`, `requestedAt`, `modelVersion`, `correlationId`, `attemptContext`, `restWindowStartedAt`, `restTargetType` — **no `restWindowId`**.

**Producer path (confirmed):** `BatteryV2ReconciliationService.reconcileLegacyRestTargets()` — direct `jobProducer.enqueue()` with legacy `buildRestTargetJobIdempotencyKey()` (`rest-target:{vehicleId}:{type}:{startedAtMs}`).

**Conclusion:** Single root-cause cluster — **100% of 68 jobs**.

---

## 3. Current Architecture

```
BatteryV2ReconciliationScheduler (5 min)
  → BatteryV2ReconciliationService.reconcileAll()
      → reconcileLvRestWindowTargets()     [LV_REST_WINDOW sessions → RestTargetProducer]
      → reconcileLegacyRestTargets()       [battery_features → WAS broken direct enqueue]
      → … observation / trip / HV paths

BatteryV2RestTargetProducer.scheduleTarget()
  → BatteryV2JobProducerService.enqueue('BATTERY_REST_TARGET_EVALUATE')
      → BullMQ battery.v2 (jobId from battery-rest idempotency key)

BatteryV2Processor
  → BatteryRestTargetEvaluateHandler
      → requires restWindowId
      → loads LV_REST_WINDOW session by idempotencyKey = restWindowId
      → BatteryRestTargetEvaluationService.evaluateAndPersist()
```

**Enqueue paths (audit spec):** snapshot observation, trip start, LV FSM (when wired), reconciliation (LV + legacy), capability refresh, HV recharge/capacity producers.

---

## 4. restWindowId Semantics

| Question | Answer |
|----------|--------|
| What is it? | Canonical LV rest window identity: `lv-rest:{vehicleId}:{anchorAtMs}` |
| Entity | `BatteryMeasurementSession` (`type = LV_REST_WINDOW`), `idempotencyKey` = `restWindowId` |
| When created? | LV rest FSM / session create (`buildLvRestWindowIdempotencyKey`) |
| When required? | **Always** for `BATTERY_REST_TARGET_EVALUATE` handler |
| When optional? | **Never** for REST target jobs (legacy `battery_features` flags alone are insufficient) |
| Consumer | `BatteryRestTargetEvaluateHandler` line 45–51 — non-retryable if missing |

Legacy `battery_features.restWindowStartedAt` tracks old capture path; canonical evaluation requires the **session row**.

---

## 5. Root Causes

| ID | Root cause | Confidence |
|----|------------|------------|
| **BAT-RC-01** | `reconcileLegacyRestTargets` enqueued `BATTERY_REST_TARGET_EVALUATE` without `restWindowId` | **Confirmed** |
| **BAT-RC-02** | Handler requires `restWindowId` to load `LV_REST_WINDOW` session | **Confirmed** |
| **BAT-RC-03** | Validation layer did not require `restWindowId` at enqueue — mismatch with handler | **Confirmed** |
| **BAT-RC-04** | Legacy idempotency key `rest-target:*` diverged from canonical `battery-rest:*` + window id | **Confirmed** |
| **BAT-RC-05** | Reconciliation scheduler (~5 min) re-created failures until dead-letter | **Confirmed** |
| **BAT-RC-06** | TypeScript type marked `restWindowId` optional — false contract signal | **High** |

---

## 6. Reconciliation Failure Path

1. `battery_features` row has `restWindowStartedAt`, missing `rest60mCapturedAt` / `rest6hCapturedAt`
2. `reconcileLegacyRestTargets` builds `rest-target:{vehicleId}:REST_60M|REST_6H:{ms}`
3. Enqueue payload: `restWindowStartedAt`, `restTargetType` — **no `restWindowId`**, no `sourceEntityId`
4. Worker: `BatteryRestTargetEvaluateHandler` throws `BatteryV2ProviderError` (retryable: false)
5. After 3 attempts → failed set + optional `BatteryV2JobDeadLetter`
6. Next reconciliation tick → repeat (until dead-letter suppresses enqueue)

**Not** a DB query omission — field was never part of legacy enqueue DTO.

---

## 7. Canonical Contract

### `BATTERY_REST_TARGET_EVALUATE` payload (required fields)

| Field | Required | Notes |
|-------|----------|-------|
| `organizationId`, `vehicleId`, `idempotencyKey`, `correlationId`, `modelVersion`, `attemptContext` | yes | base |
| **`restWindowId`** | **yes** | `lv-rest:{vehicleId}:{anchorAtMs}` |
| `restWindowStartedAt` | recommended | ISO anchor |
| `restTargetType` | recommended | `REST_60M` \| `REST_6H` |
| `sourceEntityId` | recommended | `BatteryMeasurementSession.id` |

**Idempotency key (canonical):** `battery-rest:{vehicleId}:{restWindowId}:60m|6h`

**Enqueue rule:** Only via `BatteryV2RestTargetProducer` (or equivalent full payload). **No** bare `rest-target:*` enqueue without `restWindowId`.

**Validation:** `validateBatteryV2JobPayload` rejects missing `restWindowId` at enqueue.

---

## 8. Code Changes

| File | Change |
|------|--------|
| `battery-v2-reconciliation.service.ts` | Legacy reconcile bridges `battery_features` → LV session → `RestTargetProducer`; skips when no session; updates session metadata after schedule (dedupe) |
| `battery-v2-job.validation.ts` | Require `restWindowId` for REST target jobs |
| `battery-v2-job.types.ts` | `restWindowId` required in type |
| `battery-v2-reconciliation.spec.ts` | Legacy + dedupe tests |
| `battery-v2-job.validation.spec.ts` | Contract rejection test |
| `battery-rest-target-evaluate.handler.spec.ts` | Missing `restWindowId` regression |

---

## 9. Idempotency

| Layer | Mechanism |
|-------|-----------|
| BullMQ `jobId` | `buildBatteryV2JobId(idempotencyKey)` — duplicate suppress in queue |
| Canonical key | `battery-rest:{vehicleId}:{restWindowId}:60m|6h` |
| Dead letter | `BatteryV2JobDeadLetter` blocks re-enqueue for terminal keys |
| Worker | `BatteryV2IdempotentExecutionService` + measurement uniqueness |
| REST measurement | Session + measurement type uniqueness |

**Assessment:** Re-processing same canonical job is safe (measurement idempotent skip). **Legacy 68 jobs are not safe to retry** — payload invalid; canonical re-enqueue uses different idempotency key.

---

## 10. Tests

| Suite | Coverage |
|-------|----------|
| `battery-v2-reconciliation.spec.ts` | Legacy bridge via producer; skip without session; metadata dedupe |
| `battery-v2-job.validation.spec.ts` | Reject REST job without `restWindowId` |
| `battery-rest-target-evaluate.handler.spec.ts` | Handler rejects missing `restWindowId` |

Regression: production error string `REST target job missing restWindowId` covered at validation + handler layers; reconciliation no longer produces malformed enqueue.

---

## 11. Production Validation

| Metric | Pre-deploy (2026-08-26) |
|--------|-------------------------|
| `battery.v2` failed | **68** |
| waiting / active / delayed | **0** / **0** / **0** |
| Failure reason (sample) | 100% `REST target job missing restWindowId` |
| Idempotency prefix | 100% `rest-target:` |

Post-deploy validation: see PR / gate section (monitor failed count + new failures over window).

---

## 12. Existing Failed Jobs Classification

| Class | Count | Rationale |
|-------|-------|-----------|
| **C — Invalid payload** | **68** | Missing `restWindowId`; cannot run handler |
| A — Safe retry | 0 | — |
| B — Obsolete | (overlap) | May be satisfied in `battery_features` but job payload unreparable |
| D — Already satisfied | unknown | Would need per-vehicle measurement check |

**Retry recommendation:** **Do not bulk-retry.** Jobs use legacy keys and invalid payloads. Canonical work should be scheduled via fixed reconciliation + `RestTargetProducer` when LV session + business rules apply. Dead-letter entries for `rest-target:*` keys intentionally block blind re-enqueue.

---

## 13. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `battery_features` rest flags without LV session — no REST shadow capture | Medium | Legacy bridge skips; may need future migration/backfill |
| LV FSM `processEvent()` not wired in all live paths | Medium | Reconciliation drives scheduling today |
| 68 failed jobs remain in Redis (BullMQ health noise) | Low | Observability phase; not purged in this remediation |
| `rest-target:*` dead-letter keys block legacy re-enqueue | Low | Intended — canonical path uses `battery-rest:*` |

---

**Changes / Architektur:** See `architecture/BATTERY_V2_REST_WINDOW_CONTRACT_2026-08-26.md`.
