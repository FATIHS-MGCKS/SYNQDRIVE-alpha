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
| Raw fuel sample fetch via `DimoSegmentsService.fetchFuelLevelSamplesWithOutcome` | YES |
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
      → fetchFuelLevelSamplesWithOutcome(window)
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

## 9. Dark observability (F4-PR2.1 minimum contract)

Prometheus counters (no high-cardinality vehicle/VIN/coordinate/sourceEventKey labels):

| Contract item | Metric |
|---------------|--------|
| Branch invocation | `synqdrive_rfrf_branch_invocation_total` |
| Master disabled | `synqdrive_rfrf_master_disabled_total` |
| Persist without master | `synqdrive_rfrf_persist_without_master_total` |
| Capability skip | `synqdrive_rfrf_capability_skip_total{capability}` |
| Sample fetch success | `synqdrive_rfrf_sample_fetch_success_total` |
| Sample fetch failure | `synqdrive_rfrf_sample_fetch_failure_total{error_class}` |
| Detector invocation | `synqdrive_rfrf_detector_invocation_total` |
| Zero observations | `synqdrive_rfrf_zero_observations_total` |
| Observations emitted | `synqdrive_rfrf_observations_total{lifecycle}` |
| Persist attempt | `synqdrive_rfrf_persist_attempt_total` |
| Persist created | `synqdrive_rfrf_persist_created_total` |
| Persist rediscovered | `synqdrive_rfrf_persist_rediscovered_total` |
| Persist skipped (flag off) | `synqdrive_rfrf_persist_skipped_flag_off_total` |
| Per-candidate error | `synqdrive_rfrf_candidate_errors_total` |
| Branch error | `synqdrive_rfrf_branch_error_total` |
| Non-finite exclusion (when F3 surfaces invalid_sample) | `synqdrive_rfrf_non_finite_sample_exclusion_total` |

Structured logs on isolated failures (vehicleId in log line per existing conventions).

---

## 10. F4-PR2.1 — Typed fuel fetch semantics

### Problem closed

Legacy `fetchFuelLevelSamples()` returned `[]` for both provider failures and legitimate empty telemetry, making RFRF `sample_fetch_failed` vs `no_samples` epistemically ambiguous when using the legacy API.

### Solution

`fetchFuelLevelSamplesWithOutcome()` on `DimoSegmentsService`:

| Outcome | Meaning | RFRF skipReason |
|---------|---------|-----------------|
| `{ status: 'SUCCESS', samples: [] }` | Provider query succeeded; zero usable rows | `no_samples` |
| `{ status: 'ERROR', errorClass: 'PROVIDER_QUERY_FAILED' }` | GraphQL/transport failure | `sample_fetch_failed` |
| `{ status: 'ERROR', errorClass: 'AUTH_UNAVAILABLE' }` | No vehicle JWT | `sample_fetch_failed` |

Legacy `fetchFuelLevelSamples()` delegates to the typed API and **preserves** `[]` on ERROR for existing native/refuel-rise callers.

**PROVIDER_ERROR ≠ SUCCESS_EMPTY**

Auth unavailable is classified as **ERROR / AUTH_UNAVAILABLE**, not SUCCESS empty.

### PG gate bootstrap (F4-PR2.1)

| Field | Value |
|-------|-------|
| `TEST_SCHEMA_BOOTSTRAP_MODE` | `RESILIENT_EPHEMERAL_RECOVERY` + explicit `DB_PUSH_TEST_ONLY` drift sync |
| `PG_GATE_SCHEMA_FAILURE_MASKED` | NO — removed `\|\| true` on `prisma db push` |
| `PG_GATE_TEST_DB_ISOLATION` | Dedicated `rfrf_f4_pr2_*` on localhost only |

---

## 11. Remaining F5 / production blockers

- F5 native↔fallback convergence authorization
- Fallback VEE promotion execution (`SYNQDRIVE_RAW_FUEL_FALLBACK` + `sourceEventKey`)
- F6 production flag rollout / cutover sequencing
- F4-PR3 promotion eligibility evaluator

**F5_CONVERGENCE_PROVEN = NO**

---

## 12. Test regression summary

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

## 13. Epistemic labels

| Label | Value |
|-------|-------|
| Candidate staging runtime-reachable | IMPLEMENTED_AND_INTEGRATION_PROVEN |
| Production feature | NOT_ENABLED |
| Fallback VEE promotion | NOT_IMPLEMENTED / UNREACHABLE |
| F5 convergence | NOT_PROVEN |
| PROVEN_IN_PRODUCTION | **NOT used** (no production change) |

**RFRF_F4_PR2 = PASS**
**RFRF_F4_PR2_1_MICRO_CLOSURE = PASS**
