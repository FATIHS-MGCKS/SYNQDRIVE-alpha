# RFRF F4 — Scope + Runtime Boundary (Pre-Implementation Audit)

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F4 — Scope + dependency closure + **F4.0 contract hardening** (no runtime implementation)
**Date:** 2026-09-13 (F4.0 hardening appended same date)
**Mode:** ARCHITECTURE AUDIT — no production wiring, deploy, flag enablement, backfill, or VehicleEnergyEvent promotion execution  
**Canonical baseline main:** `4d95c16a9b8181255097f13cc845afd414345c1e` (merged PR #1623 — RFRF F3 complete)  
**Predecessor audits:** F1, F1.1, F2, F3 (`docs/audits/eed-rfrf-f*-2026-09-12.md`)

---

## 0. Executive verdict

```
F4_SCOPE_DEFINED = YES
F4_0_SCOPE_HARDENING = YES
F4_IMPLEMENTATION_NOT_STARTED = YES
F4_PHASE_BOUNDARY_RECOMMENDATION = B
F4_VEE_UPSERT_REACHABLE = NO
F5_PROMOTION_EXECUTION_AUTHORITY = YES
F4_IMPLEMENTATION_START_READY = YES (after PR #1628 final review)
RUNTIME_CODE_CHANGED = NO
PRODUCTION_MUTATED = NO
FEATURE_FLAGS_ENABLED = NO
PR_1628_STILL_DRAFT = YES
```

**Canonical F4:** Dark runtime integration through **candidate staging** and promotion **substrate** (mapping/schema/service code). **No fallback `VehicleEnergyEvent` upsert is reachable in F4.**

**Canonical F5:** Native↔fallback convergence authority, late-native policy, promotion execution authorization, `VehicleEnergyEvent` upsert, `PROMOTED` lifecycle transition, G2 post-persist execution proof.

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
| **F. lifecycle maturation** | **F3 + F2** | F3 proposes observation lifecycle; F2 persists/rediscovers — no second lifecycle authority in F4 |
| **G. READY_FOR_PERSIST eligibility** | **F3 + F2** | Lifecycle states unchanged; F4 adds orthogonal promotion eligibility only |
| **H. VehicleEnergyEvent promotion substrate** | **F4** | Service + schema migration + mapping; no upsert execution |
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
4. **`RawFuelCapabilityResolver`** — `fuelCapability` only (`FUEL_CAPABLE` \| `NON_FUEL_CAPABLE` \| `UNKNOWN`); separate from signal trust — see §8 / §25.3.
5. **`RawFuelSignalTrustResolver`** (or equivalent) — `absoluteSignalTrust`, `relativeSignalAvailable`; **not** derived from `fuelType` or sample presence alone.
6. **`detectRawFuelRises()` → `RawRefuelCandidateService.resolveOrCreateCandidate()`** per observation.
7. **`RawRefuelPromotionEligibility` assessor** — orthogonal to F2 lifecycle; **must not** irreversibly REJECT candidates because F5 is absent.
8. **Prisma migration (isolated/test):** additive `detectionSource`, `sourceEventKey` — no production deploy in F4 implementation PRs.
9. **`RawRefuelCandidatePromotionService`** — maps READY rows; **F4_VEE_UPSERT_REACHABLE = NO**.
10. **Minimum dark metrics** (§15).
11. **Integration + PG tests** including `F2_MATCHER_F3_TOLERANCE_BOUNDARY` hard gate (§19).

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
            if PERSIST_FLAG: RawRefuelCandidateService.resolveOrCreateCandidate(...)
            assessPromotionEligibility(...)  // orthogonal; no lifecycle REJECTED for F5 absence
          // F4_VEE_UPSERT_REACHABLE = NO — no promotion execution path
        } catch (e) {
          log + metric; DO NOT rethrow — native path already completed
        }
