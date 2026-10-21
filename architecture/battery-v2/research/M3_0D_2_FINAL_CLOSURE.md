# M3.0D.2 — PR #1519 final pre-merge closure

**Branch:** `cursor/battery-v2-m3-0d-reconcile-liveness-90ec`  
**PR:** #1519 (amend only — no new PR)  
**Status:** CODE COMPLETE — not deployed

## Runtime invariants (post M3.0D.2)

### 1. Legacy 54000 DLQ recovery (narrow authority)

| Step | Component | Behavior |
|------|-----------|----------|
| Candidate | `fetchRestAssessmentHandoffReconcileCandidates` | ENQUEUED (or FAILED+`rearmReason`) carriers enter repair queue |
| Reconciliation | `clearLegacyAssessPersistence54000DeadLetterIfPresent` | Clears DLQ **only** when `jobType=BATTERY_ASSESSMENT_RECOMPUTE`, `errorCode=HANDLER_FAILED`, message proves SQLSTATE 54000 / index row size / program_limit_exceeded |
| Handoff | `reconcileAssessmentHandoff` → `ensureAssessmentHandoff` | After DLQ clear, enqueue no longer suppressed by `dead_letter` |
| Producer | `BatteryV2JobProducerService.enqueue` | Same measurement job idempotency key; assess dispatch reservation acquired |
| Processor | `BatteryAssessmentRecomputeHandler` | Persistence uses **digest** idempotency key (`fp{sha256}`) — bounded btree tuple |
| Terminal success | `acknowledgeExecuted` | Handoff → `EXECUTED` |

**Does not replay:** arbitrary `HANDLER_FAILED`, non-54000 persistence failures, non-assess job types.

### 2. FAILED explicit rearm

| State | Transition | Authority |
|-------|------------|-----------|
| `FAILED` + `PERSISTENCE_FAILED` | Blocked in `ensureAssessmentHandoff` (`terminal_failed`) | Prevents infinite automatic retry |
| `FAILED` + DLQ cleared | `tryRearmFailedHandoffIfEligible` → `rearmFailedAssessmentHandoff` | Sets `ENQUEUED` + `rearmReason=LEGACY_PERSISTENCE_54000` (auditable) |
| Metadata merge | `mergeAssessmentHandoffState` | Explicit rearm allows `FAILED → ENQUEUED` (monotonic guard bypass when `rearmReason` set) |
| Reconciliation SQL | `fetchRestAssessmentHandoffReconcileCandidates` | `FAILED` excluded unless `rearmReason` non-empty |

Failure history preserved in `failureHistory`; no scientific row rewrite.

### 3. Fleet-scale same-vehicle assess serialization

**Replaced:** bounded BullMQ `getJobs` scan (~250/state)  
**With:** Redis O(1) vehicle reservation `battery:v2:assess-dispatch:{vehicleId}`

| Lifecycle | Reservation |
|-----------|-------------|
| Enqueue assess | `tryReserve` (NX) |
| Active / retry | `refresh` (processor) |
| Success / terminal non-retryable failure | `release` (processor finally) |
| Enqueue failure after reserve | `release` (producer catch) |
| Cross-replica | Shared Redis key — second replica gets conflict |

Invariant: if vehicle V has reservation for key K1, enqueue of assess K2≠K1 is suppressed (`vehicle_assess_job_live` / `duplicate`).

### 4. Legacy idempotency key compatibility

`BatteryAssessmentRepository.findExistingLvEstimatedHealthByCanonicalIdentity`:

1. Lookup digest key (`vehicleId` + new `fp{sha256}` key)
2. Lookup legacy raw-fingerprint key
3. Lookup `inputSummary.evidenceFingerprint` JSON equality

`persistLvEstimatedHealth` returns existing row — no duplicate canonical assessment when legacy row exists.

## Fairness / convergence (5-minute default interval)

`BATTERY_V2_RECONCILIATION_INTERVAL_MS` default = **300_000 ms (5 min)**.

Per-vehicle repair serialization enforces **at most one assess enqueue per vehicle per reconciliation pass**, and cross-pass blocking while dispatch reservation is held.

**Worst-case time to drain N historical handoffs on the same vehicle** (assuming each job completes before next tick):

| N handoffs | Worst-case wall time (5 min interval) |
|------------|---------------------------------------|
| 10 | ~45 min (9 gaps × 5 min after first enqueue) |
| 25 | ~120 min |
| 50 | ~245 min |
| 100 | ~495 min (~8.25 h) |
| 500 | ~2495 min (~41.6 h) |

Formula: \((N - 1) \times \text{interval}\) when each pass repairs exactly one carrier and the prior job finishes before the next scheduler tick.

**Tradeoff:** Serialization prevents same-vehicle fan-out (lock contention / duplicate assess). **Not implemented in M3.0D.2:** event-driven same-vehicle drain on job completion (would reduce gaps without reintroducing fan-out).

## Real PostgreSQL persistence proof

Gated test: `battery-assessment.persistence.integration.spec.ts`  
Env: `BATTERY_V2_ASSESSMENT_PERSISTENCE_INTEGRATION=1` + isolated disposable `DATABASE_URL`

Proved on **PostgreSQL 16.15** (Ubuntu) with `prisma db push` isolated DB — legacy raw key > 2500 bytes would exceed btree tuple limit; digest key persists; full `evidenceFingerprint`, `selectedMeasurementIds`, `rejectedMeasurementIds` preserved; idempotent second persist returns same row.

## Production forensics

SSH to `srv1374778.hstgr.cloud`: **Permission denied (publickey)** — carrier #46 and non-reconcile +1 identities **not** re-resolved in this run.

## Validation summary

| Suite | Result |
|-------|--------|
| M3.0D.2 closure + reservation + DLQ policy | PASS |
| PKG-01 reconciliation / fairness / liveness | PASS |
| PKG-02 publication handoff regressions | PASS (postgres-gated skipped without env) |
| Real PostgreSQL persistence integration | PASS (when gated + isolated DB) |
| `npm run build` (tsc) | PASS |
| Graph validator | PASS |

**Flags:** `PUBLICATION_CHANGED=NO`, `REST_SHADOW_CHANGED=NO`, `PRODUCTION_DEPLOYED=NO`
