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

---

## 8. F5-PR1.1 Micro-Closure (2026-09-14)

**Epistemic note:** F5-PR1.1 closes pre-merge review gaps on top of F5-PR1. It does **not** start F5-PR2 or change production flags.

### 8.1 Bounded authoritative sibling query (P1-A)

- `MAX_AUTHORITATIVE_NATIVE_SIBLINGS = 32`
- Sentinel query `take: 33` (`AUTHORITATIVE_NATIVE_SIBLING_SENTINEL_TAKE`)
- If loaded count > 32 → **fail closed** with detail `native_sibling_limit_exceeded`
- Metric: `synqdrive_rfrf_convergence_native_sibling_overflow_total`
- Non-authoritative `SYNQDRIVE_RAW_FUEL_FALLBACK` rows excluded from authoritative count (query filter unchanged)

### 8.2 True automatic runtime E2E (P1-B)

Real PG proof via **`detectEnergyEvents()` only** (no direct `RawRefuelConvergenceService` call):

1. First scan persists candidate (convergence off)
2. Seed native SAME (or SAME+INSUFFICIENT for fail-closed case)
3. Second scan with convergence `true` → automatic F4→F5 → `CONVERGED_NATIVE` or fail-closed

Removed prior misleading test that manually invoked convergence after detect.

### 8.3 Strict F5 authority flag (P1-C)

Dedicated `parseRfrfNativeFallbackConvergenceAuthorized()` — only canonical `true` (case/whitespace tolerant). Rejects `1`, `yes`, `on`, `enabled`, malformed values. General permissive RFRF parser unchanged for master/persist flags.

### 8.4 Metrics single ownership (P1-C)

- `RawRefuelConvergenceService` owns `recordConvergenceSkippedNotAuthorized()`
- Runtime increments scan aggregate `convergenceSkippedNotAuthorized` only — no duplicate domain metric

### 8.5 F5-PR1.1 evidence

- **EED-EV-0054** — this micro-closure
- Real PG gate: **19/19** tests (was 15/15 before P1-A/B additions)
- `PRISMA_SCHEMA_CHANGED = NO`

---

## 9. F5-PR1.2 — Final Main Sync / #1642 DI Survival (2026-09-14)

**Epistemic note:** F5-PR1.2 merges current `origin/main` into PR #1643, preserving #1642 Nest DI boot fix while keeping all F5-PR1/F5-PR1.1 semantics. No F5-PR2, no production flags, no deploy.

| Field | Value |
|-------|-------|
| **PRE_SYNC_PR_HEAD** | `f2c4d438fb28a21daa180ddca1e29a26da0506e3` |
| **SYNCED_MAIN_SHA** | `d7a9f7a21ab4249b40633f28dfa7d6aae62772aa` |
| **POST_SYNC_HEAD** | `3b2db11561cda45dad249f94fe27d478f5a7f0ff` |
| **PR #1643 base (F5.0)** | `014b8c6d2866a08948e2b8583b83ec8b9d07be9d` |

### 9.1 Main delta review

Commits on `main` since PR base `014b8c6d`:

| SHA | PR | Classification |
|-----|-----|----------------|
| `d1501d171` | #1642 | **MATERIAL_CONFLICT** — same `raw-fuel-refuel-fallback-runtime.service.ts`; resolved by preserving #1642 DI-safe `configLoader` property + F5 convergence ctor wiring |
| `d7a9f7a21` | #1640 | **NO_MATERIAL_RFRF_IMPACT** — VDC P2.3 evidence writers only |

No architectural incompatibility beyond #1642.

### 9.2 Conflict resolution strategy

**Critical file:** `raw-fuel-refuel-fallback-runtime.service.ts`

- **Preserved #1642:** `configLoader` as ordinary private class property (NOT Nest constructor dependency); `withConfigLoader()` assigns `service.configLoader = loader` without expanding injectable surface
- **Preserved F5-PR1/1.1:** `@Optional() convergenceService`, `runConvergenceEvaluationIfPrepared()`, env propagation, convergence scan aggregates
- **Final constructor shape:** `(dimoSegments, rawRefuelCandidateService, promotionPreparation?, convergenceService?, metrics?)` — no function-typed loader
- **Spec alignment:** all manual test construction uses `.withConfigLoader()` pattern from #1642

### 9.3 Nest DI boot proof

- Regression: `raw-fuel-refuel-fallback-runtime.di.spec.ts` (#1642)
- `RawRefuelConvergenceService` registered in `VehicleIntelligenceModule` providers
- `CONFIG_LOADER_ON_NEST_CONSTRUCTOR_SURFACE = NO`

### 9.4 F5-PR1.1 semantics survival

P1-A overflow, P1-B automatic `detectEnergyEvents()` E2E, P1-C strict authority + single SKIPPED_NOT_AUTHORIZED metric owner — re-run on post-sync HEAD; no design reopen.

### 9.5 Evidence

- **EED-EV-0055** — #1642 Nest DI boot fix (renumbered from main registry collision with EED-EV-0053 F5-PR1)
- F5-PR1.2 sync proof appended here; CI on new exact HEAD required (not reusable from `f2c4d438`)
- `PRODUCTION_MUTATED = NO`