```

### WINDOW_LEVEL_NATIVE_SUPPRESSION = FORBIDDEN

Raw scan runs **regardless of native segment count** in the same window. Example: native Refuel A at 10:00 does **not** suppress raw scan that may detect missed Refuel B at 10:30.

### Integration location

**Inside `EnergyEventsService.detectEnergyEvents()`** after native processing. Trip Reconciliation Step 5 invokes this method.

```
SCHEDULER_COVERAGE_STATUS = PROOF_PENDING_F4_IMPLEMENTATION
NEW_RFRF_SCHEDULER_REQUIRED = NO_CURRENT_EVIDENCE
```

F4 implementation must trace actual callers (fast/warm/cold/manual/API) and test relevant paths. No new RFRF scheduler unless callgraph proof demonstrates a gap.

---

## 8. Capability gate (negative case 22) — F4.0 split

### fuelCapability (vehicle-level)

```
FUEL_CAPABILITY_AUTHORITY = Vehicle.fuelType + Vehicle.powertrainType/powertrainProfile (heuristic only)
```

| `fuelCapability` | F4 behavior |
|------------------|-------------|
| `FUEL_CAPABLE` | Raw path may be considered (subject to flags + signal trust) |
| `NON_FUEL_CAPABLE` | Raw fuel path **skipped** (e.g. `FuelType.ELECTRIC` BEV) |
| `UNKNOWN` | **Fail closed** — skip scan; metric |

`fuelCapability` answers **whether the vehicle class may have fuel telemetry at all**. It does **not** answer signal trust.

### absoluteSignalTrust (signal-level — separate axis)

```
ABSOLUTE_SIGNAL_TRUST_AUTHORITY = NOT_YET_AVAILABLE
ABSOLUTE_SIGNAL_TRUST_DERIVED_FROM_FUEL_TYPE = NO
ABSOLUTE_SIGNAL_TRUST_DERIVED_FROM_SAMPLE_PRESENCE = NO
```

No authoritative runtime source for fleet-wide absolute signal trust exists today. F4 implementation must **fail closed** for absolute-only promotion eligibility until an explicit trust policy/authority is established.

| Rule | Value |
|------|-------|
| `absoluteSignalTrust = UNKNOWN` | Absolute-only evidence **must not** be treated as trusted for promotion eligibility |
| `ABSOLUTE_SIGNAL_TRUST_UNKNOWN_FAILS_CLOSED_FOR_ABSOLUTE` | **YES** |
| `RELATIVE_FALLBACK_WHEN_ABSOLUTE_UNKNOWN` | **YES** — per existing F3 channel policy when relative samples are semantically valid |
| Numeric absolute sample present | **Does not** imply TRUSTED |

### Channel eligibility (detector input — not capability)

From window samples (not vehicle metadata):

| Class | Meaning |
|-------|---------|
| `ABSOLUTE_AND_RELATIVE` | Both channels usable for detection context |
| `ABSOLUTE_ONLY` | Relative absent in window |
| `RELATIVE_ONLY` | Absolute absent in window |

**Do not hardcode** vehicle IDs, organization IDs, KS MS 661, or DIMO token IDs.

### CAPABILITY_GATE_CASE_22_IMPLEMENTATION_SCOPE

F4 implements **two resolvers**:

1. `RawFuelCapabilityResolver` → `fuelCapability`
2. `RawFuelSignalTrustResolver` → `absoluteSignalTrust`, `relativeSignalAvailable` (fail-closed where authority absent)

Promotion eligibility may record `BLOCKED_CAPABILITY` without mutating F2 lifecycle to terminal REJECTED solely because F5 is unavailable.

---

## 9. Candidate lifecycle ownership — F4.0 corrected

```
F4_CANDIDATE_LIFECYCLE_RECLASSIFICATION = NO
F4_PROMOTION_ELIGIBILITY_SEPARATE_FROM_LIFECYCLE = YES
```

| Concern | Owner | Phase |
|---------|-------|-------|
| Physical rise detection + observation lifecycle proposal | **F3** | Implemented |
| Persist / rediscover / merge identity + evidence | **F2** | Implemented |
| Runtime integration + **promotion eligibility assessment** | **F4** | Future |
| Native↔fallback convergence + `PROMOTED` + VEE execution | **F5** | Future |

F4 **must not** create a second physical-candidate lifecycle authority. F4 **must not** irreversibly mutate a valid physical candidate to `REJECTED` merely because promotion cannot yet be authorized.

### RawRefuelPromotionEligibility (orthogonal to F2 lifecycle)

| Value | Meaning |
|-------|---------|
| `ELIGIBLE_PENDING_F5` | Candidate physically ready; awaiting F5 convergence + promotion authority |
| `NOT_READY` | Lifecycle/evidence not yet promotion-ready |
| `BLOCKED_CAPABILITY` | fuelCapability or signal-trust fail-closed |
| `NATIVE_OVERLAP_PENDING_F5` | Advisory overlap evidence recorded; F5 decides |
| `AMBIGUOUS` | Insufficient convergence evidence pre-F5 |
| `ERROR_FAIL_CLOSED` | Integration error; no promotion side effects |

Stored as runtime assessment metadata (e.g. JSON on candidate row or separate assessment record) — **not** a replacement for F2 lifecycle enum transitions driven by F3/F2.

---

## 10. Promotion runtime boundary — F4.0 corrected

```
F4_VEE_UPSERT_REACHABLE = NO
F5_PROMOTION_EXECUTION_AUTHORITY = YES
F4_NATIVE_OVERLAP_CLASSIFICATION = ADVISORY_ONLY
F4_NATIVE_OVERLAP_TERMINAL_REJECTION = NO
F5_NATIVE_FALLBACK_CONVERGENCE_AUTHORITY = YES
```

| Component | F4 | F5 |
|-----------|----|----|
| `mapRawRefuelCandidateToPromotionDraft()` | Implement mapping/substrate | Execute upsert |
| `sourceEventKey = candidateIdentityKey` | Design + test idempotency contract | Use on first VEE write |
| Synthetic `dimoSegmentIdPlaceholder` | Map in draft only; **not emitted by F4 runtime** | Use on upsert if schema requires |
| `classifyPhysicalRefuelSibling()` overlap | **Advisory evidence only** | Final SAME/DISTINCT ownership |
| Lifecycle → `PROMOTED` | **Forbidden** | F5 only |
| G2 `reconcileAndEnqueueAfterPersist` | N/A in F4 | After F5 promotion |

### F5 promotion execution gate (conceptual — separate from persist flag)

```
F5_PROMOTION_GATE_SEPARATE = YES
CANDIDATE_PERSIST_FLAG_OWNS_VEE_PROMOTION = NO
```

Conceptual authority (env name TBD at F5): `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` — must be **false** during all F4 work; checked immediately before any fallback VEE upsert. Not substitutable by `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED`.

---

## 11. Native/fallback convergence dependency

F5 is **mandatory** before production promotion enablement because:

1. G2 matcher exists but has never been exercised on `SYNQDRIVE_RAW_FUEL_FALLBACK` rows vs native rows.
2. Late native arrival after fallback candidate READY is unresolved in runtime.
3. Synthetic `dimoSegmentId` fleet compatibility remains **NOT_PROVEN**.
4. Legacy `refuel-sibling-reconciliation.ts` regex ignores `synqdrive-rfrf-*` — safe but means no automatic dedup without explicit F5 policy.

F4 may implement the **mechanism** (load native neighbors, call `classifyPhysicalRefuelSibling`); F5 **proves** it across §17 matrix.

---

## 12. VehicleEnergyEvent schema impact — F4.0 detectionSource semantics

```
DETECTION_SOURCE_LEGACY_NULL_SEMANTICS_DEFINED = YES
LEGACY_NATIVE_ROWS_BACKFILLED_IN_F4 = NO
NULL_DETECTION_SOURCE_MEANS_FALLBACK = NO
NEW_NATIVE_WRITES_DIMO_NATIVE_AFTER_DEPLOY = YES
P1_4_PRODUCTION_DEPLOY_OWNER = F6_OR_LATER
```

| Row class | `detectionSource` | `sourceEventKey` |
|-----------|-------------------|------------------|
| Existing legacy rows | `NULL` | `NULL` |
| Meaning of `NULL` | **LEGACY / UNLABELED NATIVE-ERA EVENT** | — |
| New native rows (post F6+ production deploy) | `DIMO_NATIVE` | `NULL` |
| Authorized fallback VEE (F5+) | `SYNQDRIVE_RAW_FUEL_FALLBACK` | `candidateIdentityKey` |

**NULL must never mean raw fallback.** No historical rewrite/backfill in F4. F4 may create/test additive schema/migration in **isolated environments only**. Production deploy hygiene for native labeling is **F6+** rollout ownership.

Canonical fallback idempotency identity:

```
SOURCE_EVENT_KEY_CANONICAL_FALLBACK_IDENTITY = YES
sourceEventKey = candidateIdentityKey
```

Stable across window expansion, delayed telemetry, `evidenceRevisionFingerprint` changes, repeat processing.

---

## 13. Synthetic dimoSegmentId status — F4.0 corrected

```
SYNTHETIC_DIMO_SEGMENT_ID_COMPATIBLE = NOT_PROVEN
SYNTHETIC_DIMO_SEGMENT_ID_EMITTED_BY_F4_RUNTIME = NO
SYNTHETIC_DIMO_COMPATIBILITY_OWNER = F5
```

Synthetic `dimoSegmentId` is a **schema-compatibility placeholder only** — **not** canonical fallback identity (`sourceEventKey` is canonical). F4 may design/map/test compatibility in isolated environments. F5 owns fleet proof before **first** fallback VEE execution. Do not use synthetic `dimoSegmentId` to bypass `sourceEventKey` design.

---

## 14. Scheduler wiring result — F4.0 proof obligation

```
SCHEDULER_COVERAGE_STATUS = PROOF_PENDING_F4_IMPLEMENTATION
NEW_RFRF_SCHEDULER_REQUIRED = NO_CURRENT_EVIDENCE
```

Design intent: integration inside `detectEnergyEvents()` should inherit Trip Reconciliation Step 5 (fast/warm/cold/manual/API). This is **not yet proven** — F4 implementation must trace callgraph and test relevant paths.

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
| F2 persist failure (one candidate) | Log + metric; **continue other candidates** | **BEST_EFFORT** per-candidate |
| Native DIMO path failure | Existing behavior (may abort native) | unchanged |
| Promotion in F4 | **Must not run** | **FAIL_CLOSED** (gate) |
| Process crash after candidate persist | Retry via reconciliation rediscovery | **TRANSACTIONAL** (F2 proven) |
| Process crash after VEE insert | F5 idempotency by sourceEventKey | **F5** |
| Concurrent replicas | Per-vehicle advisory lock on F2 (existing) — **do not duplicate lock logic** | **TRANSACTIONAL** |

```
PER_CANDIDATE_FAILURE_ISOLATION_REQUIRED = YES
```

If observation B persist fails, observations A and C must not be lost unless an explicit all-or-nothing transaction is deliberate and documented.

---

## 17. Feature flag model — F4.0 truth table

```
FLAG_TRUTH_TABLE_DEFINED = YES
MASTER_FLAG_OWNS_SCAN = YES
CANDIDATE_PERSIST_FLAG_OWNS_F2_STAGING = YES
CANDIDATE_PERSIST_FLAG_OWNS_VEE_PROMOTION = NO
F5_PROMOTION_GATE_SEPARATE = YES
CUTOVER_RUNTIME_ENFORCEMENT_OWNER = F6_OR_LATER
DELAYED_EVIDENCE_FILTERED_BY_CUTOVER_IN_F4 = NO
```

### Master flag — `RAW_FUEL_REFUEL_FALLBACK_ENABLED`

| Value | Authority |
|-------|-----------|
| `false` (default) | No raw scan; no raw candidate persistence; no fallback VEE |
| `true` | F4 raw scan **may** execute; persistence still requires candidate-persist flag |

### Staging flag — `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED`

| Value | Authority |
|-------|-----------|
| `false` (default) | Detector/diagnostics may run (if master true); **no** `RawRefuelCandidate` DB mutation |
| `true` | F2 candidate persistence/staging allowed; **no** fallback `VehicleEnergyEvent` |

**The candidate-persist flag must never authorize promotion.**

### Cutover — `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT`

F4 uses **evidence-bounded detection semantics** only. Cutover must **not** truncate physical evidence or filter delayed telemetry in F4. F4 may parse/configure the constant if required by existing code structure, but must **not** use cutover time as physical-candidate evidence authority.

### F5 promotion gate (conceptual — not implemented in F4 docs turn)

Separate from all F4 flags. Owns first reachable fallback VEE execution path. Default: unreachable.

**F4 scoping/hardening turns:** MUST NOT enable any flag in production.

---

## 18. Duplicate safety matrix — F4.0 hardened

| # | Scenario | F4 candidate | F4 fallback VEE | Final owner |
|---|----------|--------------|-----------------|-------------|
| 1 | Native only | None | None | Native VEE only (current) |
| 2 | Fallback only | Staged | **Zero** | F5 promotes |
| 3 | Same physical native+raw | May stage | **Zero** | F5 convergence |
| 4 | Fallback first, native later | Stage; **no terminal F4 reject/promote** | **Zero** | F5 late-native policy |
| 5 | Native first, fallback rediscovered | F2 rediscovery | **Zero** | F5 convergence |
| 6 | Native A + missed raw B | B discoverable; window suppression **forbidden** | Native A VEE; B staged | F4 + F5 |
| 7 | Two distinct raw refuels | Two candidates | **Zero** | F3 proven; F5 promotes |
| 8 | Delayed evidence | Same row updated | **Zero** | F2 proven |
| 9 | READY + F5 absent | READY may persist | **Zero** | F4 safe staging |
| 10 | Concurrent scheduler/manual | F2 lock/idempotency | **Zero** | F2 proven |

---

## 19. Required F4 test matrix (future implementation)

| Category | Tests |
|----------|-------|
| **Unit** | Capability resolver (5 classes); context builder; READY gate; promotion service mapping; F5 gate blocks upsert |
| **PostgreSQL** | detectEnergyEvents integration: candidate rows when persist flag; **zero fallback VEE**; idempotent rescan |
| **F2/F3 tolerance** | **`F2_MATCHER_F3_TOLERANCE_BOUNDARY = PASS`** — real PG tests at 0.49/0.50/0.51/0.99/1.00/1.01 L boundaries; shifted post evidence; expanded window; delayed telemetry; nearby distinct rise |
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
| **F4-PR3** | Promotion eligibility assessor; promotion substrate (mapping only); advisory overlap recording; F5 gate stub; PG tests incl. tolerance boundary gate | PR2 |
| **F4-PR4** | Audit closure + KG update marking `F4_IMPLEMENTATION_COMPLETE`; SynqDrive Code entries | PR3 |

**F5-PR1** (separate phase): Convergence gate implementation + integration matrix + promotion execution enablement behind persist flag (still default off).

---

## 21. F4 start blockers

| Class | Count | Notes |
|-------|-------|-------|
| **P0 F4 start** | **0** | Scope + contract hardened |
| **P1 F4 start** | **0** | P1-5 is an **integration hard gate during F4**, not a scope-start blocker |

---

## 22. F5 entry blockers and production rollout blockers

### F5 entry blockers (block promotion execution authorization)

| ID | Blocker | Owner |
|----|---------|-------|
| P1-1 | Synthetic `dimoSegmentId` fleet compatibility NOT_PROVEN | **F5** |
| P1-2 | Native↔fallback G2 integration matrix not executed | **F5** |
| P1-3 | Late native sibling policy not implemented | **F5** |

### F4 integration hard gate (during F4 implementation — not scope-start)

| ID | Gate | Owner |
|----|------|-------|
| P1-5 | `F2_MATCHER_F3_TOLERANCE_BOUNDARY = PASS` at listed boundaries | **F4_INTEGRATION_HARD_GATE** |

```
P1_5_MONITOR_ONLY = NO
P1_5_F4_INTEGRATION_HARD_GATE = YES
```

If tolerance gate fails: **STOP F4 closure** and perform targeted semantic correction — do not tune thresholds to force green tests.

### Production rollout blockers (F6+)

| ID | Blocker | Owner |
|----|---------|-------|
| P1-4 | Native `detectionSource` production deploy hygiene | **F6_OR_LATER** |
| — | Feature flag production enablement | **F6+** |
| — | Historical backfill / mass reprocess | **Forbidden** |

---

## 23. Authority updates (this workstream)

- This document: `docs/audits/eed-rfrf-f4-scope-and-runtime-boundary-2026-09-13.md`
- EED KG: `EED-EV-0045`, `EED-DEC-RFRF-006`, changelog entry, node update
- F3 audit §11 F4 gate statuses remain historical; superseded by this scope audit for F4 planning

---

## 24. Exact next action

**Human final review of PR #1628** (draft). Upon merge approval, begin **F4-PR1** — still with all flags default false, `F4_VEE_UPSERT_REACHABLE = NO`, no production enablement.

---

## 25. F4.0 final scope hardening gate (2026-09-13)

This section records the F4.0 contract-hardening turn. Supersedes ambiguous wording in §1–§24 where noted.

```
RFRF_F4_0_SCOPE_HARDENING = PASS
STARTING_HEAD = 64e8dfe0b9d49ebd93d398b6dc93cac7e9624c1e
OPTION_B_PHASE_BOUNDARY = PASS
PR_1628_DOCS_ONLY = YES
PR_1628_READY_FOR_FINAL_REVIEW = YES
F4_IMPLEMENTATION_START_READY = YES
PR_1628_STILL_DRAFT = YES
```

Full gate block matches §0 executive verdict plus §8–§22 hardened contracts. **Do not merge PR #1628 in the F4.0 turn. Do not start F4-PR1 until review completes.**

```
ARCHITECTURE_GOVERNANCE
- substantive_change: YES
- affected_modules: Energy Event Detection (EED)
- authority_updates: this audit §25; EED-DEC-RFRF-006 expanded; EED-EV-0045; KG changelog; SynqDrive Code
- registry_review:
 - module: Energy Event Detection (EED)
 result: UNCHANGED
 registry_status_before: AUTHORITY_ACTIVE
 registry_status_after: AUTHORITY_ACTIVE
 reason: F4.0 contract hardening only; no registry metadata change
```
