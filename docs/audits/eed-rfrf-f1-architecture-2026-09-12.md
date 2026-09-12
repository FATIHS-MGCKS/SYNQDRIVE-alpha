# RFRF F1 — Raw Fuel Refuel Fallback Architecture Discovery + Detection Contract

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F1 — Architecture Discovery + Detection Contract  
**Date:** 2026-09-12  
**Mode:** DESIGN / DISCOVERY ONLY — no production implementation, schema migration, deploy, or provider mutation  
**Base main SHA:** `1180221bdc736e8688761444dda5716fc48e7540` (includes merged KS MS 661 incident evidence, PR #1616)  
**Motivating incident:** `EED-EV-0040` / `FST-EVID-KS-MS-661-PRODUCTION-REFUEL-INCIDENT-2026-09-06-001`

---

## 0. Executive summary

KS MS 661 proves SynqDrive REFUEL creation is a **single point of failure** at DIMO native `segments(refuel)`. A confirmed +24 L absolute fuel rise with forecourt dwell produced **zero** native segments and **zero** `VehicleEnergyEvent` rows after six days.

RFRF adds a **SynqDrive raw-fuel fallback path** parallel to (not replacing) DIMO native REFUEL detection:

```
                     ┌─ DIMO native REFUEL ────────┐
fuel evidence ───────┤                              │
                     └─ SynqDrive raw-fuel fallback ┤
                                                    ↓
                                         canonical candidate
                                                    ↓
                                         VehicleEnergyEvent
                                                    ↓
                                         Physical Refuel G2
                                                    ↓
                                        station enrichment
```

**F1 deliverables:** current-path audit, provider-neutral candidate contract, identity recommendation, raw-rise detector contract, convergence policy, G2 handoff, recovery/scheduling, observability/SLO proposal, negative-fixture matrix, migration plan (design only), F2+ phased implementation plan.

---

## 1. Current refuel creation path (code audit)

### 1.1 Function chain

```
TripReconciliationScheduler (fast 15m | warm 4h | cold daily)
  → TripReconciliationService.reconcileWindow()
    → Step 5: EnergyEventsService.detectEnergyEvents(vehicleId, { from, to })
      → DimoSegmentsService.fetchEnergyEventSegments(tokenId, from, to)
        → GraphQL segments(mechanism: refuel, config: { minIncreasePercent: 5 })
        → parseDimoEnergyEventSegment()
      → isSegmentPersistable()          [fuelDeltaLiters > 1.0 for refuel]
      → coalesceSegments()              [5 min / 250 m refuel rules]
      → upsertSegment() per coalesced group
        → deriveRefuelObservation()     [post-persist enrichment only]
          → fetchFuelLevelSamples() + deriveRefuelFuelLevelRise()
        → prisma.vehicleEnergyEvent upsert by dimoSegmentId
      → pruneStaleSubSegments()
      → legacy sibling reconcile OR skip when G2 V2 enabled
      → PhysicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist() [G2, refuel only]
```

Alternate triggers: manual `POST …/energy-events/detect`; ops backfill scripts (still DIMO-segment sourced).

**Key files:**

| Concern | Path |
|---------|------|
| Detection orchestration | `backend/src/modules/vehicle-intelligence/energy-events/energy-events.service.ts` |
| Persist pipeline | `backend/src/modules/vehicle-intelligence/energy-events/energy-events.pipeline.ts` |
| Rise derivation (non-gating) | `backend/src/modules/vehicle-intelligence/energy-events/refuel-fuel-rise.ts` |
| DIMO segments | `backend/src/modules/dimo/dimo-segments.service.ts` |
| Segment query | `backend/src/modules/dimo/energy-event-segments.query.ts` |
| Production refuel config | `backend/src/modules/dimo/dimo-energy-detector.config.ts` |
| G2 runtime | `backend/src/modules/vehicle-intelligence/energy-events/physical-refuel-reconciliation-runtime.service.ts` |
| Schedulers | `backend/src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.scheduler.ts` |

### 1.2 Classification

| Field | Value |
|-------|-------|
| **CURRENT_REFUEL_EVENT_CREATION_REQUIRES_NATIVE_DIMO_SEGMENT** | **YES** |

Evidence: `detectEnergyEvents` has no branch that creates REFUEL without a parsed DIMO segment. `dimoSegmentId` is mandatory unique on insert. Raw fuel samples are used only for optional `fuelLevelRise*` enrichment after segment persist.

---

## 2. Existing raw-fuel capabilities inventory

### 2.1 Signal access

| Capability | Exists | Location | Used for REFUEL create? |
|------------|--------|----------|-------------------------|
| `fetchFuelLevelSamples()` | YES | `dimo-segments.service.ts:1414+` | NO (enrichment only) |
| `DimoFuelLevelSample` | YES | `{ timestamp, relativePercent, absoluteLiters }` | NO |
| `fetchFuelSummary()` | YES | `dimo-segments.service.ts:1249+` | NO (trip fuel consumption) |
| `deriveRefuelFuelLevelRise()` | YES | `refuel-fuel-rise.ts` | NO (enrichment only) |
| `powertrainFuelSystemAbsoluteLevel` | YES | DIMO GraphQL `signals()` | indirect |
| `powertrainFuelSystemRelativeLevel` | YES | DIMO GraphQL `signals()` | indirect |

| Field | Value |
|-------|-------|
| **RAW_ABSOLUTE_FUEL_ACCESS_EXISTS** | **YES** |
| **RAW_RELATIVE_FUEL_ACCESS_EXISTS** | **YES** |

### 2.2 `fetchFuelSummary()` refuel guard (trip consumption, not event detection)

```typescript
const refuelDetected =
  lastAbs.value - firstAbs.value > 2.0 && tripDurationMs >= 180_000;
const fuelUsedLiters = refuelDetected ? null : delta > 0 ? delta : 0;
```

| Field | Value |
|-------|-------|
| **EXISTING_FETCH_FUEL_SUMMARY_REFUEL_GUARD_EXISTS** | **YES** |

Semantics: window **first→last** absolute delta > 2 L AND duration ≥ 3 min → suppress trip fuel consumption (treat as in-trip refuel). Used by `trip-behavior-enrichment.service.ts`, not EED.

### 2.3 Reusable vs not directly reusable

| REUSABLE | NOT DIRECTLY REUSABLE |
|----------|------------------------|
| `fetchFuelLevelSamples()` auth/query path | Whole-window first→last delta as event detector |
| Sample normalization (`DimoFuelLevelSample`) | `fetchFuelSummary.refuelDetected` as REFUEL persistence gate |
| Provider JWT + gateway context | `deriveRefuelFuelLevelRise()` envelope algorithm (min/max index — misses mid-window consumption) |
| Robust helper patterns from `refuel-fuel-rise.ts` (materiality thresholds, noise tolerance concepts) | Trip-boundary-only scanning windows |

---

## 3. Why window start→end delta is insufficient

Example:

| Time | Fuel |
|------|------|
| 08:00 | 20 L |
| 10:00 refuel | 40 L |
| 14:00 | 34 L |

Window 08:00→14:00 yields 20→34 (+14 L) while physical event was 20→40 (+20 L).

**Required model:** `STABLE_PRE → LOCAL_RISE → STABLE_POST` on ordered samples.

Evaluate: ordered samples, rolling robust median, plateau detection, change-point/rise detection, post-rise persistence, outlier suppression, sample-gap limits, quantized gauge steps, slosh, single-sample spikes, sensor recalibration, ignition resets, delayed sensor response, rise continuing after departure.

| Field | Value |
|-------|-------|
| **EXISTING_FETCH_FUEL_SUMMARY_USABLE_AS_EVENT_DETECTOR** | **NO** |
| **RAW_RISE_DETECTOR_MODEL** | **STABLE_PRE → RISING → STABLE_POST finite-state detector with robust plateau median + bounded gap tolerance** |

Existing `deriveRefuelFuelLevelRise()` uses global min-before-max index — insufficient for mid-window local refuel inside longer windows with post-refuel consumption.

---

## 4. Provider-neutral refuel candidate contract

### 4.1 Type: `RawRefuelCandidate` (design contract)

| Field | Purpose |
|-------|---------|
| `source` | `DIMO_NATIVE` \| `SYNQDRIVE_RAW_FUEL_FALLBACK` |
| `vehicleId` | tenant-scoped vehicle |
| `organizationId` | org isolation |
| `sourceEventKey` | canonical deterministic identity (primary) |
| `evidenceFingerprint` | stable hash of ordered samples + detector version |
| `physicalEvidenceStart` | first sample of stable pre-plateau |
| `physicalEvidenceEnd` | last sample of stable post-plateau |
| `firstObservedAt` | **system observation time** (persist `createdAt`; never backdated to physical time) |
| `preFuelAbsolute` / `postFuelAbsolute` | liters when absolute channel valid |
| `deltaLiters` | post − pre (absolute) |
| `preFuelRelative` / `postFuelRelative` / `deltaPercent` | nullable; strengthen confidence only |
| `sampleCount` | usable samples in rise window |
| `prePlateauSampleCount` / `postPlateauSampleCount` | stability evidence |
| `maxSampleGap` | largest inter-sample gap in rise corridor |
| `riseDuration` | physical evidence rise duration |
| `confidence` | derived enum (HIGH/MEDIUM/LOW) |
| `routeEvidence` | optional stationary/dwell snapshot |
| `stationaryEvidence` | speed/ignition/odometer stability |
| `odometerEvidence` | optional km anchor |
| `rawSignalFingerprint` | ordered sample digest |
| `providerProvenance` | tokenId, query window, signal names |
| `detectionVersion` | e.g. `rfrf-rise-v1` |
| `rejectionReason` | when held/rejected |
| `detectionMechanism` | maps to persisted `detectionMechanism` string |

Candidate must support native promotion and fallback without provider-specific fields leaking into generic comparison (G2 matcher uses fuel transition evidence, not segment ID format).

| Field | Value |
|-------|-------|
| **PROVIDER_NEUTRAL_CANDIDATE_CONTRACT_DEFINED** | **YES** |

---

## 5. Database identity — critical design decision

### 5.1 Current constraint

```prisma
dimoSegmentId String @unique  // mandatory, provider-shaped today
```

Native IDs: `dimo-refuel-{tokenId}-{startMs}` or coalesced variant.

Fallback has **no natural DIMO segment ID**.

### 5.2 Options compared

| Option | Semantic correctness | Migration complexity | Dedupe / idempotency | G2 compat | Rollback |
|--------|---------------------|----------------------|----------------------|-----------|----------|
| **A** Synthetic namespaced `dimoSegmentId` | LOW (misnamed column) | LOW | GOOD if fingerprint stable | HIGH (no schema change) | EASY |
| **B** Nullable `dimoSegmentId` + `detectionSource` + `sourceEventKey` | HIGH | HIGH (NOT NULL drop, code sweep) | BEST | MEDIUM (code migration) | HARD |
| **C** Add `detectionSource` + `sourceEventKey`; keep `dimoSegmentId` required with namespaced fallback IDs | MEDIUM-HIGH | MEDIUM | GOOD | HIGH | MEDIUM |
| **D** Separate `RawRefuelCandidate` table + promotion | HIGH | HIGH | GOOD (two-phase) | MEDIUM | MEDIUM |

### 5.3 Recommendation (superseded by F1.1 — see addendum)

**F1 original:** Option C. **F1.1 revision:** **Option D** — see `docs/audits/eed-rfrf-f1-1-hardening-2026-09-12.md` §3.

F1.1 recommends **`RawRefuelCandidate` lifecycle table → promote to `VehicleEnergyEvent`** because:

- SETTLING / OBSERVED states require persistence before promotion
- `candidateIdentityKey` must be immutable while `evidenceRevisionFingerprint` matures
- Synthetic `dimoSegmentId` compatibility is **NOT_PROVEN** repo-wide (legacy sibling regex)

Promotion still adds to `VehicleEnergyEvent`:

- `detectionSource` = `SYNQDRIVE_RAW_FUEL_FALLBACK`
- `sourceEventKey` = stable `candidateIdentityKey`
- `dimoSegmentId` = `synqdrive-rfrf-{vehicleId}-{hash(candidateIdentityKey)}` (upsert key only; derived from **stable** identity, never from revision fingerprint)

---

## 6. Raw fuel rise detector contract

### 6.1 State machine

```
INSUFFICIENT → STABLE_PRE → RISING → STABLE_POST → CANDIDATE_READY
                    ↓           ↓          ↓
                 REJECT     REJECT     REJECT (fail-closed)
```

### 6.2 Proposed thresholds (epistemic labels)

| Threshold | Proposed value | Label |
|-----------|----------------|-------|
| Minimum absolute rise | ≥ 5 L | **PROVISIONAL** (persist gate today is >1 L on native segment; fallback should be stricter) |
| Minimum relative rise (when available) | ≥ 5 % | **PROVISIONAL** |
| Minimum pre-plateau samples | ≥ 3 consecutive within ±0.5 L | **INFERRED** |
| Minimum post-plateau samples | ≥ 3 consecutive within ±0.5 L | **INFERRED** |
| Maximum sample gap in rise corridor | ≤ 6 min | **PROVISIONAL / INCIDENT_ANCHORED** (KS MS 661 max gap ~4.5 min — not fleet-calibrated) |
| Maximum intra-rise negative wobble | ≤ 1 L single-step | **INFERRED** |
| Minimum post-rise persistence | post plateau ≥ 2 min | **INFERRED** |
| Minimum rise duration | ≥ 30 s | **INFERRED_FROM_EXISTING_CODE** (`refuel-fuel-rise.ts` constant; not independently validated for fallback) |
| Maximum rise duration | ≤ 45 min | **PROVISIONAL** |
| Quantized gauge step tolerance | ±1 L | **INFERRED** |

Fail-closed on: slosh while driving, single-sample spike, sensor reset jump (monotonicity break > threshold), ignition recalibration pattern, gradual drift without plateau.

### 6.3 Absolute-only path

| Field | Value |
|-------|-------|
| **CAN_ABSOLUTE_FUEL_ALONE_SUPPORT_FALLBACK** | **YES** |
| **ABSOLUTE_FUEL_ONLY_FALLBACK_SUPPORTED_BY_DESIGN** | **YES** |

Mandatory gates for absolute-only:

1. Vehicle capability class = `ABSOLUTE_ONLY` or `ABSOLUTE_AND_RELATIVE`
2. Absolute unit contract trusted for vehicle (see §8)
3. Pre/post plateau evidence on absolute channel
4. Material rise on absolute channel (not relative)
5. Relative absence must **not** block if absolute gates pass

Relative fuel may increase confidence but is **not mandatory**.

---

## 7. Absolute fuel unit vs signal trust (F1.1 separated)

| Claim | Field | Status |
|-------|-------|--------|
| DIMO GraphQL `powertrainFuelSystemAbsoluteLevel` semantic unit | `ABSOLUTE_FUEL_UNIT` | **LITERS** (SynqDrive mapping) |
| Vehicle/OEM reliable absolute signal for fallback | `ABSOLUTE_SIGNAL_TRUST` | **TRUSTED \| UNTRUSTED \| UNKNOWN** per capability profile |

**UNKNOWN → fail closed.** Liters unit ≠ trusted vehicle signal.

| Field | Value |
|-------|-------|
| **ABSOLUTE_FUEL_UNIT_CONTRACT** | **CONFIRMED_LITERS** (signal field semantics) |
| **ABSOLUTE_FUEL_UNIT_SEPARATED_FROM_SIGNAL_TRUST** | **YES** |

---

## 8. Vehicle signal capability model

| Class | Fallback eligibility |
|-------|---------------------|
| `ABSOLUTE_AND_RELATIVE` | Full fallback; relative strengthens confidence |
| `ABSOLUTE_ONLY` | Absolute-liter detector (KS MS 661 class) |
| `RELATIVE_ONLY` | Relative-rise detector variant; no absolute path |
| `NO_RELIABLE_FUEL_SIGNAL` | No fallback |
| `UNKNOWN` | Fail closed until classified |

Capability derived from: observed signal presence rate, DIMO device profile, OEM integration metadata, ops validation flags. Never hardcode org/vehicle IDs.

---

## 9. Physical corroboration

Raw fuel rise alone may be sensor correction. Corroboration ** strengthens confidence**; absence fails closed only when motion conflict detected.

| Evidence | Role |
|----------|------|
| Vehicle stopped / low speed | confidence + |
| Trip stop/start boundary | confidence + |
| Ignition state | confidence + |
| Odometer stability | confidence + |
| Route dwell (stationary segment) | confidence + |
| OSM station proximity | confidence + (enrichment-oriented) |

| Field | Value |
|-------|-------|
| **ROUTE_DWELL_HARD_REQUIREMENT** | **NO** |
| **OSM_STATION_HARD_REQUIREMENT** | **NO** |

Private depot, company station, mobile fuel, unmapped station must remain valid (KS MS 661 Esso was corroborated but OSM must not be existence gate).

---

## 10. Temporal sensor lag

Fuel rise may begin/continue after leaving forecourt. **Default:** fuel-rise GPS ≠ physical refuel coordinate.

Fallback candidate must attach:

- `LAST_RELEVANT_STATIONARY_DWELL_BEFORE_RISE` (bounded backward search, e.g. 30 min)
- rise window timestamps for G2 coordinate policy (do not change V2 coordinate policy in F1)

G2 continues to select coordinates from route evidence; fallback supplies temporal context in `rawDetectionMeta` + candidate fields.

---

## 11. KS MS 661 offline fixtures (F1.1 split)

| File | Kind |
|------|------|
| `ks-ms-661-2026-09-06-refuel-observed.fixture.ts` | **OBSERVED** — audit-confirmed samples only |
| `ks-ms-661-2026-09-06-refuel-synthetic.fixture.ts` | **SYNTHETIC** — interpolated rise for algorithm tests |

Observed anchors (audit §6):

- Pre plateau 7 L (09:28:30–09:35:00Z, 30 s cadence)
- 16.4 L @ 09:39:30Z
- 31 L @ 09:43:00Z and 09:47:00Z
- ~4.5 min gap (no fabricated fill)
- Relative NULL; native segments []

Production incident evaluation uses **observed fixture only**. Synthetic fixture is for F3 state-machine unit tests.

Synthetic fixture IDs only — provenance via `EED-EV-0040` constants.

| Field | Value |
|-------|-------|
| **KS_MS_661_OFFLINE_POSITIVE_FIXTURE** | **CREATED** (observed + synthetic split) |

---

## 12. Negative fixture matrix (design — F3 test plan)

| # | Scenario | Expected outcome |
|---|----------|------------------|
| 1 | Isolated +3 L spike → immediate revert | REJECT `RISE_NOT_STABLE` |
| 2 | Fuel slosh while driving | REJECT `MOTION_EVIDENCE_CONFLICT` or `RISE_NOT_STABLE` |
| 3 | Ignition/reset calibration jump | REJECT `SENSOR_RESET_SUSPECTED` |
| 4 | One sample only | REJECT `INSUFFICIENT_PRE_PLATEAU` |
| 5 | No valid pre plateau | REJECT `INSUFFICIENT_PRE_PLATEAU` |
| 6 | No valid post plateau | REJECT `INSUFFICIENT_POST_PLATEAU` |
| 7 | Giant sample gap (>6 min in rise) | REJECT `SAMPLE_GAP_TOO_LARGE` |
| 8 | Gradual sensor drift | REJECT `RISE_TOO_SMALL` / no plateau |
| 9 | Normal fuel consumption (monotonic decrease) | NO CANDIDATE |
| 10 | Noisy parked gauge (±1 L) | NO CANDIDATE or REJECT `RISE_TOO_SMALL` |
| 11 | Two refuels close in time | TWO candidates or one merged (policy: DISTINCT if separated plateaus) |
| 12 | Native event already covers fill | REJECT `DUPLICATE_NATIVE_EVIDENCE` |
| 13 | Fallback first, native sibling later | CONVERGE → G2 SAME → one canonical enrichment |
| 14 | Two vehicles same timestamp | NO cross-vehicle merge (tenant isolation) |
| 15 | Route missing | CANDIDATE allowed if fuel evidence sufficient (lower confidence) |
| 16 | Route teleport/discontinuity | REJECT or LOW confidence hold |
| 17 | Private/unmapped station | CANDIDATE allowed (no OSM gate) |
| 18 | ABSOLUTE_ONLY vehicle | CANDIDATE on absolute path |
| 19 | RELATIVE_ONLY vehicle | CANDIDATE on relative path only |
| 20 | UNKNOWN signal unit | REJECT `UNIT_NOT_TRUSTED` |
| 21 | EV / non-fuel vehicle | REJECT `VEHICLE_CAPABILITY_UNSUPPORTED` |
| 22 | Hybrid edge case | capability-specific branch; fail closed if ambiguous |

| Field | Value |
|-------|-------|
| **NEGATIVE_FIXTURE_MATRIX** | **COMPLETE** (design matrix; F3 implements as test fixtures) |

---

## 13. Native + fallback coexistence

**Invariant:** one physical refuel → at most one canonical enrichment owner.

Policy:

1. Fallback persists `VehicleEnergyEvent` with `detectionSource=SYNQDRIVE_RAW_FUEL_FALLBACK`
2. Later native segment arrives → G2 identity matcher (`compareCanonicalRefuelCandidates`) evaluates SAME / DISTINCT / INSUFFICIENT
3. SAME → merge reconciliation group; native row may supersede metadata; **one** enrichment job
4. DISTINCT → two enrichments (rare; separated physical events)
5. Do **not** disable fallback globally when unrelated native segment exists in broad window — evaluate **per candidate** overlap on fuel transition + time

| Field | Value |
|-------|-------|
| **NATIVE_FALLBACK_DUPLICATION_GUARD_DEFINED** | **YES** |

Reuse G2 `physical-refuel-identity.matcher.ts` dimensional-safe liter/percent comparison.

---

## 14. G2 handoff

**Forbidden:** raw fallback → direct enrichment / BullMQ station resolver.

**Required chain:**

```
raw rise detector → RawRefuelCandidate → VehicleEnergyEvent upsert
  → PhysicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist()
  → settlement / finality / coordinate selection
  → enrichment eligibility → BullMQ → station resolver
```

**Existing entry point:** `EnergyEventsService.upsertSegment()` → `physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist({ vehicleId, triggerEventId: row.id, … })`

**G2 currently assumes (via `vehicleEnergyEventToRefuelRow`):**

- `startTime`, `endTime`, `durationSeconds`
- `fuelDeltaLiters`, `fuelDeltaPercent`
- `rawDetectionMeta.fuelStartLiters/fuelEndLiters/…`
- `dimoSegmentId` (identity string — will carry namespaced fallback id)
- `createdAt` as `firstObservedAt` (`buildFirstObservedAtById`)

Fallback persist must populate equivalent fields from candidate; `detectionMechanism` = `synqdrive_raw_fuel_fallback`.

| Field | Value |
|-------|-------|
| **G2_HANDOFF_DEFINED** | **YES** |

---

## 15. firstObservedAt contract

| Concept | Authority |
|---------|-----------|
| Physical refuel time | `physicalEvidenceStart/End`, `startTime/endTime` on event |
| System first observation | `VehicleEnergyEvent.createdAt` (preserved on upsert update) |

**Do not backdate** `createdAt` or settlement clocks to ground-truth refuel time. Matches `physical-refuel-row.mapper.ts` and G2 settlement design.

| Field | Value |
|-------|-------|
| **FIRST_OBSERVED_AT_CONTRACT_DEFINED** | **YES** |

---

## 16. Recovery / scheduling (F1.1 corrected)

### 16.1 Recommendation

```
WINDOW_LEVEL_NATIVE_SUPPRESSION = FORBIDDEN
PER_CANDIDATE_NATIVE_FALLBACK_CONVERGENCE = REQUIRED
```

**Primary flow:**

```
fetch native REFUEL candidates
+
fetch raw fuel samples
→ detect raw candidates (all rises)
→ per-candidate SAME / DISTINCT / INSUFFICIENT vs native + persisted
→ promote READY_FOR_PERSIST only
```

Raw fallback scan runs for fuel-capable vehicles under RFRF flag — **never** gated on `nativePersistableCount === 0` for the window.

Reuse reconciliation Step 5 windows (fast 15 min / warm 4 h) — no new scheduler in F1.

See F1.1 addendum §1 for counterexample proof.

### 16.2 Cost estimate (PROVISIONAL)

| Parameter | Estimate |
|-----------|----------|
| Extra query | 1× `signals()` 30s interval per vehicle per reconcile window |
| Fast repair cohort | activity-tier vehicles only (~subset) |
| Warm pass | all DIMO-connected vehicles / 4 h |
| Window width | matches reconcile window (45 min – 12 h) |
| Multi-replica | same as today — reconciliation mutex / leader patterns |

| Field | Value |
|-------|-------|
| **RECOVERY_STRATEGY_DEFINED** | **YES** |

---

## 17. Delayed telemetry lifecycle (F1.2 corrected)

Four concepts — **never conflate**:

| Concept | Role |
|---------|------|
| **`RawRefuelCandidate.id`** | DB surrogate row identity (immutable UUID/cuid) |
| **`candidateIdentityKey`** | Deterministic auditable key; assigned at first OBSERVED lock; immutable thereafter |
| **`evidenceRevisionFingerprint`** | Mutable digest of current sample maturity; audit + SETTLING detection |
| **Physical candidate matcher** | Semantic rediscovery under delayed telemetry (not hash equality alone) |

**Rediscovery (F1.2):** Under per-vehicle lock, search non-terminal rows by vehicle, channel, detector compatibility, temporal neighborhood, and compatible pre-plateau evidence. Reuse row on semantic overlap; preserve `candidateIdentityKey`. Insert only when no overlap.

Full contract + worked examples: F1.1 addendum §2.4–§2.5, §14.

---

## 18. Fail-closed rejection reasons

`INSUFFICIENT_PRE_PLATEAU`, `INSUFFICIENT_POST_PLATEAU`, `RISE_TOO_SMALL`, `SAMPLE_GAP_TOO_LARGE`, `RISE_NOT_STABLE`, `SENSOR_RESET_SUSPECTED`, `UNIT_NOT_TRUSTED`, `VEHICLE_CAPABILITY_UNSUPPORTED`, `MOTION_EVIDENCE_CONFLICT`, `DUPLICATE_NATIVE_EVIDENCE`, `EVIDENCE_STILL_SETTLING`, `DUPLICATE_FALLBACK_EVIDENCE`, `NON_FUEL_POWERTRAIN`.

Weak evidence must not become fabricated REFUEL.

---

## 19. Multi-replica / idempotency

Reuse patterns from G2 + F1.2 rediscovery:

- **`RawRefuelCandidate.id`** — DB row identity
- **`candidateIdentityKey`** — immutable after first assignment (not sole insert gate)
- **Semantic rediscovery matcher** — prevents duplicate rows under delayed telemetry
- PostgreSQL advisory locks per `(vehicleId, reconciliation|detection scope)` during detect/persist
- Promotion upsert by `sourceEventKey` / namespaced `dimoSegmentId` (compatibility proof pending F2/F5)
- No cross-vehicle merge
- BullMQ job idempotency via existing enrichment fingerprint gates

| Field | Value |
|-------|-------|
| **MULTI_REPLICA_STRATEGY_DEFINED** | **YES** (design) |
| **IMPLEMENTATION_IDEMPOTENCY_PROOF** | **PENDING_F2** |

---

## 20. Observability contract (pre-implementation)

| Metric | Type |
|--------|------|
| `raw_refuel_scan_runs_total` | counter |
| `raw_refuel_rise_detected_total` | counter |
| `raw_refuel_candidate_detected_total` | counter |
| `raw_refuel_candidate_rejected_total{reason}` | counter |
| `raw_rise_without_native_segment_total` | counter |
| `fallback_vehicle_event_created_total` | counter |
| `fallback_native_late_sibling_total` | counter |
| `raw_refuel_detection_latency_seconds` | histogram |
| `fuel_absolute_signal_missing_total` | counter |
| `fuel_relative_signal_missing_total` | counter |
| `fuel_signal_stale_total` | counter |
| `fallback_processing_errors_total` | counter |

**Alert (P1 class):** material raw fuel rise detected + no `VehicleEnergyEvent` REFUEL after expected recovery horizon (e.g. 2× warm reconcile + fast repair cycles). KS MS 661 would have fired this alert.

| Field | Value |
|-------|-------|
| **OBSERVABILITY_CONTRACT_DEFINED** | **YES** |

---

## 21. Product SLO proposal (PROVISIONAL — not fleet-calibrated)

| Stage | Target | Max acceptable | Alert threshold | Basis |
|-------|--------|----------------|-----------------|-------|
| Physical refuel → candidate detected | ≤ 30 min | ≤ 4 h | > 4 h | Fast repair + warm cadence |
| Candidate → VehicleEnergyEvent | ≤ 15 min (same reconcile pass) | ≤ 4 h | > 4 h | Same-window persist design |
| VehicleEnergyEvent → G2 finality | ≤ 2 h | ≤ 24 h | > 24 h | G2 settlement horizon (existing) |
| Finality → UI-visible | ≤ 5 min | ≤ 1 h | > 1 h | API read path |

| Field | Value |
|-------|-------|
| **PRODUCT_SLO_DEFINED** | **YES** (PROVISIONAL labels) |

---

## 22. Feature flags (defaults OFF)

| Flag | Default | Purpose |
|------|---------|---------|
| `RAW_FUEL_REFUEL_FALLBACK_ENABLED` | `false` | Master gate |
| `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` | `false` | Observation-only vs persist authority |
| `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` | unset | No historical mass backfill |

| Field | Value |
|-------|-------|
| **FEATURE_FLAG_DEFAULT** | **OFF** |
| **HISTORICAL_MASS_BACKFILL** | **NO** |

---

## 23. Migration plan (design only — F2)

1. Add enum `EnergyEventDetectionSource { DIMO_NATIVE, SYNQDRIVE_RAW_FUEL_FALLBACK }`
2. Add columns `detection_source`, `source_event_key` to `vehicle_energy_events`
3. Backfill existing rows: `DIMO_NATIVE`, `source_event_key = dimo_segment_id`
4. Add `@@unique([vehicleId, sourceEventKey])`
5. Index `(vehicleId, detectionSource, startTime)`
6. Zero-downtime: deploy code reading new columns with default native before enabling fallback flag
7. Rollback: disable flags; native path unchanged

---

## 24. Test strategy (F3+)

See §12 negative matrix +:

- UNIT: raw rise detector pure functions
- PROPERTY: ordering, duplicates, window shift invariance where applicable
- FIXTURE: KS MS 661 positive
- INTEGRATION: PG persist, dual replica, fallback→native convergence, G2 handoff, no BullMQ before finality
- REGRESSION: native DIMO REFUEL unchanged, RECHARGE unchanged, trip fuel consumption unchanged

---

## 25. Decision matrix (§28)

### A. Provider-neutral candidate model

| | |
|--|--|
| **OPTIONS** | Inline struct vs shared package vs candidate table (Option D) |
| **PROS** | Shared contract enables native/fallback convergence |
| **CONS** | Extra mapping layer to VehicleEnergyEvent |
| **RISK** | LOW |
| **RECOMMENDATION** | Shared `RawRefuelCandidate` TypeScript contract; persist directly to VehicleEnergyEvent in F4 |
| **EPISTEMIC STATUS** | PROPOSED |

### B. VehicleEnergyEvent identity model

| | |
|--|--|
| **OPTIONS** | A synthetic dimoSegmentId / B nullable / C hybrid / D staging table |
| **PROS** | D provides SETTLING lifecycle + stable `candidateIdentityKey` before promotion |
| **CONS** | Extra table + promotion contract; synthetic `dimoSegmentId` compatibility NOT_PROVEN fleet-wide |
| **RISK** | MEDIUM |
| **RECOMMENDATION** | **Option D** (F1.1 supersedes F1 Option C) |
| **EPISTEMIC STATUS** | PROPOSED |

### C. Raw rise algorithm

| | |
|--|--|
| **OPTIONS** | Window delta / min-max rise / STABLE_PRE→RISING→STABLE_POST FSM |
| **PROS** | FSM handles mid-window refuel + post-refuel consumption |
| **CONS** | More complex; needs fleet calibration |
| **RISK** | MEDIUM |
| **RECOMMENDATION** | **STABLE_PRE→RISING→STABLE_POST FSM** |
| **EPISTEMIC STATUS** | PROPOSED |

### D. Capability model

| | |
|--|--|
| **OPTIONS** | Ad hoc per vehicle / enum capability classes |
| **PROS** | Prevents absolute detector on untrusted units |
| **CONS** | Requires classification pipeline |
| **RISK** | MEDIUM |
| **RECOMMENDATION** | **Enum capability classes with UNKNOWN fail-closed** |
| **EPISTEMIC STATUS** | PROPOSED |

### E. Route/dwell corroboration

| | |
|--|--|
| **OPTIONS** | Hard OSM gate / hard dwell gate / soft confidence |
| **PROS** | Soft confidence preserves depot/unmapped refuels |
| **CONS** | Higher false-positive risk without dwell |
| **RISK** | MEDIUM |
| **RECOMMENDATION** | **Soft confidence only; OSM never hard gate** |
| **EPISTEMIC STATUS** | PROPOSED |

### F. Native/fallback convergence

| | |
|--|--|
| **OPTIONS** | Global disable / per-candidate G2 matcher / delete fallback on native |
| **PROS** | G2 matcher already production-validated for siblings |
| **CONS** | Late native requires recovery policy |
| **RISK** | MEDIUM |
| **RECOMMENDATION** | **Per-candidate G2 SAME/DISTINCT/INSUFFICIENT** |
| **EPISTEMIC STATUS** | CONFIRMED direction (matcher exists) |

### G. Scheduling/recovery

| | |
|--|--|
| **OPTIONS** | New scheduler / extend detectEnergyEvents / trip-complete hook |
| **PROS** | Reuse reconcile windows avoids proliferation |
| **CONS** | Couples fallback to reconcile cadence |
| **RISK** | LOW |
| **RECOMMENDATION** | **Extend Step 5 detectEnergyEvents** |
| **EPISTEMIC STATUS** | PROPOSED |

### H. Feature flags

| | |
|--|--|
| **OPTIONS** | Single flag / dual observe+persist flags |
| **PROS** | Dual flags enable shadow mode |
| **CONS** | Operational complexity |
| **RISK** | LOW |
| **RECOMMENDATION** | **Dual flags + cutover timestamp** |
| **EPISTEMIC STATUS** | PROPOSED |

### I. Schema migration

| | |
|--|--|
| **OPTIONS** | Option D staging table + promotion fields on VehicleEnergyEvent |
| **PROS** | Native rows unchanged; identity stable across delayed telemetry |
| **CONS** | Requires coordinated F2 deploy + G2 compatibility proof |
| **RISK** | MEDIUM |
| **RECOMMENDATION** | **Additive F2 migration per §23 + F1.1 §3** |
| **EPISTEMIC STATUS** | PROPOSED |

### J. Observability/SLO

| | |
|--|--|
| **OPTIONS** | Ad hoc logs / structured metrics + alert |
| **PROS** | KS MS 661 class detectable pre-UI |
| **CONS** | Thresholds PROVISIONAL until fleet data |
| **RISK** | LOW |
| **RECOMMENDATION** | **Metrics in §20 + PROVISIONAL SLOs §21** |
| **EPISTEMIC STATUS** | PROPOSED |

---

## 26. F2+ implementation plan

| Phase | Scope |
|-------|-------|
| **F2** | `raw_refuel_candidates` lifecycle table + promotion contract; `detectionSource`, `sourceEventKey`; flag scaffolding |
| **F3** | Pure raw-rise detector + KS MS 661 observed + synthetic fixture unit tests |
| **F4** | Fallback candidate persistence path in `detectEnergyEvents` (flag-gated) |
| **F5** | Native/fallback convergence via G2 matcher + late sibling policy + integration matrix |
| **F6** | G2 handoff validation; populate `rawDetectionMeta` compatibility |
| **F7** | Recovery integration (fast/warm windows); observation-only mode |
| **F8** | Observability metrics + alert rules |
| **F9** | PostgreSQL + multi-replica integration tests |
| **F10** | Production rollout gate; cutover timestamp; operator runbook |

| Field | Value |
|-------|-------|
| **F1_ARCHITECTURE_COMPLETE** | **YES** |
| **F2_START_AUTHORIZED** | **YES** |
| **F2_IMPLEMENTATION_COMPLETE** | **NO** |
| **FALLBACK_RUNTIME_READY** | **NO** |
| **PRODUCTION_FALLBACK_READY** | **NO** |

See F1.1 addendum §12–§14 for readiness semantics (F1.2 decouples F2 start from F2 completion).

---

## 27. Architecture blockers

| Severity | Count | Description |
|----------|-------|-------------|
| P0 | 0 | — |
| P1 | 1 | Missing raw fallback in production (KS MS 661) — F2 authorized to implement Option D |

---

## 28. Scope attestation

| Field | Value |
|-------|-------|
| RUNTIME_BEHAVIOR_CHANGED | NO |
| BACKEND_SOURCE_TREE_CHANGED | YES (fixture files only) |
| FIXTURE_ONLY | YES |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_DEPLOYED | NO |

---

## 29. Canonical graph references

- **EED:** `EED-EV-0041` (this F1 document), `EED-EV-0042` (F1.1 hardening), `EED-DEC-RFRF-001` … `EED-DEC-RFRF-005`
- **Motivates from:** `EED-EV-0040`
- **FST cross-ref:** `FST-EVID-RFRF-F1-2026-09-12-001`, `FST-EVID-RFRF-F1-1-2026-09-12-001`

---

## 30. F1.1 hardening addendum (2026-09-12)

Independent review closure — **design / documentation / test-fixture only**:

| Correction | Reference |
|------------|-----------|
| Window-level native suppression forbidden | F1.1 §1 |
| `candidateIdentityKey` vs `evidenceRevisionFingerprint` | F1.1 §2 |
| Option D recommended (Option C superseded) | F1.1 §3 |
| EED-OQ-013 resolved (design) | F1.1 §4 |
| Candidate semantic rediscovery | F1.1 §2.4–§2.5, §14 |
| F2 readiness semantics decoupled | F1.1 §12, §14 |

**Canonical addendum:** `docs/audits/eed-rfrf-f1-1-hardening-2026-09-12.md`

---

## 31. F1.2 final closure (2026-09-12)

Merged in PR #1619 — architecture/fixtures only; no runtime implementation.

| Field | Value |
|-------|-------|
| **RFRF_F1_FINAL_CLOSURE** | **PASS** |
| **CANDIDATE_REDISCOVERY_DESIGN** | **PASS** |
| **DELAYED_TELEMETRY_IDENTITY_DESIGN** | **PASS** |
| **IMPLEMENTATION_IDEMPOTENCY_PROOF** | **PENDING_F2** |
