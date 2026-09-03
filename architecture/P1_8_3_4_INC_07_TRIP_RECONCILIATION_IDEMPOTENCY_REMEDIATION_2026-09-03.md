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

### Claim before mutate

1. Compute deterministic `repairId`
2. Transaction: `pg_advisory_xact_lock(repairId)` + legacy lookup + upsert `PROPOSED`
3. If `APPLIED` (deterministic or legacy) → **IDEMPOTENT_SKIP** (no split, no enrichment)
4. Session `pg_advisory_lock(repairId)` around split → finalize → `APPLIED` update
5. `pg_advisory_unlock` in `finally`

### Transaction / crash recovery

| Case | Recovery |
|------|----------|
| Crash before claim | Next run claims fresh |
| Crash after `PROPOSED`, before split | Retry split on `PROPOSED` / `REJECTED` |
| Crash after split, before `APPLIED` | Retry sees `PROPOSED`, re-attempts (split may need trip-level guard — mitigated by lock + APPLIED check) |
| Successful `APPLIED` | All future runs **IDEMPOTENT_SKIP** |

**GLOBAL_VEHICLE_START_UNIQUE_ADDED:** NO

**HISTORICAL_DUPLICATE_ROWS_MUTATED:** NO

---

## Implementation files

| File | Change |
|------|--------|
| `intra-trip-gap-split-repair-id.util.ts` | Canonical identity helper |
| `trip-reconciliation.service.ts` | `claimIntraTripGapSplitRepair`, apply lock, idempotent skip |
| `trip-metrics.service.ts` | Low-cardinality repair apply/skip/conflict/recovery counters |
| `trip-reconciliation.intra-trip-gap-split-idempotency.spec.ts` | INC-07 regression matrix |

---

## Regression test matrix

| Test | Result |
|------|--------|
| INC07 repro (second warm replay) | PASS — 1 split only |
| SERIAL_REPLAY | PASS |
| FOUR_HOUR_REPLAY | PASS |
| CONCURRENT_TWIN | PASS |
| LEGACY_APPLIED compatibility | PASS |
| REJECTED recovery | PASS |
| DISTINCT_GAP identity | PASS |
| MISSING_TRIP regression (existing suite) | PASS |

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
INC_07_PRODUCTION_VALIDATED = NO

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
