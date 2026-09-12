# RFRF F4 — Scope + Runtime Boundary (Pre-Implementation Audit)

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F4 — Scope + dependency closure **ONLY** (no runtime implementation in this artifact)  
**Date:** 2026-09-13  
**Mode:** ARCHITECTURE AUDIT — no production wiring, deploy, flag enablement, backfill, or VehicleEnergyEvent promotion execution  
**Canonical baseline main:** `4d95c16a9b8181255097f13cc845afd414345c1e` (merged PR #1623 — RFRF F3 complete)  
**Predecessor audits:** F1, F1.1, F2, F3 (`docs/audits/eed-rfrf-f*-2026-09-12.md`)

---

## 0. Executive verdict

```
F4_SCOPE_DEFINED = YES
F4_IMPLEMENTATION_NOT_STARTED = YES
F4_PHASE_BOUNDARY_RECOMMENDATION = B
F4_IMPLEMENTATION_START_READY = YES (after human review of this document)
RUNTIME_CODE_CHANGED = NO
PRODUCTION_MUTATED = NO
FEATURE_FLAGS_ENABLED = NO
```

**Canonical F4:** Dark runtime integration of raw-fuel fallback into existing `detectEnergyEvents()` / Trip Reconciliation Step 5 — through **candidate staging only**, plus **promotion service implementation that remains execution-blocked** until F5 native/fallback convergence gate is present and proven.

**Canonical F5:** Native↔fallback convergence proof matrix, late-native sibling policy, fleet-wide synthetic `dimoSegmentId` safety, and authorization to **execute** promotion into `VehicleEnergyEvent` in production.

This resolves the F1/F2/F3 phase-boundary contradiction without pulling the full F5 matrix into F4 and without allowing unsafe duplicate `VehicleEnergyEvent` rows.

---

## 1. Baseline

| Field | Value |
|-------|-------|
| **CURRENT_MAIN** | `4d95c16a9b8181255097f13cc845afd414345c1e` |
| **F3_MERGE_SHA** | `4d95c16a9b8181255097f13cc845afd414345c1e` |
| **F3_PROVEN_BY_INTEGRATION_TEST** | YES (62 unit + 4/4 isolated PG F3→F2 handoff) |
| **F4_START_AUTHORIZED** | YES (post PR #1623 merge closure) |
| **RAW_RISE_DETECTOR** | COMPLETE (F3 + F3.1 + F3.2) |
| **RAW_CANDIDATE_PERSISTENCE_SUBSTRATE** | COMPLETE (F2 + F2.1 + F2.2) |
| **RUNTIME_DETECTOR_WIRING** | NO |
| **RUNTIME_CANDIDATE_PERSISTENCE** | NO |
| **PROMOTION_RUNTIME** | NO |
| **PRODUCTION_FALLBACK_ENABLED** | NO |

Production `detectEnergyEvents()` remains **DIMO-native only** (`energy-events.service.ts`). RFRF flags exist as constants only (`raw-refuel-candidate.constants.ts`); no runtime reader.

---

## 2. F4 scope contradictions found

### 2.1 Source definitions

| Source | F4 language | F5 language |
|--------|-------------|-------------|
| **F1 §26** | “Fallback candidate persistence path in `detectEnergyEvents` (flag-gated)” | “Native/fallback convergence via G2 matcher + late sibling policy + integration matrix” |
| **F2 §10** | `detectEnergyEvents` wiring, promotion runtime, READY gate evaluation, `vehicle_energy_events` source columns | G2 native↔fallback convergence proof; synthetic `dimoSegmentId` fleet proof |
| **F3 §11** | Production scheduler wiring, `detectEnergyEvents` integration, promotion runtime, feature flag enablement | (not defined — convergence implied post-F4) |

### 2.2 Contradiction

F1 labels F4 narrowly as “persistence path,” while F2/F3 expand F4 to full runtime integration **including promotion**. F5 owns convergence **proof**, but F1 §13/EED-DEC-RFRF-004 requires **per-candidate** native overlap resolution **before** treating a fallback candidate as canonical — creating an ordering hazard if F4 executes promotion without any convergence gate.

### 2.3 Resolved canonical interpretation

| Layer | Owner | Meaning |
|-------|-------|---------|
| **F4** | Runtime wiring (dark) | `detectEnergyEvents` parallel path → capability gate → fuel samples → F3 → F2 persist → READY evaluation → promotion **service code** |
| **F4 execution stop** | Hard gate | **No `VehicleEnergyEvent` upsert from fallback** until F5 convergence authorization constant/test gate passes |
| **F5** | Convergence + promotion execution proof | Full 10-scenario matrix; late native sibling policy; synthetic ID fleet proof; production promotion enablement review |

F1 “persist path” means **persist candidates** (Option D staging), not “skip staging and write VehicleEnergyEvent immediately.”

---

## 3. F4 phase boundary recommendation

```
F4_PHASE_BOUNDARY_RECOMMENDATION = B
```

### Option B (chosen)

**F4 implements** the full dark runtime through candidate staging **and** the promotion service/mapping/schema path, but **actual promotion execution** (`VehicleEnergyEvent` insert/upsert from fallback) remains **hard-disabled/unreachable** until F5 installs and proves the native/fallback convergence gate.

### Why not A (staging-only, zero promotion code in F4)

F2 already ships `raw-refuel-candidate-promotion.design.ts`. Deferring all promotion code to F5 would duplicate F2/F1 contract work and delay integration testing of mapping/schema migration. Option B builds promotion **safely dark** without production writes.

### Why not C (pull F5 into F4)

F5’s integration matrix (10 scenarios, late native, concurrent replicas, crash/retry across both paths) is a distinct proof phase. Merging it into F4 inflates scope, blurs rollback boundaries, and violates the established F1 §26 phase plan without improving safety beyond Option B’s execution block.

### Safety invariants preserved

```
WINDOW_LEVEL_NATIVE_SUPPRESSION = FORBIDDEN
PER_CANDIDATE_NATIVE_FALLBACK_CONVERGENCE = REQUIRED (enforced at promotion execution — F5 proves matrix)
READY_FOR_PERSIST != PROMOTION_SAFE (candidates may remain staged indefinitely)
RFRF failure must NOT break native REFUEL path (best-effort isolation in Step 5 try/catch — already present)
```

---

## 4. Scope item classification (A–P)

| Item | Classification | Notes |
|------|----------------|-------|
| **A. detector invocation** | **F4** | Call `detectRawFuelRises()` from `detectEnergyEvents` when master flag true |
| **B. raw signal acquisition** | **F4** | Window-level `fetchFuelLevelSamples()` (reuse DIMO path); fail-closed on fetch error |
| **C. vehicle capability gate** | **F4** | Case 22; narrow resolver — see §7 |
| **D. F3 detection** | **ALREADY_IMPLEMENTED** | F3 complete; F4 calls only |
| **E. F2 candidate persistence / rediscovery** | **ALREADY_IMPLEMENTED** | F4 wires caller; advisory lock + semantic rediscovery unchanged |
| **F. lifecycle maturation** | **F4** (runtime orchestration) | F3 classifies per observation; F4 service evaluates READY gates + runtime rejection reasons |
| **G. READY_FOR_PERSIST eligibility** | **F4** | Service-layer gate beyond F3 detector classification (F1.1 §7 minimums, DUPLICATE_NATIVE pre-check design) |
| **H. VehicleEnergyEvent promotion implementation** | **F4** | Service + schema migration + mapping; **code only** |
| **I. actual promotion execution** | **F5** | Blocked in F4; requires convergence gate |
| **J. native/fallback convergence** | **F5** (proof) | Minimal pre-promotion G2 check **designed in F4**, **proven in F5** |
| **K. G2 handoff post-promotion** | **F5** (with promotion execution) | Hook exists for native refuels; reuse after F5 enables promotion |
| **L. scheduler integration** | **F4** | Via existing Step 5 — no new scheduler |
| **M. metrics/diagnostics (minimum)** | **F4** | See §14; non-finite counters, capability skips |
| **N. feature flag definition** | **ALREADY_IMPLEMENTED** (constants) | F4 adds runtime readers |
| **O. feature flag runtime enablement** | **F6+** (rollout) | F4 reads flags; defaults remain false; production enablement separate |
| **P. Production rollout** | **F6+** | Not F4 |

---

## 5. F4 included scope (implementation — future PRs)

1. **`RawFuelFallbackRuntimeService`** (or equivalent) orchestrating per-vehicle scan inside reconciliation window.
2. **`detectEnergyEvents()` extension:** after native DIMO fetch, **parallel** raw path when `RAW_FUEL_REFUEL_FALLBACK_ENABLED` (org/vehicle scoped config reader — default false).
3. **Fuel sample fetch** for `[from, to]` via existing `DimoSegmentsService.fetchFuelLevelSamples()`.
4. **`RawFuelCapabilityResolver`** — derives eligibility class; fail-closed on UNKNOWN / NO_RELIABLE_FUEL_SIGNAL.
5. **Context builder** for `RawFuelRiseDetectionContext` (trust, relative availability) from capability + samples.
6. **`detectRawFuelRises()` → `RawRefuelCandidateService.resolveOrCreateCandidate()`** per observation.
7. **Runtime READY gate evaluator** — applies F1.1 minimums, sets rejection reasons; does not promote.
8. **Prisma migration:** additive `VehicleEnergyEvent.detectionSource`, `sourceEventKey`, optional unique `(vehicleId, sourceEventKey)` — deferred from F2.
9. **`RawRefuelCandidatePromotionService`** — maps READY rows via existing design; **does not call upsert** until F5 gate.
10. **Minimum dark metrics** (§14).
11. **Integration + PG tests** behind flags in test env only (§18).

---

## 6. F4 excluded scope

- VehicleEnergyEvent promotion **execution** (F5)
- Native↔fallback integration matrix **proof** (F5)
- Late native sibling recovery policy runtime (F5)
- Production feature flag enablement (F6+ rollout)
- Historical backfill / reprocess / deletion (forbidden)
- F3 detector algorithm changes
- F2 rediscovery semantics changes
- New scheduler / recovery-window expansion (F7)
- Full F8 observability stack
- F5 G2 handoff validation campaign (F6 in F1 plan)
- Provider/DIMO config mutation

---

## 7. detectEnergyEvents integration design

### Current flow (native only)

```
detectEnergyEvents(vehicleId, {from, to})
  → vehicle + tokenId guard
  → fetchEnergyEventSegments(refuel|recharge)
  → coalesce → upsertSegment (by dimoSegmentId)
  → G2 or legacy sibling / enrichment
```

### Proposed F4 parallel path

```
detectEnergyEvents(vehicleId, {from, to})
  ├─ [EXISTING] native DIMO segment path (unchanged)
  └─ [F4, if RAW_FUEL_REFUEL_FALLBACK_ENABLED]
        try {
          capability = resolveCapability(vehicle, window)
          if capability fail-closed → metric + return
          samples = fetchFuelLevelSamples(tokenId, from, to)
          observations = detectRawFuelRises({ samples, context, window })
          for each observation:
            RawRefuelCandidateService.resolveOrCreateCandidate(...)
          evaluateReadyGates(nonTerminal candidates in window)  // no promotion
          if F5_GATE && PERSIST_FLAG:
            // UNREACHABLE IN F4 — stub throws or no-op
        } catch (e) {
          log + metric; DO NOT rethrow — native path already completed
        }
```

### WINDOW_LEVEL_NATIVE_SUPPRESSION = FORBIDDEN

Raw scan runs **regardless of native segment count** in the same window. Example: native Refuel A at 10:00 does **not** suppress raw scan that may detect missed Refuel B at 10:30.

### Integration location

**Inside `EnergyEventsService.detectEnergyEvents()`** after native processing (or interleaved fetch — native first to preserve current ordering). Trip Reconciliation Step 5 already invokes this method — **NEW_RFRF_SCHEDULER_REQUIRED = NO**.

---

## 8. Capability gate (negative case 22)

### CAPABILITY_GATE_AUTHORITY

**No fleet-wide capability authority exists today.** Closest surfaces:

| Source | Use in F4 |
|--------|-----------|
| `Vehicle.fuelType` (Prisma `FuelType` enum) | Exclude `ELECTRIC` (BEV) → `NO_RELIABLE_FUEL_SIGNAL` |
| `Vehicle.powertrainType` / `powertrainProfile` (nullable strings) | Heuristic exclude BEV labels; UNKNOWN → fail closed |
| `DimoSegmentsService.fetchFuelLevelSamples()` window result | Derive ABSOLUTE_ONLY / RELATIVE_ONLY / ABSOLUTE_AND_RELATIVE from sample presence |
| `RawFuelRiseDetectionContext.absoluteSignalTrust` | TRUSTED / UNTRUSTED / UNKNOWN from signal quality rules (not hardcoded IDs) |

**Do not invent** org/vehicle/KS MS 661 hardcodes.

### Eligibility classes

| Class | F4 behavior |
|-------|-------------|
| `ABSOLUTE_AND_RELATIVE` | Full detector |
| `ABSOLUTE_ONLY` | Absolute channel path |
| `RELATIVE_ONLY` | Relative path if relative samples present |
| `NO_RELIABLE_FUEL_SIGNAL` | Skip scan; metric |
| `UNKNOWN` | **Fail closed** — skip scan; metric |

### CAPABILITY_GATE_CASE_22_IMPLEMENTATION_SCOPE

F4 must implement `RawFuelCapabilityResolver.resolve(vehicle, samples, window)` returning class + trust fields for F3 context. Reject with `VEHICLE_CAPABILITY_UNSUPPORTED` / `NON_FUEL_POWERTRAIN` lifecycle reasons when applicable. Unit tests for EV, hybrid-with-fuel, unknown metadata, empty samples.

---

## 9. Candidate lifecycle ownership

| Transition / decision | Owner | Phase |
|----------------------|-------|-------|
| INSUFFICIENT / OBSERVED / SETTLING from detector | F3 `classifyLifecycle()` | Implemented |
| Persist observation → row | F2 `resolveOrCreateCandidate()` | Implemented |
| Semantic rediscovery | F2 matcher | Implemented |
| READY_FOR_PERSIST assignment | F3 proposes; **F4 runtime gate confirms** (F1.1 minimums, conflicts) | F4 |
| REJECTED (runtime reasons) | F4 gate evaluator | F4 |
| PROMOTED | F5 promotion executor (after convergence) | F5 |
| `candidateIdentityKey` assignment | F2 on first READY-capable evidence | Implemented |
| `evidenceRevisionFingerprint` mutation | F2 merge on rediscovery | Implemented |
| Crash after candidate persist | F2 idempotent rediscovery on retry | Implemented |
| Crash after VehicleEnergyEvent insert | F5 concern (promotion idempotency by sourceEventKey) | F5 |

**Invariant:** Rows may sit in `READY_FOR_PERSIST` safely while F5 gate absent. No auto-promotion timer.

---

## 10. Promotion runtime boundary

| Component | F4 | F5 |
|-----------|----|----|
| `mapRawRefuelCandidateToPromotionDraft()` | Wire into service | Execute upsert |
| Synthetic `dimoSegmentIdPlaceholder` | Generate in draft | Use on upsert |
| Pre-promotion native overlap (G2 matcher) | **Implement check** | **Prove matrix** |
| `DUPLICATE_NATIVE_EVIDENCE` rejection | Set on SAME match | Integration tests |
| Lifecycle → PROMOTED | Forbidden in F4 | F5 only |
| G2 `reconcileAndEnqueueAfterPersist` | N/A until promotion | Reuse existing hook |

**F5 execution gate constant (proposed):** `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` — false until F5 audit closes; promotion service checks before upsert.

---

## 11. Native/fallback convergence dependency

F5 is **mandatory** before production promotion enablement because:

1. G2 matcher exists but has never been exercised on `SYNQDRIVE_RAW_FUEL_FALLBACK` rows vs native rows.
2. Late native arrival after fallback candidate READY is unresolved in runtime.
3. Synthetic `dimoSegmentId` fleet compatibility remains **NOT_PROVEN**.
4. Legacy `refuel-sibling-reconciliation.ts` regex ignores `synqdrive-rfrf-*` — safe but means no automatic dedup without explicit F5 policy.

F4 may implement the **mechanism** (load native neighbors, call `classifyPhysicalRefuelSibling`); F5 **proves** it across §17 matrix.

---

## 12. VehicleEnergyEvent schema impact (F4 migration)

Additive columns (deferred from F2):

| Column | Purpose |
|--------|---------|
| `detectionSource` | `DIMO_NATIVE` \| `SYNQDRIVE_RAW_FUEL_FALLBACK` |
| `sourceEventKey` | `candidateIdentityKey` for fallback; nullable for native |
| `@@unique([vehicleId, sourceEventKey])` | Promotion idempotency (partial — native rows null) |

Native rows: `detectionSource = DIMO_NATIVE` (or null + backfill in deploy step — **forward only**, no historical rewrite requirement in F4 scope doc).

`rawDetectionMeta` JSON already exists — populate on fallback promotion (F5 execution).

---

## 13. Synthetic dimoSegmentId status

```
SYNTHETIC_DIMO_SEGMENT_ID_COMPATIBLE = NOT_PROVEN
```

| Consumer | Risk |
|----------|------|
| Upsert by `dimoSegmentId` unique | **Works** if placeholder stable |
| G2 matcher | **Safe** — does not parse ID format |
| Legacy sibling regex | **Inert** for `synqdrive-rfrf-*` |
| Coalesced sub-segment prune | **Safe** — RFRF IDs not in native coalesce sets |
| Ops/recovery scripts assuming `dimo-refuel-*` | **UNKNOWN / NOT_PROVEN** |
| Frontend DTO | Pass-through only |

F1.1 assigns fleet proof to **F5**. F4 may use placeholder in dark tests only.

---

## 14. Scheduler wiring result

```
NEW_RFRF_SCHEDULER_REQUIRED = NO
```

`TripReconciliationScheduler` → `reconcileWindow()` Step 5 → `detectEnergyEvents()` covers fast (15m), warm (4h), cold (daily), manual sync, and on-demand API.

RFRF inherits tier windows. Recovery-window expansion remains **F7**.

---

## 15. Minimum F4 observability

### F4_REQUIRED_DIAGNOSTICS (truthful at F4)

| Metric / counter | Semantics |
|------------------|-----------|
| `rfrf_capability_skip_total` | By reason: NO_RELIABLE_FUEL_SIGNAL, UNKNOWN, NON_FUEL_POWERTRAIN |
| `rfrf_scan_invocation_total` | Flag-gated path entered |
| `rfrf_samples_fetch_failure_total` | Fetch failed; native unaffected |
| `rfrf_detector_observation_total` | Observations emitted |
| `rfrf_candidate_persist_total` | Rows created/updated via F2 |
| `rfrf_candidate_lifecycle_gauge` | By state label (sampled) |
| `rfrf_non_finite_sample_excluded_total` | Per channel (F3 deferred) |
| `rfrf_ready_for_persist_total` | Gate passed; **not promoted in F4** |
| `rfrf_promotion_blocked_f5_gate_total` | Promotion service called but F5 gate blocked |

### F8_FULL_OBSERVABILITY (deferred)

SLO alerts, fleet calibration dashboards, `rawRiseWithoutNativeSegmentTotal` (requires native segment correlation), full G2 convergence metrics, production enablement runbooks.

---

## 16. Failure / crash / retry model

| Boundary | Behavior | Class |
|----------|----------|-------|
| Fuel signal fetch failure | Skip raw path; log + metric; native complete | **BEST_EFFORT** |
| Capability UNKNOWN | Skip raw path | **FAIL_CLOSED** |
| Detector exception | Catch inside raw branch; native unaffected | **BEST_EFFORT** |
| F2 persist failure | Per-candidate error; continue others; metric | **BEST_EFFORT** |
| Native DIMO path failure | Existing behavior (may abort native) | unchanged |
| Promotion in F4 | **Must not run** | **FAIL_CLOSED** (gate) |
| Process crash after candidate persist | Retry via reconciliation rediscovery | **TRANSACTIONAL** (F2 proven) |
| Process crash after VEE insert | F5 idempotency by sourceEventKey | **F5** |
| Concurrent replicas | Per-vehicle advisory lock on F2 (existing) | **TRANSACTIONAL** |

---

## 17. Feature flag model

| Flag | FLAG_EXISTS | FLAG_RUNTIME_READ (F4) | FLAG_DEFAULT | FLAG_PRODUCTION_VALUE | FLAG_ROLLOUT |
|------|-------------|------------------------|--------------|----------------------|--------------|
| `RAW_FUEL_REFUEL_FALLBACK_ENABLED` | YES (constants) | F4 implements | `false` | `false` | F6+ |
| `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` | YES | F4 implements (no-op until F5) | `false` | `false` | F6+ |
| `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` | YES | F4 implements | `null` | `null` | F6+ |

**Sub-flag recommendation:** **YES — keep dual flags.** Rollback requires isolating “scan + stage candidates” from “promote to VehicleEnergyEvent.” Do not add a third flag unless F5 introduces a separate convergence canary.

**F4 scoping task:** MUST NOT enable any flag in production.

---

## 18. Duplicate safety matrix (mandatory)

| # | Scenario | Scanned | Candidate rows | VEE write? | Dedupe authority | Failure mode | Phase |
|---|----------|---------|----------------|------------|------------------|--------------|-------|
| 1 | Native only | Native path | None | Native only | dimoSegmentId | — | Current |
| 2 | Fallback only | Raw path | 1+ staged | **F5** only | sourceEventKey | — | F4 stage / F5 promote |
| 3 | Native + fallback same fill, same pass | Both | Staged READY | **Blocked F5 gate in F4**; F5 SAME→reject | G2 matcher | DUPLICATE_NATIVE | F5 |
| 4 | Fallback first, native later | Both passes | Staged then native VEE | Native VEE; candidate REJECTED or F5 merge policy | F5 late-native policy | INSUFFICIENT until F5 | F5 |
| 5 | Native first, fallback rediscovered | Both | Rediscovery merges candidate | **No duplicate if F5 rejects SAME** | G2 + F2 rediscovery | DUPLICATE_NATIVE | F5 |
| 6 | Native A + missed B same window | Both | 2 candidates | Native A VEE; B staged | Per-candidate | — | F4 proves window invariant |
| 7 | Two distinct refuels close | Both | 2 candidates | F5 promotes both if DISTINCT | G2 DISTINCT | — | F3 proven / F5 promote |
| 8 | Delayed evidence matures candidate | Raw rescan | Same row updated | F5 when READY stable | F2 fingerprint | — | F2 proven |
| 9 | READY but F5 gate absent | Raw | READY row | **NO VEE** | F5 gate | Staged safely | F4 |
| 10 | Concurrent scheduler + manual | Both paths | Lock serializes F2 | Same as above | pg_advisory_xact_lock | — | F2 proven |

---

## 19. Required F4 test matrix (future implementation)

| Category | Tests |
|----------|-------|
| **Unit** | Capability resolver (5 classes); context builder; READY gate; promotion service mapping; F5 gate blocks upsert |
| **PostgreSQL** | detectEnergyEvents integration: candidate rows created; no VEE from fallback; idempotent rescan |
| **Concurrency** | Parallel reconcile same vehicle — one candidate row |
| **Idempotency** | Same window twice — no duplicate candidates |
| **Capability** | Case 22 EV skip; UNKNOWN fail-closed |
| **Native/fallback coexistence** | Window with native segments + raw scan still runs (mock) |
| **Crash/retry** | Simulate mid-persist abort — rediscovery on retry |
| **Regression** | Full F2 + F3 suites unchanged |

Reuse `rfrf-f3-f2-handoff-postgres-gate.sh` pattern for F4 gate script (isolated PG).

---

## 20. F4 implementation PR plan (do not implement in this turn)

| PR | Scope | Depends on |
|----|-------|------------|
| **F4-PR1** | Schema migration (`detectionSource`, `sourceEventKey`); flag config reader; capability resolver + unit tests | — |
| **F4-PR2** | `RawFuelFallbackRuntimeService`; `detectEnergyEvents` parallel path (master flag); sample fetch; F3→F2 wire; dark metrics | PR1 |
| **F4-PR3** | READY gate evaluator; rejection reasons; promotion service (mapping only); F5 execution gate stub; PG integration tests | PR2 |
| **F4-PR4** | Audit closure + KG update marking `F4_IMPLEMENTATION_COMPLETE`; SynqDrive Code entries | PR3 |

**F5-PR1** (separate phase): Convergence gate implementation + integration matrix + promotion execution enablement behind persist flag (still default off).

---

## 21. Open P0 blockers (for F4 implementation start)

| ID | Blocker | Status |
|----|---------|--------|
| — | None identified | **0 P0** |

Scope is defined; substrate complete; integration point confirmed.

---

## 22. Open P1 blockers (for production promotion — not F4 start)

| ID | Blocker | Owner |
|----|---------|-------|
| P1-1 | Synthetic `dimoSegmentId` fleet compatibility NOT_PROVEN | F5 |
| P1-2 | Native↔fallback G2 integration matrix not executed | F5 |
| P1-3 | Late native sibling policy not implemented | F5 |
| P1-4 | `detectionSource` backfill for existing native rows (deploy hygiene) | F4 deploy step / ops — forward-only |
| P1-5 | Detector vs F2 matcher post-plateau tolerance skew (0.5 L vs 1.0 L) | Monitor in F4/F5 tests |

---

## 23. Authority updates (this workstream)

- This document: `docs/audits/eed-rfrf-f4-scope-and-runtime-boundary-2026-09-13.md`
- EED KG: `EED-EV-0045`, `EED-DEC-RFRF-006`, changelog entry, node update
- F3 audit §11 F4 gate statuses remain historical; superseded by this scope audit for F4 planning

---

## 24. Exact next action

**Human review of this scope audit.** Upon approval, begin **F4-PR1** (schema + capability resolver) on a feature branch — still with all flags default false and no production enablement.

```
RUNTIME_CODE_CHANGED = NO
PRODUCTION_MUTATED = NO
PRODUCTION_DEPLOYED = NO
FEATURE_FLAGS_ENABLED = NO
F4_IMPLEMENTED = NO
F5_IMPLEMENTED = NO
F4_START_AUTHORIZED = YES (scope phase complete; implementation authorized after review)
```
