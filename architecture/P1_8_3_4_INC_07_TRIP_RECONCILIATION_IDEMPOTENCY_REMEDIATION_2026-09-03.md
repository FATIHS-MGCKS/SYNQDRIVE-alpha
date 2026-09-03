# P1.8.3.4 — INC-07 Trip Reconciliation Idempotency Remediation

**DATE:** 2026-09-03  
**WORKSTREAM:** Scaling Process / Vehicle Intelligence  
**INCIDENT:** INC-07 — `INTRA_TRIP_GAP_SPLIT` duplicate repaired-trip rows  
**FORENSIC INPUT:** `architecture/P1_8_3_3_N2_24H_PLUS_SEGMENTED_RETROSPECTIVE_AUDIT_2026-09-03.md`

---

## Executive summary

P1.8.3.3 proved warm-tier reconciliation re-applied the same semantic `INTRA_TRIP_GAP_SPLIT` repair ~4h apart, creating duplicate `REPAIRED` trips with identical `(vehicle_id, start_time)` and the same `splitFrom` parent. Root cause: `trip_repairs` rows used random UUIDs (unlike `MISSING_TRIP`), and no durable claim existed before `splitTripAtGap`.

This remediation adds **deterministic repair identity** + **claim-before-mutate** using the existing `trip_repairs` primary key pattern. Redis reconciliation mutex is retained but is **not** the idempotency authority.

**INC-07 remains OPEN** until production validation. Historical duplicate rows are **not** mutated.

---

## Forensic input (INC-07)

| Field | Value |
|-------|-------|
| Duplicate groups | 2 |
| Cadence | ~4h (warm-tier scheduler) |
| Root cause | `RECONCILIATION_REAPPLICATION_IDEMPOTENCY_DEFECT` |
| Multi-replica race | **NO_PROVEN** |
| Pre-N2 duplicate groups | 0 / 1947 trips |

---

## Old failure path

```
warmRepair (4h)
  → reconcileWindow (Redis mutex per vehicle)
    → repairIntraTripGapSplits
      → findWaypointGapForSplit
      → tripRepair.create (random UUID)   ← no dedup
      → splitTripAtGap (new trip UUID)
      → finalizeRepairedTrip
      → tripRepair.update APPLIED
      → enqueueRepairEnrichment × 2
```

**CURRENT_IDEMPOTENCY_BOUNDARY:** none for `INTRA_TRIP_GAP_SPLIT` (pre-fix).

---

## Canonical repair identity

```
INTRA_TRIP_GAP_SPLIT_CANONICAL_IDENTITY =
  SHA256(vehicleId | INTRA_TRIP_GAP_SPLIT | firstEndAt ISO | secondStartAt ISO)
  → UUID-shaped trip_repairs.id (same algorithm as buildRepairAuditId)
```

**Justification:**

| Component | Why included |
|-----------|--------------|
| `vehicleId` | Tenant-scoped vehicle scope |
| `repairType` | Distinguishes from `MISSING_TRIP` windows with same timestamps |
| `firstEndAt` / `secondStartAt` | Absolute gap boundaries — stable across scheduler reruns |
| **Excluded:** mutable `tripId`, `created_at`, replica ID, BullMQ attempt, deploy SHA | Would break idempotency across reruns |

**LEGACY_REPAIR_COMPATIBILITY_STRATEGY:** `findFirst` on `(vehicleId, repairType, APPLIED, windowFrom, windowTo)` before claim — honors pre-fix random-UUID rows without migration.

---

## New architecture

### Single atomic PostgreSQL transaction

`applyIntraTripGapSplitRepairAtomically` runs **one** `prisma.$transaction` containing:

