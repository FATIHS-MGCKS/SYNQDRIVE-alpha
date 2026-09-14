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
RFRF_F5_PR2 = PASS
RFRF_F5_PR2_1 = PASS (pre-merge micro-closure)
F5_PR2_FALLBACK_VEE_CREATION_REACHABLE_IN_TEST = YES
F5_PR3_STARTED = NO
G2_FALLBACK_HANDOFF_REACHABLE = NO
BULLMQ_FALLBACK_ENQUEUE_REACHABLE = NO
```

**Verified HEAD (F5-PR2.1):** `5cd9c94dc160bde247607c686957df734033f6a8` — exact-head CI PASS (28 checks).

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
| `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` | Convergence evaluation only — **also required** for promotion execution (F5-PR2.1 conjunction) |
| `RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED` | Promotion execution flag — **also required** for promotion execution (F5-PR2.1 conjunction); alone cannot authorize VEE |
| `evaluateFallbackPromotionAuthority()` | Hard gate: convergence **AND** promotion execution (strict `true` only) |
| `canCreateFallbackVehicleEnergyEvent()` | Promotion execution flag only (F4 preparation boundary; not sufficient for TRANSACTION A) |
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
| P24 convergence OFF + promotion ON fail-closed | PASS |
| P25 direct service cannot bypass convergence | PASS |
| P26 candidate row FOR UPDATE blocks concurrent write | PASS |
| P27 row-lock rollback releases F2 maturation | PASS |
| P28 thrown promotion isolated from native success | PASS |
| P29 promotionAttempted metric single ownership | PASS |
| KS MS 661 SYNTHETIC_FULL_LIFECYCLE | PASS |

**29/29 PG cases executed; 0 skipped.**

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
| F5-PR2 PG (29) | PASS |
| F3→F2 handoff PG (6) | PASS |
| F4-PR2 PG (41) | PASS |
| F4-PR3 PG (50) | PASS |
| Backend build | PASS |
| Module registry validator | PASS |

---

## 9. F5-PR2.1 pre-merge micro-closure (2026-09-14)

Independent gap closure on PR #1647 without F5 redesign.

| Gap | Closure |
|-----|---------|
| A — promotion bypassed convergence authority | `evaluateFallbackPromotionAuthority()` at `RawRefuelPromotionService` + runtime short-circuit; P24/P25 real PG |
| B — TRANSACTION A missing real row lock | `RawRefuelCandidateRepository.findByIdForUpdate()` (`SELECT … FOR UPDATE`); lock order documented; P26/P27 |
| C — double `promotionAttempted` metric | Runtime no longer increments global counter; service owns after trust gate; P29 |
| D — failure isolation only cutover BLOCKED | P28 thrown promotion via `detectEnergyEvents()` with native segment success preserved |
| E — audit CI PENDING | Exact final HEAD CI rebinding on push (see PR #1647) |

**Starting PR HEAD:** `d8ce3eda8d3d8741b5d3d3e037a5a66a47a70c43`  
**Base main:** `84ef68944c403c0b042cd9cec0076296fe085bd0`

```
PROMOTION_ALLOWED = CONVERGENCE_AUTHORIZED AND PROMOTION_EXECUTION_AUTHORIZED AND …
LOCK_ORDER = pg_advisory_xact_lock64(rfrf_promote:{vehicleId}) → candidate FOR UPDATE
OTHER_F5_PR2_METRIC_DOUBLE_COUNTS_FOUND = 0
F5_PR3_START = NO
PRODUCTION_MUTATED = NO
```
