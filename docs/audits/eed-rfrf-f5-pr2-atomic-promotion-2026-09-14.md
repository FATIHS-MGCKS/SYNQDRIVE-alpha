# RFRF F5-PR2 — Atomic Fallback Promotion Transaction

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F5-PR2 — Atomic promotion transaction + PROMOTED lifecycle (NOT F5-PR3)  
**Date:** 2026-09-14  
**F5_PR2_BASE_MAIN_SHA:** `84ef68944c403c0b042cd9cec0076296fe085bd0` (PR #1643 / F5-PR1 merge)  
**Branch:** `cursor/eed-rfrf-f5-pr2-atomic-promotion-f21f`

**Epistemic note:** F5-PR2 primitives labeled **IMPLEMENTED / PROVEN_BY_INTEGRATION_TEST** only where covered by unit + real PostgreSQL proofs in this PR. Not **PROVEN_IN_PRODUCTION**. G2 post-commit handoff, BullMQ, enrichment remain unreachable (F5-PR3).

---

## Executive verdict

```
RFRF_F5_PR2 = PASS (pending CI on final HEAD)
F5_PR2_FALLBACK_VEE_CREATION_REACHABLE_IN_TEST = YES
F5_PR3_STARTED = NO
G2_FALLBACK_HANDOFF_REACHABLE = NO
BULLMQ_FALLBACK_ENQUEUE_REACHABLE = NO
```

---

## 1. Scope implemented (F5-PR2 only)

| Primitive | Status |
|-----------|--------|
| `RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED` strict reader | IMPLEMENTED |
| `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` enforcement on physical evidence end | IMPLEMENTED |
| `RawRefuelPromotionService` TRANSACTION A (advisory lock → re-check → VEE + PROMOTED) | IMPLEMENTED |
| Fallback VEE `SYNQDRIVE_RAW_FUEL_FALLBACK` + `sourceEventKey=candidateIdentityKey` | IMPLEMENTED |
| Idempotency + concurrency + rollback proofs | PROVEN_BY_INTEGRATION_TEST |
| Runtime wiring after F5-PR1 convergence | IMPLEMENTED |
| G2 `reconcileAndEnqueueAfterPersist()` | **NOT WIRED** |
| BullMQ fallback enrichment | **NOT WIRED** |
| Late-native post-promotion convergence | **NOT STARTED (F5-PR3)** |

---

## 2. Authority separation

| Flag / helper | F5-PR2 |
|---------------|--------|
| `RAW_FUEL_REFUEL_FALLBACK_ENABLED` | Master scan only |
| `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` | F2 staging only — **cannot** authorize VEE |
| `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` | Convergence evaluation only |
| `RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED` | **Only** flag that can authorize fallback VEE insert (strict `true`, default false) |
| `canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion()` | Hard-coded `false` |

---

## 3. TRANSACTION A contract

```
BEGIN
  pg_advisory_xact_lock64(rfrf_promote:{vehicleId})
  SELECT candidate FOR UPDATE + re-read
  cutover + readiness + promotion trust + authoritative convergence re-check
  SAME native → CONVERGED_NATIVE (no fallback VEE)
  fail-closed → no VEE, no PROMOTED
  DISTINCT / NO_NATIVE_SIBLINGS → create fallback VEE + PROMOTED atomically
COMMIT
```

Invariant: **FALLBACK_VEE_COMMITTED XOR CANDIDATE_PROMOTED is impossible** on this path.

---

## 4. Real PostgreSQL matrix (F5-PR2 gate)

Gate: `backend/scripts/test/rfrf-f5-pr2-atomic-promotion-gate.sh`  
Env: `RAW_FUEL_REFUEL_F5_PR2_INTEGRATION=1`

| Case | Result |
|------|--------|
| P1 fallback-only promotion | PASS |
| P2 replay idempotency | PASS |
| P3 concurrent same candidate | PASS |
| P4 parallel different vehicles | PASS |
| P5 failure before VEE insert | PASS (rollback) |
| P6 failure after VEE insert before lifecycle | PASS (rollback) |
| P7–P11 convergence matrix at promotion | PASS |
| P12 delayed evidence same identity | PASS |
| P13–P16 cutover enforcement | PASS |
| P17 sourceEventKey identity + uniqueness | PASS |
| P18 synthetic dimoSegmentId collision | PASS |
| P19–P20 authority separation | PASS |
| P21 detectEnergyEvents runtime E2E | PASS |
| KS MS 661 SYNTHETIC_FULL_LIFECYCLE | PASS |

**23/23 PG tests executed; 0 skipped.**

---

## 5. Schema / migration

```
PRISMA_SCHEMA_CHANGED = NO
NEW_MIGRATION_REQUIRED = NO
```

F5-PR1 substrate (`detectionSource`, `sourceEventKey`, `CONVERGED_NATIVE`) sufficient.

---

## 6. Hard negative proofs

```
G2_FALLBACK_HANDOFF_COUNT = 0
BULLMQ_FALLBACK_JOB_COUNT = 0
ENRICHMENT_COUNT_FROM_FALLBACK = 0
PRODUCTION_MUTATED = NO
HISTORICAL_BACKFILL = NO
```

---

## 7. F5-PR3 explicit exclusions

F5-PR2 leaves a narrow post-commit seam. F5-PR3 owns:

- post-commit G2 handoff (`physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist`)
- late-native after fallback promotion
- coordinate holds / fallback coordinate policy
- BullMQ dedupe/enqueue proof
- recovery for post-commit G2 failure

---

## 8. Regression matrix (closure run)

| Gate | Result |
|------|--------|
| F5-PR1 PG (19) | PASS |
| F5-PR2 PG (23) | PASS |
| F3→F2 handoff PG (6) | PASS |
| F4-PR2 PG (41) | PASS |
| F4-PR3 PG (50) | PASS |
| Backend build | PASS |
| Module registry validator | PASS |
