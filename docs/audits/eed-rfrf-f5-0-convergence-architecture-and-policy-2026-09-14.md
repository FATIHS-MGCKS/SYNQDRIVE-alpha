# RFRF F5.0 — Convergence Architecture + Policy Closure

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F5.0 — Architecture + policy closure (NOT promotion implementation)  
**Date:** 2026-09-14  
**BASE_MAIN_SHA:** `c81629ee4891a74701965864a5167a3c5e41c7a6` (PR #1639 merge)  
**Branch:** `cursor/eed-rfrf-f5-0-convergence-architecture-f21f`  

---

## Executive verdict

```
RFRF_F5_0_CONVERGENCE_POLICY_CLOSURE = PASS
F4_IMPLEMENTATION_COMPLETE = YES
F5_STARTED = YES
F5_PR1_START_AUTHORIZED = YES
FALLBACK_VEE_CREATION_REACHABLE = NO
PROMOTED_TRANSITION_REACHABLE = NO
KNOWN_P0_F5_BLOCKERS = 0
KNOWN_P1_F5_BLOCKERS = 0
```

F5.0 closes the three authoritative entry blockers (synthetic `dimoSegmentId` policy, native↔fallback convergence matrix, late-native sibling policy) as implementation-grade contracts. **No runtime promotion code, no flag changes, no production mutation.**

---

## 0. Repository start state

| Check | Result |
|-------|--------|
| `git fetch origin main` | DONE |
| Current `origin/main` SHA | `c81629ee4891a74701965864a5167a3c5e41c7a6` |
| Expected SHA match | YES |
| PR #1639 ancestor of main | YES |
| Commits after `c81629ee` | **NONE** |
| Post-merge delta classification | N/A — main unchanged |

**BASE_MAIN_SHA = FINAL_HEAD = `c81629ee4891a74701965864a5167a3c5e41c7a6`**

---

## 1. F5 boundary dependency map

### 1.1 Call graph (verified on main)

```
TripReconciliationService / VehicleIntelligenceController.detectEnergyEvents
  → EnergyEventsService.detectEnergyEvents()
       → native: fetchEnergyEventSegments → coalesce → upsertSegment() [DIMO_NATIVE VEE]
       → native: reconcileSupersededRefuelSiblings (V1 when G2 OFF)
       → native: physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist (G2 ON)
       → runRawFuelFallbackBranch() [isolated try/catch]
            → RawFuelRefuelFallbackRuntimeService.scanIfEnabled()
                 → loadRawFuelRefuelFallbackConfig() [master/persist flags; cutover parsed only]
                 → resolveRawFuelCapability()
                 → DimoSegmentsService.fetchFuelLevelSamplesWithOutcome()
                 → resolveRawFuelSignalTrust() + absoluteDetectionAdmissibility
                 → detectRawFuelRises() [F3]
                 → RawRefuelCandidateService.resolveOrCreateCandidate() [F2]
                 → RawRefuelPromotionPreparationService.preparePromotion() [F4-PR3]
                      → evaluateRawRefuelCandidateReadiness()
                      → loadNativeOverlapAdvisory → classifyRawRefuelNativeOverlapAdvisory()
                      → evaluateRawRefuelPromotionEligibility()
                      → mapRawRefuelCandidateToPromotionDraft()
                      → isRfrfNativeFallbackConvergenceAuthorized() → **false**
                      → canCreateFallbackVehicleEnergyEvent() → **false**
                      → **STOP — no VEE insert, no PROMOTED, no G2 handoff**
```

### 1.2 F4 promotion-preparation participants

| Function / module | Role |
|-------------------|------|
| `evaluateRawRefuelCandidateReadiness` | F2 lifecycle + evidence completeness gate |
| `classifyRawRefuelNativeOverlapAdvisory` | F4 advisory-only native overlap (G1 matcher) |
| `evaluateRawRefuelPromotionEligibility` | Orthogonal promotion gate (trust, overlap, F5 stub) |
| `mapRawRefuelCandidateToPromotionDraft` | Identity mapping (no persist) |
| `isRfrfNativeFallbackConvergenceAuthorized` | **Hard-coded false** |
| `canCreateFallbackVehicleEnergyEvent` | **Hard-coded false** |
| `canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion` | **Hard-coded false** |

### 1.3 Hard stop gates (F5.0 unchanged)

| Gate | Location | Value |
|------|----------|-------|
| `isRfrfNativeFallbackConvergenceAuthorized()` | `raw-fuel-refuel-fallback.config.ts` | `false` |
| `canCreateFallbackVehicleEnergyEvent()` | same | `false` |
| `canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion()` | same | `false` |
| F2 `PROMOTED` transition | No F5 caller | unreachable |

### 1.4 Native VEE upsert path

`EnergyEventsService.upsertSegment()` — DIMO segment coalesce → `VehicleEnergyEvent` with `detectionSource` implicit NULL (legacy native-era) or future explicit `DIMO_NATIVE`; triggers G2 when enabled.

### 1.5 G2 physical-refuel entry points

| Entry | Trigger |
|-------|---------|
| `PhysicalRefuelReconciliationRuntimeService.reconcileAndEnqueueAfterPersist` | Native (and future fallback) VEE persist |
| `runRecoveryBatch` / recovery scheduler | Orphan / held / stale enrichment recovery |
| Design-only: `reconcilePhysicalRefuelBatch` | Pure matcher + settlement |

G2 identity: `physical-refuel-identity.matcher.ts` — fuel/time/odometer windows; **does not parse `dimoSegmentId`**.

G2 observation: `buildFirstObservedAtById()` binds **`VehicleEnergyEvent.createdAt`** as system first observation (documented in `physical-refuel-row.mapper.ts`).

G2 late sibling: `hasLateSiblingFinalizationConflict()` in `physical-refuel-reconciliation.design.ts` — prevents duplicate enrichment when late SAME/INSUFFICIENT arrives after prior finalization.

### 1.6 Legacy V1 sibling path (G2 OFF only)

`refuel-sibling-reconciliation.ts` — regex `^dimo-refuel-(\d+)-(\d+)$` on `dimoSegmentId`. **Fail-closed** for `dimo-seg-*` (current native) and `synqdrive-rfrf-*` (proposed fallback). Not used when G2 reconciliation enabled.

### 1.7 Scripts / admin / analytics assuming provider-native `dimoSegmentId`

| Consumer | Treatment of `dimoSegmentId` | Fallback impact |
|----------|------------------------------|-----------------|
| Prisma `@@unique` | Globally unique storage key | PASS with namespaced synthetic |
| G2 matcher row | Carried; not used for pairwise identity | PASS |
| G2 enrichment producer | Keys on `energyEventId` | PASS |
| `refuel-sibling-reconciliation` | Parseable provider token (V1) | Fail-closed (no erroneous supersede) |
| Trip lifecycle recovery meta | Opaque segment reference | Display/log — no provider query |
| UI / DTO / exports | Display metadata | Must not label synthetic as DIMO segment |
| DIMO API re-fetch by segment id | Provider query key | **Must not** call DIMO with `synqdrive-rfrf-*` |

---

## 2. Synthetic `dimoSegmentId` policy

### 2.1 Options evaluated

| Option | Verdict |
|--------|---------|
| **A — NAMESPACED_SYNTHETIC** | **SELECTED** |
| B — NULL_FOR_FALLBACK | Rejected: schema `dimoSegmentId String @unique` NOT NULL; migration scope unnecessary for F5.0 |
| C — SOURCE_ID_ABSTRACTION | Rejected: `detectionSource` + `sourceEventKey` already provide abstraction; new column deferred |

### 2.2 Authoritative policy (EED-DEC-RFRF-008)

```
SYNTHETIC_DIMO_SEGMENT_ID_POLICY = NAMESPACED_SYNTHETIC
SOURCE_EVENT_KEY_AUTHORITATIVE_FOR_FALLBACK = YES
DIMO_SEGMENT_ID_FLEET_COMPATIBILITY = PASS
```

**Rules:**

1. **Canonical fallback identity** = `(detectionSource=SYNQDRIVE_RAW_FUEL_FALLBACK, sourceEventKey=candidateIdentityKey)`.
2. **`dimoSegmentId`** = deterministic namespaced storage surrogate: `synqdrive-rfrf-{vehicleId}-{candidateIdentityKey[0:16]}` via `buildSyntheticDimoSegmentIdPlaceholder()`.
3. **`dimoSegmentId` MUST NOT** be interpreted as a DIMO/provider segment identifier in application logic, provider API calls, or operational runbooks.
4. **SQL uniqueness:** global `@unique` on `dimoSegmentId` + `@@unique([vehicleId, sourceEventKey])` — promotion idempotency enforced on `sourceEventKey`.
5. **Consumer class:** A (opaque event identity) + D (vehicle-scoped) for storage; explicitly **NOT** B/F (provider id / query key).
6. **Monitoring/UI:** label fallback rows by `detectionSource`; never display synthetic id as "DIMO segment".

**Risk note (P1 operational, not P0):** coordinate resolution may hold fallback events without DIMO route token — existing `COORDINATE_HOLD_MISSING_DIMO_TOKEN` path; F5-PR3 must prove fallback coordinate policy.

---

## 3. Authoritative native ↔ fallback convergence matrix

F4 advisory overlap is **superseded at F5 promotion gate** by authoritative G2 matcher semantics (`classifyPhysicalRefuelSibling` / `reconcilePhysicalRefuelBatch`). No competing identity engine.

**Hard requirements (verified against G2 design):**

- SAME → exactly one `enrichmentEligibleId` per physical refuel component.
- INSUFFICIENT → never treated as SAME; fail-closed promotion when authoritative classification unresolved.
- DISTINCT → independently representable and enrichable.

| Scenario | Canonical physical identity | Fallback promotion | Native wins? | Fallback redundant? | Audit retention | Candidate result | VEE result | G2 result | Enrichment owner | BullMQ |
|----------|----------------------------|--------------------|--------------|---------------------|-----------------|------------------|------------|-----------|------------------|--------|
| **A** native only | Native VEE | NO | YES | N/A | native row | no candidate / N/A | native | native reconcile | native canonical | native only |
| **B** fallback only | Fallback VEE | YES (F5+) | NO | NO | candidate + fallback VEE | PROMOTED | one fallback VEE | FINAL_DISTINCT or single-member | fallback | one job on canonical |
| **C** SAME coexist at gate | Native VEE | **NO** | YES | YES (no fallback VEE) | candidate forensic | CONVERGED_NATIVE* | native only | SAME component | native canonical | native only |
| **D** fallback ready; native before promotion | Native VEE | **NO** | YES | YES | candidate | CONVERGED_NATIVE* | native | deferred native reconcile | native | native |
| **E** fallback VEE exists; late native SAME | Earlier canonical by `chooseCanonicalRefuel` + `firstObservedAt` | already done | YES if native earlier observation wins | fallback row retained | both rows | PROMOTED | both rows | SAME group; `lateSiblingConflict` if post-finalization | **one** eligible id | suppress duplicate |
| **F** native first; late fallback DISTINCT | Both | YES if DISTINCT | NO for fallback refuel | NO | both | PROMOTED | both VEEs | DISTINCT components | each own | independent jobs |
| **G** one SAME + one INSUFFICIENT native | Unresolved | **NO** | pending | N/A | all rows | READY (blocked) | none new | INSUFFICIENT_EVIDENCE | none | none |
| **H** one SAME + one DISTINCT native | AMBIGUOUS | **NO** | NO | N/A | all rows | READY (blocked) | none new | INSUFFICIENT / ambiguous | none | none |
| **I** multiple SAME natives | AMBIGUOUS | **NO** | NO | N/A | all rows | READY (blocked) | none new | INSUFFICIENT_EVIDENCE | none | none |
| **J** multiple DISTINCT natives | Closest DISTINCT to candidate | YES if candidate DISTINCT from all | NO | NO | all rows | PROMOTED if eligible | fallback + natives | multiple DISTINCT groups | per canonical | per eligible |
| **K** two true refuels close | Two physical ids | YES only if matcher DISTINCT | NO | NO | both | PROMOTED if DISTINCT | two VEEs | two components | each | each |
| **L** delayed evidence maturation | Same `candidateIdentityKey` | YES when READY (same key) | NO | NO | candidate revisions | same row updated → promote once | one VEE | unchanged identity | single | single |
| **M** native A + missed raw B | Two if DISTINCT | YES for B if DISTINCT | A native | NO | both | PROMOTED for B | A native + B fallback | DISTINCT | separate | separate |
| **N** concurrent processing | Lock-order deterministic | one winner via DB uniqueness | race-safe | N/A | both attempts logged | one PROMOTED | `@@unique` prevents dup VEE | single reconcile pass | single | deduped enqueue |
| **O** retries / rediscovery | Stable `sourceEventKey` | idempotent | N/A | N/A | full | PROMOTED once | upsert no-op on retry | idempotent reconcile | idempotent | job dedup |
| **P** pre-cutover native | Native final | NO if SAME | YES | YES | native + candidate | CONVERGED_NATIVE* | native | prior-final bridge | native | per G2 bridge |
| **Q** post-cutover fallback + late native | G2 late-sibling rules | already promoted | canonical re-eval | fallback retained | both | PROMOTED | both | lateSiblingConflict | **no duplicate enrich** | suppress |

\* **`CONVERGED_NATIVE`** — new F5 candidate terminal outcome (F5-PR1): candidate reaches terminal state without fallback VEE when authoritative SAME native exists or arrives before promotion. Forensic history preserved; not REJECTED.

**Promotion gate authoritative rules (F5):**

1. Run G2 matcher on `{candidate-as-draft-row} ∪ native siblings in window` — not advisory aggregate alone.
2. Any authoritative `SAME_PHYSICAL_REFUEL` with existing native → **block fallback VEE** → `CONVERGED_NATIVE`.
3. Any `INSUFFICIENT_EVIDENCE` or ambiguous component → **block promotion** (fail-closed).
4. `DISTINCT` or no siblings → proceed to promotion transaction (F5-PR2).

```
NATIVE_FALLBACK_CONVERGENCE_MATRIX_DEFINED = YES
SAME_NATIVE_FALLBACK_SINGLE_CANONICAL_OWNER = PASS
INSUFFICIENT_FAILS_CLOSED = PASS
DISTINCT_REFUELS_REMAIN_DISTINCT = PASS
```

---

## 4. Late-native sibling policy (EED-DEC-RFRF-010)

Reuse G2 `hasLateSiblingFinalizationConflict`, `priorCanonicalFinalizationIds`, `priorDistinctFinalizationIds`, settlement finality states.

| Case | Timing | Policy |
|------|--------|--------|
| **L1** | Native before fallback promotion | Block fallback VEE; candidate → `CONVERGED_NATIVE`; native remains canonical; no fallback enrichment |
| **L2** | Native after fallback VEE, before enrichment | Re-run G2 reconcile; if SAME → single canonical; only canonical gets `enrichmentEligible`; fallback row retained as sibling |
| **L3** | Native during SETTLING | Settlement window open; batch re-reconcile; no enqueue until finality |
| **L4** | Native after fallback enrichment complete | `lateSiblingConflict=true`; **no second enrichment**; audit both rows; canonical fuel/station amounts remain on enriched canonical unless explicit re-canonicalization decision (out of scope — fail-closed hold) |
| **L5** | Native INSUFFICIENT | Does **not** prove sameness; fallback stands if already promoted; no merge |
| **L6** | Native DISTINCT | Both DISTINCT; independent enrichment permitted |
| **L7** | Multiple late natives disagree | Component → `INSUFFICIENT_EVIDENCE` / AMBIGUOUS; no new promotion; observability alert |
| **L8** | Fallback finalized + enriched; native SAME | `lateSiblingConflict`; preserve both VEEs; **suppress duplicate enrichment**; ops review flag; do not delete evidence |

**Forensic rule:** Never delete fallback or native VEE rows for convergence. Supersession is logical (canonical pointer + enrichment eligibility), not physical row deletion.

```
LATE_NATIVE_POLICY_DEFINED = YES
LATE_NATIVE_AFTER_FALLBACK_VEE_POLICY_DEFINED = YES
LATE_NATIVE_AFTER_ENRICHMENT_POLICY_DEFINED = YES
```

---

## 5. Promotion identity contract

### 5.1 VehicleEnergyEvent (fallback promotion)

| Field | Authoritative meaning |
|-------|----------------------|
| `id` | New UUID per insert; G2 reconciliation primary key |
| `vehicleId` | Tenant-scoped vehicle |
| `type` / `kind` | `REFUEL` |
| `detectionSource` | `SYNQDRIVE_RAW_FUEL_FALLBACK` |
| `sourceEventKey` | **`candidateIdentityKey`** (immutable) |
| `dimoSegmentId` | Namespaced synthetic placeholder (NOT provider id) |
| `startTime` / `endTime` | Physical evidence window from candidate mapper |
| `startFuelPercent` / `endFuelPercent` | Via `rawDetectionMeta` pre/post fields |
| `liters` / delta | `fuelDeltaLiters` / `fuelDeltaPercent` from candidate |
| `createdAt` | **System first durable observation** for G2 (`buildFirstObservedAtById`) |

### 5.2 RawRefuelCandidate

| Field | Role |
|-------|------|
| `candidateIdentityKey` | Immutable promotion identity |
| `evidenceRevisionFingerprint` | Mutable evidence revision; does not change promotion key |
| `lifecycle` | F2 states → `PROMOTED` or `CONVERGED_NATIVE` |
| observed timestamps | Physical evidence; distinct from system observation |
| `qualityMeta` | Admissibility / detector metadata |

### 5.3 Idempotency

```
PROMOTION_IDEMPOTENCY_KEY = (vehicleId, sourceEventKey)
PROMOTION_IDEMPOTENCY_KEY_DEFINED = YES
```

Enforcement: PostgreSQL `@@unique([vehicleId, sourceEventKey])` + promotion transaction advisory lock `pg_advisory_xact_lock64(hash('rfrf_promote:'+vehicleId))`.

Repeated promotion of same physical candidate → exactly one fallback VEE. Evidence revision updates same candidate row without new `sourceEventKey`.

---

## 6. G2 handoff contract

After fallback VEE insert (F5-PR2), within same outer transaction boundary:

1. Transition candidate → `PROMOTED` (or abort).
2. Invoke `physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist({ vehicleId, triggerEventId: newVee.id, organizationId })`.
3. Pass `firstObservedAtById` via `buildFirstObservedAtById(all candidate VEE rows in window)` — **includes new row `createdAt`**.
4. G2 enabled + `isV2OwnedRefuelEvent(createdAt >= v2OwnershipCutoverAt)` must be true for post-cutover fallback.
5. Enrichment enqueue only when `decision.enrichmentEligibleId === row.id` and coordinate policy permits.
6. BullMQ logical identity: existing producer dedup on `energyEventId` — no `dimoSegmentId` in job key.

**Coordinate authority:** Fallback may enter `COORDINATE_HOLD_*` without DIMO token — route evidence from raw GPS samples / vehicle last-known; F5-PR3 proves path.

```
G2_FALLBACK_HANDOFF_CONTRACT_DEFINED = YES
FIRST_OBSERVED_AT_BINDING_DEFINED = YES  (VehicleEnergyEvent.createdAt)
BULLMQ_DUPLICATE_ENRICHMENT_PREVENTION_DEFINED = YES  (G2 finality + enrichmentEligibleId + lateSiblingConflict)
```

---

## 7. Cutover / historical boundary

| Boundary | Env / config | F5 behavior |
|----------|--------------|-------------|
| RFRF promotion | `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` | No fallback **promotion** for candidates whose **physical evidence end** `< cutoverAt` (fail-closed when cutover unset in prod) |
| G2 ownership | `PHYSICAL_REFUEL_V2_OWNERSHIP_CUTOVER_AT` / fuel enrichment cutover | Fallback VEE must have `createdAt >= cutover` for G2 reconcile |
| Historical native | pre-cutover rows | Prior-final bridge; no mass reprocessing |

**Delayed evidence:** Candidate may be created after cutover from evidence spanning before cutover — promotion allowed only if physical evidence window end `>= RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT`.

**No historical backfill** in F5.

---

## 8. Concurrency / transaction model

Single PostgreSQL transaction (F5-PR2) under per-vehicle advisory lock:

```
BEGIN
  pg_advisory_xact_lock64('rfrf_promote:{vehicleId}')
  SELECT candidate FOR UPDATE
  authoritative convergence check (G2 matcher)
  IF blocked → CONVERGED_NATIVE or return
  INSERT VehicleEnergyEvent (idempotent on sourceEventKey)
  UPDATE candidate lifecycle → PROMOTED
  INSERT reconciliation stub / defer G2 to post-commit hook per existing native pattern
COMMIT
→ reconcileAndEnqueueAfterPersist (async void pattern matching native)
```

| Crash point | Recovery |
|-------------|----------|
| **C1** before VEE insert | Candidate stays READY; retry safe |
| **C2** after VEE, before PROMOTED | **P0 prevent:** same txn; if split detected → recovery job reconciles orphan VEE to candidate via `sourceEventKey` in `rawDetectionMeta` |
| **C3** after PROMOTED, before G2 | G2 recovery scheduler picks orphan VEE |
| **C4** after reconcile row, before enqueue | G2 recovery re-enqueues |
| **C5** duplicate workers | `@@unique` + advisory lock → one winner |
| **C6** concurrent native | G2 vehicle lock `refuel_reconciliation:{vehicleId}` serializes reconcile |
| **C7** retry after crash | Idempotent on `(vehicleId, sourceEventKey)` |

```
PROMOTION_TRANSACTION_MODEL_DEFINED = YES
CRASH_RECOVERY_MODEL_DEFINED = YES
CONCURRENT_NATIVE_FALLBACK_MODEL_DEFINED = YES
```

---

## 9. F5 implementation phasing

| PR | Scope | Excluded | Test gates | DB migration | Rollback | Fallback VEE reachable? |
|----|-------|----------|------------|--------------|----------|---------------------------|
| **F5-PR1** | Convergence policy primitives: authoritative pre-promotion matcher wrapper; `CONVERGED_NATIVE` lifecycle; config reader for `RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED` (still default false); unit + PG policy tests | VEE insert; PROMOTED; G2 wiring | New PG matrix §10 subset | Optional enum value for `CONVERGED_NATIVE` | Revert branch | **NO** |
| **F5-PR2** | Promotion transaction: fallback VEE insert + candidate PROMOTED; cutover enforcement; idempotency proof | G2 handoff; flag enable | PG promotion idempotency + crash tests | None if enum only | Disable convergence flag | **YES when flag ON in test env only** |
| **F5-PR3** | G2 handoff + late-native convergence execution; coordinate hold for fallback; recovery | Production flag enable | Full PG matrix late-native cases | None expected | Flag off | Test env only |
| **F5-PR4** | Integration closure; observability; ops runbook; production enablement checklist (flags still OFF until explicit rollout) | Historical backfill | Full §10 matrix + regression | None | Flag off | Staged rollout |

```
F5_IMPLEMENTATION_PR_PLAN_DEFINED = YES
```

---

## 10. Real PostgreSQL integration test matrix (design)

| # | Scenario | Assert |
|---|----------|--------|
| T1 | Same candidate replay | One VEE |
| T2 | Concurrent same candidate promotion | One VEE (`@@unique`) |
| T3 | Different vehicles parallel | Isolated |
| T4 | Native SAME before promotion | CONVERGED_NATIVE; zero fallback VEE |
| T5 | Native SAME after promotion | One enrichmentEligible; lateSiblingConflict if post-final |
| T6 | Native INSUFFICIENT | No merge; promotion blocked pre-promote |
| T7 | Native DISTINCT | Two VEEs |
| T8 | SAME + INSUFFICIENT natives | Fail-closed block |
| T9 | SAME + DISTINCT natives | Block |
| T10 | Multiple SAME natives | Block |
| T11 | Two true refuels close | Two VEEs if DISTINCT |
| T12 | Delayed evidence maturation | Same sourceEventKey |
| T13 | Late native after finalization | No duplicate enrichment |
| T14 | Crash between VEE insert and PROMOTED | Recovery reconciles |
| T15 | Crash before G2 handoff | Recovery enqueue |
| T16 | G2 reconciliation retry | Idempotent |
| T17 | BullMQ enqueue recovery | Deduped job |
| T18 | No duplicate enrichment | Single enrichment row |
| T19 | sourceEventKey uniqueness | DB constraint |
| T20 | Namespaced dimoSegmentId | Prefix + unique |
| T21 | Legacy native rows | Bridge compat |
| T22 | Cross-cutover native + fallback | Cutover gates |

```
F5_REAL_PG_TEST_MATRIX_DEFINED = YES
```

---

## 11. Governance artifacts

- **EED-EV-0052** — this audit
- **EED-DEC-RFRF-008** — NAMESPACED_SYNTHETIC dimoSegmentId policy
- **EED-DEC-RFRF-009** — authoritative convergence matrix
- **EED-DEC-RFRF-010** — late-native sibling policy

---

## 12. Hard stop conditions — resolved

| Condition | Status |
|-----------|--------|
| dimoSegmentId semantics unsafe | **CLOSED** — namespaced + sourceEventKey authoritative |
| SAME duplicate VEE ownership | **CLOSED** — G2 single enrichmentEligible |
| Late-native nondeterministic | **CLOSED** — L1–L8 policy |
| Idempotency not provable | **CLOSED** — `(vehicleId, sourceEventKey)` |
| G2 cannot accept fallback VEE | **CLOSED** — handoff contract §6 |
| Recovery double-enrich | **CLOSED** — lateSiblingConflict + recovery |
| Source identity ambiguous | **CLOSED** — detectionSource + sourceEventKey |
| Concurrent ordering | **CLOSED** — advisory locks + G2 vehicle lock |

---

## 13. Scope boundaries (F5.0)

| Action | F5.0 |
|--------|------|
| Production flags | NOT enabled |
| Deploy | NOT performed |
| Backfill | NOT performed |
| Fallback VEE reachable | **NO** |
| PROMOTED reachable | **NO** |
| G2 runtime behavior change | **NO** |

---

## 14. Required final report

See PR description and agent completion block.

---

## ARCHITECTURE_GOVERNANCE

```
ARCHITECTURE_GOVERNANCE
- substantive_change: YES
- affected_modules:
  - Energy Event Detection (RFRF / G2 convergence policy)
- authority_updates:
  - docs/audits/eed-rfrf-f5-0-convergence-architecture-and-policy-2026-09-14.md (new)
  - architecture/knowledge-graphs/energy-event-detection/* (EED-EV-0052, EED-DEC-RFRF-008/009/010)
- registry_review:
  - module: Energy Event Detection
    result: UNCHANGED
    registry_status_before: AUTHORITY_ACTIVE
    registry_status_after: AUTHORITY_ACTIVE
    reason: F5.0 policy closure via KG + audit only; no registry metadata change
- cross_module_authorities_reviewed: G2 physical-refuel reconciliation (EED-owned); FST not substantively changed
- authority_validators: EED validate-graph.mjs
- central_registry_validator: validate-module-registry.sh
- SynqDrive Code → Changes: eed-rfrf-f5-0-convergence-architecture-2026-09-14
- SynqDrive Code → Architektur: RFRF F5.0 convergence policy row
```