1. `pg_advisory_xact_lock64(repairId)` — 64-bit two-int key from SHA256 (not session-scoped)
2. Legacy `APPLIED` lookup (pre-fix random UUID rows)
3. Deterministic `trip_repairs` lookup / `PROPOSED` upsert
4. `splitTripAtGap(..., tx)` — all trip writes on same `TransactionClient`
5. `finalizeRepairedTrip(..., tx)`
6. `trip_repairs` → `APPLIED`

**After commit only:** metrics, logs, Route/ATE enrichment enqueue.

**CURRENT_SESSION_LOCK_MODEL_SAFE:** NO (removed). Session `pg_advisory_lock` / `pg_advisory_unlock` across separate Prisma pool connections is unsafe and has been removed.

### Transaction / crash recovery

| Case | Recovery |
|------|----------|
| Crash before transaction | No rows; retry allowed |
| Crash after xact lock, before writes | Transaction rollback; lock released automatically |
| Crash after `PROPOSED`, before split | Full rollback; no `PROPOSED` persists |
| Crash mid-split | All split writes roll back; no partial child trip |
| Crash after split, before `APPLIED` | **Full rollback** — split + repair state commit atomically or not at all |
| Successful commit | Split + `APPLIED` durable; replay → `IDEMPOTENT_SKIP` |
| Commit then crash before enqueue | `APPLIED` blocks re-mutation; trips remain `behaviorSummaryStatus=PENDING` / `drivingImpactStatus=PENDING` for existing enrichment/ATE producers |

**POST_COMMIT_ENQUEUE_LOSS_RECOVERY:** Existing enrichment orchestrator + `postFinalizeAnalysisProducer` can re-enqueue on later reconciliation or scheduled enrichment passes when trips remain `PENDING`. No duplicate trip mutation is introduced to compensate.

**ADVISORY_KEY_WIDTH:** 64-bit (two signed int4 halves of SHA256 seed)  
**COLLISION_RISK_ASSESSMENT:** Negligible for repair-id cardinality; materially stronger than 32-bit `hashtext` alone

**DOMAIN_IDENTITY_DECISION:** Gap boundaries alone (not mutable parent trip id). Same vehicle + same absolute gap window = same semantic repair.

**BROAD_CREATE_ERROR_SWALLOW:** NO

**TRIP_REPAIR_APPLIED_TERMINAL:** YES — `recordIntraTripGapSplitFailureSafely` never downgrades durable `APPLIED`

---

## POST-COMMIT FAILURE DOMAIN

The PostgreSQL transaction is the **authoritative** repair mutation boundary.

Once `applyIntraTripGapSplitRepairAtomically` returns `APPLY_COMMITTED`:

- `TripRepair` status remains `APPLIED` (terminal)
- Trip split rows remain authoritative
- Post-commit failures (enrichment enqueue, recursion read, logging) are isolated in separate `try/catch` blocks
- Mutation-error handler uses `recordIntraTripGapSplitFailureSafely` which re-reads durable state before any `REJECTED` write

**Commit ambiguity:** If the atomic helper throws but durable DB state is already `APPLIED`, the failure recorder returns `COMMIT_STATE_ALREADY_APPLIED` and does not write `REJECTED`.

**Downstream recovery** is independent from trip-mutation idempotency: trips with `behaviorSummaryStatus=PENDING` may be picked up by existing enrichment/ATE producers.

**PRISMA_TX_TIMEOUT_RISK:** LOW — single interactive transaction with bounded writes; no custom timeout extension required.

**GLOBAL_VEHICLE_START_UNIQUE_ADDED:** NO

**HISTORICAL_DUPLICATE_ROWS_MUTATED:** NO

---

## Implementation files

| File | Change |
|------|--------|
| `intra-trip-gap-split-repair-id.util.ts` | Canonical identity helper |
| `trip-reconciliation.service.ts` | `applyIntraTripGapSplitRepairAtomically` — single tx claim+split+APPLIED |
| `trip-decision.engine.ts` | `splitTripAtGap` / `finalizeRepairedTrip` accept optional `tx` |
| `pg-advisory-lock.util.ts` | `acquirePgAdvisoryXactLock64` (64-bit xact lock) |
| `trip-reconciliation.intra-trip-gap-split-idempotency.spec.ts` | Unit INC-07 regression matrix |
| `intra-trip-gap-split-repair.postgres.integration.spec.ts` | Real PostgreSQL concurrency + rollback tests |

