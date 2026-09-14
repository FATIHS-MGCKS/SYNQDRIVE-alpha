# RFRF F5-PR1 — Authoritative Pre-Promotion Convergence

**Workstream:** Raw Fuel Refuel Fallback (RFRF)
**Phase:** F5-PR1 — Authoritative convergence + CONVERGED_NATIVE (NOT F5-PR2)
**Date:** 2026-09-14
**F5_PR1_BASE_MAIN_SHA:** `014b8c6d2866a08948e2b8583b83ec8b9d07be9d` (PR #1641 / F5.0 merge)
**Branch:** `cursor/eed-rfrf-f5-pr1-authoritative-convergence-f21f`

**Epistemic note:** F5-PR1 primitives labeled **IMPLEMENTED / PROVEN_BY_INTEGRATION_TEST** only where covered by unit + real PostgreSQL proofs in this PR. Not **PROVEN_IN_PRODUCTION**. F5-PR2 promotion / fallback VEE insert remains unreachable.

---

## Executive verdict

```
RFRF_F5_PR1 = PASS (pending CI on final HEAD)
F5_PR1_FALLBACK_VEE_CREATION_REACHABLE = NO
F5_PR1_PROMOTED_TRANSITION_REACHABLE = NO
F5_PR2_STARTED = NO
```

---

## 1. Scope implemented (F5-PR1 only)

| Primitive | Status |
|-----------|--------|
| `CONVERGED_NATIVE` lifecycle enum + migration | IMPLEMENTED |
| `evaluateRawRefuelNativeFallbackConvergence()` (G2 matcher) | IMPLEMENTED |
| `RawRefuelConvergenceService.evaluateAndApplyConvergence()` | IMPLEMENTED |
| `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` fail-closed reader | IMPLEMENTED |
| Runtime wiring after F4 preparation | IMPLEMENTED |
| Fallback VEE creation | **NOT REACHABLE** |
| PROMOTED transition | **NOT REACHABLE** |
| G2/BullMQ post-commit handoff | **NOT WIRED** |
| F5-PR2 DISTINCT promotion | **NOT STARTED** |

---

## 2. Authoritative convergence semantics

Reuses **`classifyPhysicalRefuelSibling()`** (G2) — no duplicated thresholds.

| Classification | F5-PR1 behavior |
|----------------|-----------------|
| `NO_NATIVE_SIBLINGS` | No convergence; candidate remains promotable for PR2 |
| `SAME_NATIVE` (exactly one) | Atomic transition → `CONVERGED_NATIVE`; zero fallback VEE |
| `DISTINCT_FROM_NATIVE` | No convergence |
| `INSUFFICIENT_EVIDENCE` | Fail closed |
| `AMBIGUOUS` | Fail closed (multiple SAME; SAME+DISTINCT) |

**Stricter than F4 advisory:** SAME + DISTINCT → `AMBIGUOUS` (F4 advisory could report clean SAME).

Native source filter: `detectionSource IS NULL` (legacy) OR `DIMO_NATIVE`. Excludes `SYNQDRIVE_RAW_FUEL_FALLBACK`.

---

## 3. Config authority separation

| Flag / helper | F5-PR1 |
|---------------|--------|
| `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` | Authorizes convergence evaluation only (default false) |
| `canCreateFallbackVehicleEnergyEvent()` | Hard-coded `false` |
| `canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion()` | Hard-coded `false` |

---

## 4. Real PostgreSQL matrix (F5-PR1 gate)

Gate: `backend/scripts/test/rfrf-f5-pr1-authoritative-convergence-gate.sh`

| Case | Expected |
|------|----------|
| T4 Native SAME | `CONVERGED_NATIVE`, zero fallback VEE |
| T6 Native INSUFFICIENT | Fail closed, not converged |
| T8 SAME + INSUFFICIENT | Fail closed |
| T9 SAME + DISTINCT | Fail closed (AMBIGUOUS) |
| T10 Multiple SAME | Fail closed |
| No native | `READY_FOR_PERSIST` preserved |
| All DISTINCT | No convergence |
| Replay | Idempotent `CONVERGED_NATIVE` |
| Concurrent | Single terminal result |
| Foreign vehicle | Ignored |
| Legacy NULL native | Recognized |
| DIMO_NATIVE | Recognized |
| Flag false / malformed | No mutation |

---

## 5. Hard negative proofs

```
FALLBACK_VEE_CREATED = 0
PROMOTED_TRANSITION_COUNT = 0
G2_FALLBACK_HANDOFF_COUNT = 0
BULLMQ_FALLBACK_ENQUEUE_COUNT = 0
NATIVE_PATH_BEHAVIOR_CHANGED = NO
F4_ADVISORY_BECAME_AUTHORITY = NO
CONVERGENCE_FLAG_CAN_AUTHORIZE_VEE_INSERT = NO
PRODUCTION_MUTATED = NO
HISTORICAL_BACKFILL = NO
```

---

## 6. Evidence

- **EED-EV-0053** — this audit
- Implements **EED-DEC-RFRF-009** convergence matrix subset (pre-promotion only)
- Preserves **EED-DEC-RFRF-008/010** policy from F5.0 (no rewrite)

---

## 7. Files touched (implementation)

- `backend/prisma/schema.prisma` + migration `20260914120000_rfrf_f5_pr1_converged_native_lifecycle`
- `raw-refuel-native-fallback-convergence.{evaluator,types}.ts`
- `raw-refuel-convergence.service.ts`
- `raw-fuel-refuel-fallback.config.ts` (convergence reader)
- `raw-fuel-refuel-fallback-runtime.service.ts` (F5 wiring)
- `raw-refuel-candidate-lifecycle.ts` + constants
- Tests: evaluator unit + `raw-fuel-refuel-fallback-f5-pr1-convergence.postgres.integration.spec.ts`
