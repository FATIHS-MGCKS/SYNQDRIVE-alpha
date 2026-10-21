# RFRF F5.0 — Convergence Architecture + Policy Closure

**Workstream:** Raw Fuel Refuel Fallback (RFRF)
**Phase:** F5.0 — Architecture + policy closure (NOT promotion implementation)
**Date:** 2026-09-14
**F5_0_BASE_MAIN_SHA:** `c81629ee4891a74701965864a5167a3c5e41c7a6` (PR #1639 merge)
**F5_0_STARTING_HEAD:** `4cbd4849313b3be946aa92ccb22ba9db93367f5c` (F5.0 initial commit on PR #1641)
**Branch:** `cursor/eed-rfrf-f5-0-convergence-architecture-f21f`
**PR:** #1641 (draft; docs/governance only)

**Epistemic note:** This document is **POLICY_DEFINED** design/architecture evidence (`ARCHITECTURE_DOC`). It is not `IMPLEMENTED`, `PROVEN_BY_INTEGRATION_TEST`, or `PROVEN_IN_PRODUCTION`. EED-DEC-RFRF-008/009/010 remain **PROPOSED** until human merge per repository governance.

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
| Commits after `c81629ee` on main | **NONE** |
| Post-merge delta classification | N/A — main unchanged |
| F5.0 PR branch | `cursor/eed-rfrf-f5-0-convergence-architecture-f21f` |
| F5.0 initial PR HEAD | `4cbd4849313b3be946aa92ccb22ba9db93367f5c` |

**Repository SHA terminology (do not conflate):**

| Symbol | Meaning |
|--------|---------|
| `F5_0_BASE_MAIN_SHA` | `origin/main` at F5.0 branch point (`c81629ee…`) |
| `F5_0_STARTING_HEAD` | First F5.0 commit on PR #1641 (`4cbd48493…`) |
| `F5_0_FINAL_HEAD` | PR HEAD after F5.0a micro-closure (see §14 report) |

`F5_0_BASE_MAIN_SHA` describes **main**. `F5_0_STARTING_HEAD` / `F5_0_FINAL_HEAD` describe **PR #1641 branch commits only**.

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
4. **SQL uniqueness:** global `@unique` on `dimoSegmentId` + `@@unique([vehicleId, sourceEventKey])` — promotion idempotency enforced on `(vehicleId, sourceEventKey)`.
5. **`SOURCE_EVENT_KEY_SCOPE = VEHICLE_GLOBAL`:** `sourceEventKey` is authoritative within a vehicle. The DB unique key is `(vehicleId, sourceEventKey)` — not system-global. `detectionSource` is **not** part of the SQL unique key because the SQL CHECK constraint `vehicle_energy_events_source_identity_check` already pairs `detectionSource` ↔ `sourceEventKey` (fallback rows require both; legacy native rows require both NULL). Cross-source collision on the same vehicle is impossible by CHECK + application mapping.
6. **`SYNTHETIC_ID_COLLISION_BEHAVIOR = FAIL_CLOSED`:** If two distinct physical candidates ever produced the same `(vehicleId, sourceEventKey)` or the same `dimoSegmentId`, the insert/upsert MUST fail on the PostgreSQL unique constraint. Operators MUST treat this as an operational incident — never merge or converge two distinct physical refuels silently.
7. **Consumer class:** A (opaque event identity) + D (vehicle-scoped) for storage; explicitly **NOT** B/F (provider id / query key).
8. **Monitoring/UI:** label fallback rows by `detectionSource`; never display synthetic id as "DIMO segment".

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
| **E** fallback VEE exists; late native SAME (pre-enrichment finalization) | `chooseCanonicalRefuel` provisional pointer | already done | matcher SAME | fallback row retained | both rows | PROMOTED | both rows | SAME group settling → one eligible | **one** eligible id | single enqueue |
| **E′** fallback VEE finalized **and enriched**; late native SAME | See §4.1 sticky model | N/A | physical SAME; enrichment sticky on fallback | both rows | PROMOTED | both rows | `INSUFFICIENT_EVIDENCE` + `lateSiblingConflict` | **fallback (sticky)** | **none** for late native |
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
| **Q** post-cutover fallback + late native | §4.1 sticky enrichment model | already promoted | see L4/L8/L9 | fallback retained | both | PROMOTED | both | lateSiblingConflict when post-enrichment | sticky owner | suppress duplicate |

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

### 4.0 Five-axis model (do not overload “canonical”)

| Axis | Field / artifact | Meaning |
|------|------------------|---------|
| **A — Physical identity** | G2 matcher `SAME_PHYSICAL_REFUEL` / `DISTINCT` | Forensic evidence that two VEE rows describe the same physical fill |
| **B — Physical canonical pointer** | `canonicalEventId` / `provisionalCanonicalId` | Matcher-derived preferred row (`chooseCanonicalRefuel`) — may differ from enrichment owner after sticky conflict |
| **C — Enrichment owner** | `enrichmentEligibleId` + `VehicleEnergyEventFuelStationEnrichment` | Sole row permitted to enqueue/receive station enrichment |
| **D — Persisted enrichment result** | `VehicleEnergyEventFuelStationEnrichment` row | Station assignment, coordinate selection — **sticky once successfully completed** |
| **E — Candidate lifecycle** | `RawRefuelCandidate.lifecycle` | `PROMOTED` / `CONVERGED_NATIVE` / `READY` — independent of late-native G2 re-reconcile |

**Authoritative safety invariant:**

```
COMPLETED_ENRICHMENT_OWNERSHIP_IS_STICKY = YES
```

Verified against G2 design (`determinePhysicalRefuelSettlement` lines 132–140) and runtime enqueue dedup (`physical-refuel-reconciliation-runtime.service.ts`: existing non-stale enrichment → `deduped`). A late SAME sibling after prior finalized enrichment MUST NOT silently transfer enrichment ownership, recompute station assignment, or replace fuel amounts on the enriched row.

### 4.1 Post-enrichment late-native deterministic contract

**G2 runtime proof (design + tests):** When `priorDistinctFinalizationIds` or `priorCanonicalFinalizationIds` contains an already-enriched event id, and a late sibling pairs `SAME_PHYSICAL_REFUEL` or `INSUFFICIENT_EVIDENCE`, `hasLateSiblingFinalizationConflict` → true → settlement returns `finalityState=INSUFFICIENT_EVIDENCE`, `enrichmentEligibleId=null`, reason `late_sibling_after_finalization` (see `physical-refuel-reconciliation.design.spec.ts` CASE 1 / CASE 5).

For **fallback finalized + enriched → late native SAME**:

| Question | Deterministic answer |
|----------|---------------------|
| Physical identity change? | Matcher classifies SAME; reconciliation `classification=SAME_PHYSICAL_REFUEL` |
| Physical canonical pointer | `provisionalCanonicalId` may reflect `chooseCanonicalRefuel` winner (may prefer native on fuel evidence) — **does not override sticky enrichment** |
| Enrichment ownership change? | **NO** — `enrichmentEligibleId=null` for conflict batch; prior enriched fallback retains ownership |
| Move completed enrichment automatically? | **NO** |
| Recompute station enrichment? | **NO** on native row; existing fallback enrichment row unchanged |
| Replace fuel amount? | **NO** — canonical fuel/station display remains on enriched fallback row |
| Retain old enrichment? | **YES** — sticky |
| Which row may enqueue? | **Neither** for the late-conflict reconcile pass; prior job already completed on fallback |
| Late native row state | Reconciliation row: `finalityState=INSUFFICIENT_EVIDENCE`, `enrichmentEligible=false`, `lateSiblingConflict=true` |
| Native wins `firstObservedAt` ordering? | Irrelevant for enrichment transfer — sticky blocks |
| Recovery | `findPhysicalRefuelRecoveryWork` may revisit `lateSiblingConflict` rows but MUST NOT enqueue duplicate enrichment while fallback enrichment is non-stale |
| Operator view | Two VEE rows visible; station enrichment on fallback; native flagged `lateSiblingConflict` for ops/analytics — not hidden |

### 4.2 Case table (L1–L11)

| Case | Timing | Policy |
|------|--------|--------|
| **L1** | Native before fallback promotion | Block fallback VEE; candidate → `CONVERGED_NATIVE`; native remains physical + enrichment canonical; no fallback enrichment |
| **L2** | Native after fallback VEE, before enrichment | Re-run G2 reconcile; if SAME → single `enrichmentEligibleId` on matcher canonical before any completion; both rows retained |
| **L3** | Native during SETTLING | Settlement window open; batch re-reconcile; no enqueue until finality |
| **L4** | Native SAME after fallback enrichment **successfully completed** | §4.1 sticky model: no ownership transfer; `lateSiblingConflict=true`; `enrichmentEligibleId=null`; native reconciliation `INSUFFICIENT_EVIDENCE`; **DUPLICATE_ENRICHMENT_AFTER_LATE_NATIVE = IMPOSSIBLE** |
| **L5** | Native INSUFFICIENT | Does **not** prove sameness; if fallback already enriched, sticky stands; late INSUFFICIENT triggers same fail-closed path as G2 CASE 2/3 |
| **L6** | Native DISTINCT | Both DISTINCT; independent enrichment permitted |
| **L7** | Multiple late natives disagree | Component → `INSUFFICIENT_EVIDENCE` / AMBIGUOUS; no new promotion; observability alert |
| **L8** | Fallback finalized + enriched; native SAME | **Same as L4** (L8 ⊆ L4 post-enrichment) |
| **L9** | Late native would win `chooseCanonicalRefuel` but fallback enrichment completed | Physical pointer may prefer native; **enrichment owner remains fallback**; no automatic transfer (§4.1) |
| **L10** | Late native SAME after prior enrichment **failure** (no successful completion) | No sticky completion exists; treat as **L2/L3** — re-reconcile may assign `enrichmentEligibleId` to matcher canonical (native or fallback per `chooseCanonicalRefuel`); recovery may retry failed/stale enrichment on eligible id only |
| **L11** | Multiple late SAME/INSUFFICIENT after enrichment | Fail-closed: component `INSUFFICIENT_EVIDENCE`; all late siblings `enrichmentEligible=false`; sticky owner unchanged; ops alert |

**Forensic rule:** Never delete fallback or native VEE rows for convergence. Supersession is logical (canonical pointer + enrichment eligibility), not physical row deletion.

```
LATE_NATIVE_POLICY_DEFINED = YES
LATE_NATIVE_POLICY_SCOPE = L1–L11
LATE_NATIVE_AFTER_FALLBACK_VEE_POLICY_DEFINED = YES
LATE_NATIVE_AFTER_ENRICHMENT_POLICY_DEFINED = YES
LATE_NATIVE_L4_DEFINED = YES
LATE_NATIVE_L8_DEFINED = YES
LATE_NATIVE_L9_DEFINED = YES
LATE_NATIVE_L10_DEFINED = YES
LATE_NATIVE_L11_DEFINED = YES
PHYSICAL_CANONICAL_VS_ENRICHMENT_OWNER_SEPARATED = YES
COMPLETED_ENRICHMENT_OWNERSHIP_IS_STICKY = YES
DUPLICATE_ENRICHMENT_AFTER_LATE_NATIVE = IMPOSSIBLE
LATE_NATIVE_POST_ENRICHMENT_POLICY_DETERMINISTIC = YES
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
SOURCE_EVENT_KEY_SCOPE = VEHICLE_GLOBAL
SYNTHETIC_ID_COLLISION_BEHAVIOR = FAIL_CLOSED
PROMOTION_IDEMPOTENCY_KEY_DEFINED = YES
SOURCE_IDENTITY_CONTRACT_INTERNALLY_CONSISTENT = YES
```

Enforcement: PostgreSQL `@@unique([vehicleId, sourceEventKey])` + promotion transaction advisory lock `pg_advisory_xact_lock64(hash('rfrf_promote:'+vehicleId))`.

Repeated promotion of same physical candidate → exactly one fallback VEE. Evidence revision updates same candidate row without new `sourceEventKey`.

---

## 6. G2 handoff contract

**Transaction boundary:** G2 handoff is **post-commit**, matching the existing native persist pattern in `EnergyEventsService.upsertSegment()` (persist completes, then `void reconcileAndEnqueueAfterPersist(...)` — no BullMQ inside the DB transaction).

After fallback promotion transaction **commits** (F5-PR2):

1. **Post-commit:** invoke `physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist({ vehicleId, triggerEventId: newVee.id, organizationId })`.
2. G2 acquires its own vehicle reconciliation path (including `pg_advisory_xact_lock64` on `refuel_reconciliation:{vehicleId}` inside the reconcile transaction).
3. Pass `firstObservedAtById` via `buildFirstObservedAtById(all candidate VEE rows in window)` — **includes new row `createdAt`**.
4. G2 enabled + `isV2OwnedRefuelEvent(createdAt >= v2OwnershipCutoverAt)` must be true for post-cutover fallback.
5. Enrichment enqueue only when `decision.enrichmentEligibleId === row.id` and coordinate policy permits — **BullMQ enqueue is outside promotion DB transaction**.
6. BullMQ logical identity: existing producer dedup on `energyEventId` — no `dimoSegmentId` in job key.

**Coordinate authority:** Fallback may enter `COORDINATE_HOLD_*` without DIMO token — route evidence from raw GPS samples / vehicle last-known; F5-PR3 proves path.

```
G2_FALLBACK_HANDOFF_CONTRACT_DEFINED = YES
G2_HANDOFF_POST_COMMIT_DEFINED = YES
BULLMQ_OUTSIDE_PROMOTION_DB_TRANSACTION = YES
FIRST_OBSERVED_AT_BINDING_DEFINED = YES  (VehicleEnergyEvent.createdAt)
BULLMQ_DUPLICATE_ENRICHMENT_PREVENTION_DEFINED = YES  (G2 finality + enrichmentEligibleId + lateSiblingConflict + sticky completed enrichment)
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

**Authoritative promotion DB transaction (TRANSACTION A)** — matches native persist/G2 separation; advisory lock is **`pg_advisory_xact_lock64`** (transaction-scoped, released on COMMIT):

```
BEGIN  -- TRANSACTION A (promotion only)
  pg_advisory_xact_lock64('rfrf_promote:{vehicleId}')
  SELECT candidate FOR UPDATE
  authoritative convergence check (G2 matcher)
  IF blocked → CONVERGED_NATIVE or return
  INSERT VehicleEnergyEvent (idempotent on (vehicleId, sourceEventKey))
  UPDATE candidate lifecycle → PROMOTED
COMMIT
```

**POST-COMMIT (outside TRANSACTION A):**

```
reconcileAndEnqueueAfterPersist({ vehicleId, triggerEventId: newVee.id })
  → G2 reconcile transaction (separate)
  → coordinate resolution
  → BullMQ enqueue (side effect — never inside TRANSACTION A)
```

**RECOVERY:** Existing G2 orphan/recovery machinery (`runRecoveryBatch`, `findPhysicalRefuelRecoveryWork`) repairs post-commit gaps.

| Crash point | State | Recovery |
|-------------|-------|----------|
| **C1** before VEE insert | Candidate READY | Retry promotion |
| **C2** insert attempt inside txn before candidate update | **Impossible split** — same transaction rolls back both | N/A — no orphan VEE without PROMOTED |
| **C3** committed VEE + PROMOTED; process dies before G2 call | Orphan VEE with PROMOTED candidate | G2 recovery scheduler reconciles + enqueues |
| **C4** G2 reconciliation row persisted; enqueue missing/failed | Reconcile without enqueue | G2 recovery re-enqueues (`deduped` if already present) |
| **C5** duplicate workers | Concurrent promotion attempts | `pg_advisory_xact_lock64` + `@@unique([vehicleId, sourceEventKey])` → one winner |
| **C6** native event races during promotion | Concurrent native persist + fallback promotion | Separate transactions; G2 vehicle lock serializes reconcile; promotion re-checks convergence |
| **C7** retry after crash | Any committed state | Idempotent on `(vehicleId, sourceEventKey)`; G2 idempotent reconcile |

**Removed impossible state:** Prior draft described C2 recovery for “VEE committed but PROMOTED not committed” — **invalid** when both mutations share TRANSACTION A. F5-PR2 tests MUST NOT assert that split state.

```
PROMOTION_DB_TRANSACTION_BOUNDARY_DEFINED = YES
PROMOTION_TRANSACTION_MODEL_DEFINED = YES
CRASH_RECOVERY_MODEL_DEFINED = YES
CONCURRENT_NATIVE_FALLBACK_MODEL_DEFINED = YES
POST_COMMIT_G2_RECOVERY_DEFINED = YES
IMPOSSIBLE_CRASH_STATES_REMOVED_FROM_CONTRACT = YES
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
| T13 | Late native after finalization (sticky enrichment) | No duplicate enrichment; lateSiblingConflict |
| T14 | Promotion transaction atomicity | VEE+PROMOTED commit together; no orphan VEE without PROMOTED |
| T15 | Crash before G2 handoff (post-commit) | Recovery enqueue |
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
| Late-native nondeterministic | **CLOSED** — L1–L11 + sticky enrichment §4.1 |
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

## 15. F5.0a micro-closure (2026-09-14)

Narrow documentation closure on PR #1641 before human review:

| Fix | Result |
|-----|--------|
| Exact-head evidence | Separated `F5_0_BASE_MAIN_SHA` / `F5_0_STARTING_HEAD` / `F5_0_FINAL_HEAD`; removed incorrect `BASE_MAIN_SHA = FINAL_HEAD` on main |
| Late-native post-enrichment | §4.1 sticky model; L4/L8/L9/L10/L11 deterministic; aligned with G2 CASE 1/5 + settlement design |
| Transaction boundary | TRANSACTION A (VEE+PROMOTED) vs post-commit G2/BullMQ; removed impossible C2 split state |
| Source identity | `SOURCE_EVENT_KEY_SCOPE=VEHICLE_GLOBAL`; `SYNTHETIC_ID_COLLISION_BEHAVIOR=FAIL_CLOSED` |
| Epistemic status | POLICY_DEFINED only; decisions remain PROPOSED until merge |

```
RFRF_F5_0A_POLICY_MICRO_CLOSURE = PASS
EXACT_HEAD_EVIDENCE_CONTRADICTION_RESOLVED = YES
```

---

## 16. F5.0b authority consistency (2026-09-14)

Corrected stale `EED-DEC-RFRF-010` Consequences scope (`L1–L8` → `L1–L11`). Authoritative late-native policy scope:

```
LATE_NATIVE_POLICY_SCOPE = L1–L11
RFRF_F5_0B_AUTHORITY_CONSISTENCY = PASS
STALE_L1_L8_CURRENT_AUTHORITY_REFERENCES = 0
```

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
