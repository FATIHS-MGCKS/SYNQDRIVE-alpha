# EED RFRF F4-PR2 — Dark raw-fuel runtime wiring

**Date:** 2026-09-13
**Phase:** F4-PR2 only (dark runtime wiring; no promotion; no production enablement)
**Base main:** `4ab15335ac93e88f8f3823f23fd4e6ac049b189e` (PR #1633 / F4.1 merge)
**Branch:** `cursor/eed-rfrf-f4-pr2-dark-runtime-wiring-f21f`

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| Parallel raw branch wired into `detectEnergyEvents()` | YES |
| F4-PR1 flag reader (master / persist fail-closed) | YES |
| `RawFuelCapabilityResolver` gate | YES |
| Raw fuel sample fetch via `DimoSegmentsService.fetchFuelLevelSamples` | YES |
| F4.1 detection admissibility preserved | YES |
| F3 `detectRawFuelRises()` invocation | YES |
| F3→F2 observation mapping + `RawRefuelCandidateService` persistence | YES |
| Dark Prometheus metrics (`synqdrive_rfrf_*`) | YES |
| Native path behavioral isolation | YES |
| Real PostgreSQL integration proofs | YES |

---

## 2. Explicit non-actions (verified)

| Gate | Result |
|------|--------|
| Fallback `VehicleEnergyEvent` create/upsert | **NO** |
| `PROMOTED` lifecycle transition from PR2 | **NO** |
| F5 convergence / promotion execution | **NO** |
| Production deploy / mutation | **NO** |
| Feature flags enabled in repo defaults | **NO** |
| Historical backfill | **NO** |
| Window-level native suppression | **FORBIDDEN / not implemented** |
| F4-PR3 promotion evaluator | **NOT started** |

---

## 3. Runtime call graph

### Native path (unchanged)

```
detectEnergyEvents()
  → vehicle + tokenId load
  → fetchEnergyEventSegments()
  → coalesce + upsertSegment() [native VEE only]
  → pruneStaleSubSegments / sibling reconcile
  → record native metrics
```

### Raw dark branch (parallel, after native success metrics)

```
detectEnergyEvents()
  → runRawFuelFallbackBranch() [outer try/catch isolation]
    → RawFuelRefuelFallbackRuntimeService.scanIfEnabled()
      → loadRawFuelRefuelFallbackConfig()
      → fail-closed: persist without master
      → resolveRawFuelCapability()
      → fetchFuelLevelSamples(window)
      → resolveRawFuelSignalTrust() [F4.1 admissibility]
      → detectRawFuelRises()
      → per observation: RawRefuelCandidateService.resolveOrCreateCandidate()
         [only when persist flag ON and lifecycle not REJECTED]
```

Native completion is **not** gated on raw success. Raw failures return structured `rawFuelFallback` summary without throwing.

---

## 4. Flag truth table

| master | persist | Raw scan | F2 persist | Fallback VEE |
|--------|---------|----------|------------|--------------|
| false | false | NO | NO | NO |
| true | false | YES (detect/metrics) | NO | NO |
| true | true | YES | YES | NO |
| false | true | NO (fail-closed) | NO | NO |

`PERSIST_ENABLED != PROMOTION_AUTHORIZED` — persist never implies VEE permission.

---

## 5. Failure isolation

| Layer | Behavior |
|-------|----------|
| Branch outer (`EnergyEventsService`) | catch → warn + partial result; native already persisted |
| Branch inner (`scanIfEnabled`) | catch → `branchError` outcome |
| Sample fetch | skip reason `sample_fetch_failed`; native unaffected |
| Per-candidate persist | catch → metric + continue other candidates |

**Proven:** NATIVE_SUCCESS + RAW_FAILURE (unit + PG test M); per-candidate persist error isolation (unit).

---

## 6. Real PostgreSQL evidence

**Gate script:** `backend/scripts/test/rfrf-f4-pr2-runtime-postgres-gate.sh`

Isolated localhost DB (`rfrf_f4_pr2_*`), never production.

| Suite | Tests | Skipped |
|-------|-------|---------|
| F4-PR2 runtime PG | 16 | 0 |
| F2 PG regression | 19 | 0 |
| F3→F2 handoff PG | 6 | 0 |
| **Total gate** | **41** | **0** |

Matrix letters covered in F4-PR2 PG suite: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O + F3/F2 tolerance gate.

---

## 7. KS MS 661 runtime regression

Fixture: `KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES` via production-shaped fetch mock.

| Metric | Result |
|--------|--------|
| F3 observations | ≥ 1 |
| F2 physical candidates | 1 |
| Fallback VEE | 0 |
| `absoluteSignalTrust` persisted | UNKNOWN |
| `absoluteDetectionAdmissibility` | ADMISSIBLE |

---

## 8. Zero fallback VEE proof

Call-graph search: no `vehicleEnergyEvent.create/upsert` in `raw-fuel-refuel-fallback/*` runtime path.

`canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion()` remains structurally `false`.

**F4_FALLBACK_VEE_UPSERT_REACHABLE = NO**

---

## 9. Dark observability

Prometheus counters (no high-cardinality vehicle labels):

- `synqdrive_rfrf_scan_total{outcome,capability}`
- `synqdrive_rfrf_observations_total{lifecycle}`
- `synqdrive_rfrf_candidate_persist_total{result}`
- `synqdrive_rfrf_candidate_errors_total`

Structured logs on isolated failures (vehicleId in log line per existing conventions).

---

## 10. Remaining F5 / production blockers

- F5 native↔fallback convergence authorization
- Fallback VEE promotion execution (`SYNQDRIVE_RAW_FUEL_FALLBACK` + `sourceEventKey`)
- F6 production flag rollout / cutover sequencing
- F4-PR3 promotion eligibility evaluator

**F5_CONVERGENCE_PROVEN = NO**

---

## 11. Test regression summary

| Gate | Result |
|------|--------|
| F4-PR2 unit + energy-events isolation | PASS |
| F4.1 contract tests | PASS |
| F3 detector suites (62 unit) | PASS |
| F2 unit regression | PASS |
| Real PG F4-PR2 gate | PASS (41/41, 0 skipped) |
| Backend build | PASS |
| Prisma validate | PASS |
| EED graph validator | PASS |
| Module registry validator | PASS |

---

## 12. Epistemic labels

| Label | Value |
|-------|-------|
| Candidate staging runtime-reachable | IMPLEMENTED_AND_INTEGRATION_PROVEN |
| Production feature | NOT_ENABLED |
| Fallback VEE promotion | NOT_IMPLEMENTED / UNREACHABLE |
| F5 convergence | NOT_PROVEN |
| PROVEN_IN_PRODUCTION | **NOT used** (no production change) |

**RFRF_F4_PR2 = PASS**