---

## Regression test matrix

| Test | Result |
|------|--------|
| INC07 repro (second warm replay) | PASS — 1 split only |
| SERIAL_REPLAY | PASS |
| FOUR_HOUR_REPLAY | PASS |
| CONCURRENT_TWIN (unit) | PASS |
| POSTGRES_CONCURRENT_TWIN | PASS when `INTRA_TRIP_GAP_SPLIT_POSTGRES_INTEGRATION=1` + DATABASE_URL |
| CRASH_AFTER_PROPOSED / MID_SPLIT / BEFORE_APPLIED | PASS (unit + postgres integration) |
| TRANSACTION_ROLLBACK_RETRY | PASS |
| LEGACY_APPLIED compatibility | PASS |
| REJECTED recovery | PASS |
| DISTINCT_GAP identity | PASS |
| POST_COMMIT_ENQUEUE_FAILURE | PASS |
| APPLIED_TERMINAL_STATE | PASS |
| POSTGRES_CONCURRENT_TWIN (CI) | PASS in vehicle-detail postgres job |

---

## Production validation plan (NOT EXECUTED)

1. Deploy to both N=2 replicas; verify SHA equality
2. Scheduler leader = 1; nginx dual upstream healthy
3. Known duplicate groups remain historical only (no deletion)
4. Monitor `synqdrive_trip_reconciliation_repair_idempotent_skip_total`
5. Observe ≥2 natural warm-tier cycles without new equivalent duplicate groups
6. No Route/ATE duplicate downstream effects

**INC-07 closes only after production evidence.**

---

## Machine-readable block

```
P1_8_3_4_INC_07_REMEDIATION = IMPLEMENTED_PENDING_PRODUCTION_VALIDATION

INC_07_STATUS = FIX_IMPLEMENTED_PENDING_PRODUCTION_VALIDATION
INC_07_FIX_IMPLEMENTED = YES
INC_07_LOCAL_VALIDATION = PASS
INC_07_CRASH_SAFETY_LOCAL = PASS
INC_07_APPLIED_TERMINALITY_LOCAL = PASS
INC_07_PRODUCTION_VALIDATED = NO

TRIP_REPAIR_APPLIED_TERMINAL = YES
POST_COMMIT_FAILURE_MUTATES_REPAIR_STATUS = NO
COMMIT_AMBIGUITY_SAFE = YES

SESSION_ADVISORY_LOCK_REMOVED = YES
ALL_REPAIR_DB_WRITES_USE_ONE_TX = YES
TRIP_SPLIT_USES_TRANSACTION_CLIENT = YES
FINALIZE_USES_TRANSACTION_CLIENT = YES
TRIP_REPAIR_APPLIED_IN_SAME_TX = YES

CANONICAL_REPAIR_IDENTITY = vehicleId|INTRA_TRIP_GAP_SPLIT|firstEndAt|secondStartAt
BUILD_REPAIR_AUDIT_ID_REUSED = YES
DB_LEVEL_IDEMPOTENCY_AUTHORITY = trip_repairs deterministic PK
REDIS_MUTEX_RETAINED = YES
CLAIM_BEFORE_MUTATE = YES

HISTORICAL_DUPLICATE_ROWS_MUTATED = NO
PRODUCTION_MUTATION_EXECUTED = NO

N2_PRODUCTION_CERTIFICATION = EARLY
OQ_28_STATUS = PARTIAL

NEXT_STAGE = INC_07_PRODUCTION_VALIDATION_THEN_UNINTERRUPTED_24H_N2_SOAK
```
