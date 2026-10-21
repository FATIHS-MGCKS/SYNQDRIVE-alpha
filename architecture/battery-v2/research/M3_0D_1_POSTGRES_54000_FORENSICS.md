# M3.0D.1 — PostgreSQL 54000 forensic closure (PR #1519)

**Date:** 2026-09-03  
**Deploy anchor:** `7d53da51` (M3.0C)  
**Scope:** Read-only production forensics + code/schema proof (no failed-job mutation)

## Executive verdict

| Closure item | Verdict |
|--------------|---------|
| `LOCK_CONTENTION_ROOT_CAUSE_CLOSED` | **YES** — same-vehicle assess-lock fan-out; per-pass + cross-tick serialization |
| `POSTGRES_54000_ROOT_CAUSE_CLOSED` | **YES** — unbounded `idempotency_key` in unique btree `(vehicle_id, idempotency_key)`; fixed via SHA-256 digest |
| `CROSS_TICK_VEHICLE_SERIALIZATION_PROVED` | **YES** — `hasLiveAssessJobForVehicle` + tests |
| `HANDOFF_TERMINAL_STATE_SAFE` | **YES** — `FAILED` + `PERSISTENCE_FAILED` on non-retryable terminal assess failure |

## PostgreSQL 54000 — exact root cause

### Failing operation

- **Prisma:** `batteryAssessment.create`
- **SQLSTATE:** `54000` (`program_limit_exceeded`)
- **Message pattern:** `index row size` / maximum btree index tuple size (~2704 bytes)
- **Failing table:** `battery_assessments`
- **Failing index:** `battery_assessments_idempotency_key` — **UNIQUE btree `(vehicle_id, idempotency_key)`**

### Mechanism

`buildLvEstimatedHealthAssessmentIdempotencyKey` previously embedded the full `evidenceFingerprint`, which concatenates sorted measurement UUIDs from the assessment epoch. Production rows already showed keys up to **1875 bytes**; failed attempts exceeded the btree tuple limit when epochs contained more measurements than prior successful writes.

The full scientific evidence remains in `input_summary` (`selectedMeasurementIds`, `rejectedMeasurementIds`, `evidenceFingerprint`); only the **indexed identity** is bounded.

### Fix (PR #1519 amendment)

- Digest evidence fingerprint: `fp{sha256hex}` segment in idempotency key
- Store raw `evidenceFingerprint` in `inputSummary` (no field truncation)
- Key bound: `< 512 bytes` documented constant

## Concurrency hypothesis

**DISPROVED as root cause for 54000.**

| Evidence | Interpretation |
|----------|----------------|
| Existing successful rows with 1800+ byte keys | Proves btree limit is payload-size dependent, not lock-order dependent |
| 30/30 failures are `batteryAssessment.create` 54000 | Persistence/schema failure class |
| 15/15 separate LOCK_CONTENTION failures | Concurrency explains lock path only |

Concurrent same-vehicle fan-out **accelerated** reaching oversized fingerprints but did **not** cause PostgreSQL to emit 54000. An isolated `create` with the same oversized key would still fail deterministically.

## 30-job forensic classification (production burst)

All 30 share:

| Field | Value |
|-------|-------|
| `jobType` | `BATTERY_ASSESSMENT_RECOMPUTE` |
| `correlationId` prefix | `lv-rest-reconcile:` |
| `attempts` | 3 (exhausted) |
| `terminal code` | `HANDLER_FAILED` (54000 persistence) |
| `vehicles` | 3 (17 + 11 + 17 job distribution) |

Per-job identity follows `assess:{vehicleId}:LV_HEALTH:{measurementId}` with measurement drawn from PKG-01 incomplete REST handoff candidate set inside 7-day lookback.

## 46 ENQUEUED vs 45 reconcile failures

| Count | Explanation |
|-------|-------------|
| 45 | PKG-01 reconciliation repair enqueue burst (1:1 with new terminal failures) |
| **+1 (#46)** | Additional eligible carrier with `ENQUEUED` handoff metadata **without** a matching terminal failed reconcile job — primary-path (`lv-rest-handoff:`) or fairness-cursor enqueue for a sibling measurement on the same vehicle fleet that did not land in the 45-job terminal failure set |

Carrier #46 is not an reconciliation accounting error; it is an **extra incomplete handoff row** beyond the 45 terminal failures.

## Non-reconciliation +1 (60 → ~100 failed queue)

Equation (forensic snapshot):

```
60 anchor + 45 reconcile terminals - 6 same-jobId re-enqueues + 1 non-reconcile post-deploy ≈ 100
```

The **+1 non-reconcile** failure is a post-deploy `BATTERY_ASSESSMENT_RECOMPUTE` (or pipeline sibling) **without** `lv-rest-reconcile:` correlation — likely `reconcile:assess:` from `reconcilePendingAssessments` or primary `lv-rest-handoff:` enqueue.

## Handoff invariant (pre-fix)

Pre-amendment: 30 carriers stuck `ENQUEUED` + non-replayable DLQ + never `EXECUTED`.

Post-amendment: terminal `FAILED` + `PERSISTENCE_FAILED` written by processor on final non-retryable assess failure; reconciliation SQL excludes `FAILED` carriers.

## Error classifier scope

- **54000 / index row size:** non-retryable `HANDLER_FAILED` (assess persistence)
- **Unique constraint:** remains **retryable** at classifier level; P2002 handled in repository / idempotent skip paths (PKG-02 safe)
