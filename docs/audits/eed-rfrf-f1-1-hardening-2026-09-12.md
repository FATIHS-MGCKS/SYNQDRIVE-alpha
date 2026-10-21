# RFRF F1.1 — Architecture Hardening + Pre-F2 Closure

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F1.1 — Hardening addendum to F1  
**Date:** 2026-09-12  
**Parent document:** `docs/audits/eed-rfrf-f1-architecture-2026-09-12.md`  
**Draft PR:** #1619  
**Mode:** DESIGN / DOCUMENTATION / TEST-FIXTURE ONLY

---

## 1. Window-level fallback contradiction — CORRECTED

### 1.1 Problem (F1 §16 defect)

F1 §16 previously implied:

> run raw fallback only after native segment fetch returns **zero persistable refuel segments for the entire reconcile window**

This contradicts F1 §13 per-candidate convergence and fails the counterexample:

| Time | Event | Native | Fallback needed |
|------|-------|--------|-----------------|
| 10:00 | Refuel A | detected | no |
| 10:30 | Refuel B | **missed** | **yes** |

If `nativePersistableCount === 0` gates fallback → B disappears when A exists.

### 1.2 Required architecture (corrected)

```
WINDOW_LEVEL_NATIVE_SUPPRESSION = FORBIDDEN
PER_CANDIDATE_NATIVE_FALLBACK_CONVERGENCE = REQUIRED
```

**Preferred flow (Option A — correctness first):**

```
fetch native REFUEL candidates (window)
+
fetch raw fuel samples (window)
→ detect raw REFUEL candidates (all rises in window)
→ for each raw candidate:
      compare vs native candidates + persisted rows
      via physical identity (SAME / DISTINCT / INSUFFICIENT)
→ persist only unmatched physical fills
```

Fallback scanning runs for **fuel-capable vehicles** whenever `RAW_FUEL_REFUEL_FALLBACK_ENABLED=true`. It is **never** disabled because unrelated native segments exist in the same window.

**Option B (optimization):** May skip raw scan only for time sub-ranges **proven** covered by a native candidate's physical identity envelope. Proof obligation is on the optimizer; default implementation uses Option A.

---

## 2. Event identity vs evidence revision — SEPARATED

### 2.1 Problem

F1 §17 proposed a single `evidenceFingerprint` including mutable fields (`postPlateauMedian`, `riseEndBucket`). Delayed telemetry would change the fingerprint → new `sourceEventKey` / `dimoSegmentId` → duplicate events.

### 2.2 Four explicit concepts (F1.2)

| Concept | Purpose | Mutability |
|---------|---------|------------|
| **`RawRefuelCandidate.id`** | Database surrogate row identity | **Immutable** (UUID/cuid assigned at insert) |
| **`candidateIdentityKey`** | Deterministic auditable candidate key; assigned at first row lock | **Immutable once assigned** |
| **`evidenceRevisionFingerprint`** | Audit/debug digest of current evidence maturity | **Updates** on every reconciliation pass |
| **Physical candidate matcher** | Semantic rediscovery / convergence logic | **Algorithm** — not a stored hash |

**Rule:** Do not overload one hash with all four responsibilities.

**Rediscovery rule (F1.2):** `candidateIdentityKey` MUST NOT be the sole mechanism for deciding whether to create a new row. New rows require failed semantic overlap search against existing non-terminal candidates.

### 2.3 `candidateIdentityKey` algorithm (assigned at first OBSERVED lock)

Inputs at first **OBSERVED** lock (after rise onset detected, pre-plateau stable):

```
candidateIdentityKey = hash(
  vehicleId,
  detectionVersion,
  signalChannel,           // ABSOLUTE_LITERS | RELATIVE_PERCENT
  prePlateauBucket,        // round(prePlateauMedian, 1L) or round(prePlateauMedian, 1%)
  riseOnsetBucketUtc,      // floor(riseOnsetTimestamp, 5 min UTC)
)
```

**NOT included:** post-plateau level, rise end, sample count, window bounds.

**Important:** If delayed telemetry would change `riseOnsetBucketUtc`, the row is **rediscovered by semantic matcher**, not by recomputing hash equality alone.

### 2.4 Option D rediscovery flow (F1.2)

Under **per-vehicle transaction / advisory lock**:

```
1. Detect provisional raw rise from current evidence
2. Search existing non-terminal RawRefuelCandidate rows for same:
     - vehicleId
     - signalChannel
     - detector family/version compatibility
     - bounded temporal neighborhood around physical rise
     - compatible pre-fuel plateau / transition evidence
3. If semantic overlap → REUSE row (preserve candidateIdentityKey)
4. Update only: evidenceRevisionFingerprint, evidence envelope,
   maturity state, post plateau, latest observation metadata
5. INSERT new row only when no existing candidate satisfies overlap contract
6. Two genuinely separate rises remain DISTINCT
```

```
candidateIdentityKey     = immutable identity AFTER candidate row assignment
evidenceRevisionFingerprint = mutable evidence digest
candidate rediscovery    = semantic lookup, NOT blind hash equality
```

**Promotion mapping (Option D):**

- `RawRefuelCandidate.id` — DB lifecycle identity
- `RawRefuelCandidate.candidateIdentityKey` — assigned at OBSERVED lock, never changes on rediscovery
- `RawRefuelCandidate.evidenceRevisionFingerprint` — updated each scan
- On promotion: `VehicleEnergyEvent.sourceEventKey = candidateIdentityKey`
- `VehicleEnergyEvent.dimoSegmentId = synqdrive-rfrf-{vehicleId}-{hash(candidateIdentityKey)}` (opaque upsert key only; compatibility proof pending F2/F5)

### 2.5 Delayed telemetry worked examples (F1.2)

| # | Scenario | Rediscovery | candidateIdentityKey | evidenceRevisionFingerprint |
|---|----------|-------------|---------------------|----------------------------|
| A | Post plateau 29 L → 31 L | EXISTING | **UNCHANGED** | CHANGES |
| B | Rise end shifts +6 min | EXISTING | **UNCHANGED** | CHANGES |
| C | Earlier sample shifts rise onset into previous 5-min bucket | **EXISTING CANDIDATE REDISCOVERED** | **UNCHANGED** | CHANGES |
| D | Reconcile window shifts +15 min | EXISTING | **UNCHANGED** | may CHANGE |
| E | Duplicate raw samples arrive | EXISTING (dedupe before matcher) | **UNCHANGED** | unchanged if identical |
| F | Same refuel: fast pass then warm pass | EXISTING | **UNCHANGED** | may CHANGE |
| G | Two refuels 45 min apart | NEW row (no overlap) | **DIFFER** (separate rows) | independent |

**Case C contract:** Semantic matcher finds same physical rise despite bucket boundary shift → reuse row; do **not** auto-create duplicate.

| Field | Value |
|-------|-------|
| **CANDIDATE_REDISCOVERY_DESIGN** | **PASS** |
| **DELAYED_TELEMETRY_IDENTITY_DESIGN** | **PASS** |
| **IMPLEMENTATION_IDEMPOTENCY_PROOF** | **PENDING_F2** |

Do **not** call runtime identity stability PROVEN until F2 implements rediscovery under lock.

---

## 3. Identity model re-evaluation — Option D recommended

F1 Option C tied `dimoSegmentId` to mutable fingerprint — **rejected in F1.1**.

| Option | F1.1 verdict |
|--------|--------------|
| **A** Synthetic `dimoSegmentId` only | Rejected — no SETTLING lifecycle |
| **B** Nullable `dimoSegmentId` + source keys | Valid long-term; high migration cost |
| **C** Hybrid retain `dimoSegmentId` + sourceEventKey | **Rejected** — still lacks SETTLING persistence; synthetic ID compatibility NOT_PROVEN |
| **D** `RawRefuelCandidate` table → promote to `VehicleEnergyEvent` | **RECOMMENDED for F2** |

**RECOMMENDED_EVENT_IDENTITY_MODEL = OPTION_D**

F2 adds `raw_refuel_candidates` (or equivalent) with lifecycle states; promotion writes `VehicleEnergyEvent` with stable `sourceEventKey = candidateIdentityKey`.

Option B semantics remain the F10 target for nullable provider segment id.

---

## 4. EED-OQ-013 resolution

| Field | Value |
|-------|-------|
| **EED_OQ_013_STATUS** | **RESOLVED (design)** |
| **IMPLEMENTATION_PROOF_PENDING** | **F2 / F5** |

**Resolution:** Physical refuel identity is **not** `dimoSegmentId`. Canonical identity is:

1. **`RawRefuelCandidate.id`** — DB lifecycle surrogate
2. **`candidateIdentityKey`** — immutable after first row assignment (Option D)
3. **Semantic rediscovery matcher** — finds existing row under delayed telemetry (F1.2 §2.4)
4. **`sourceEventKey`** on promoted `VehicleEnergyEvent`
5. **G2 `classifyPhysicalRefuelSibling`** for native↔fallback convergence (fuel transition + time; not segment id format)

Design resolution ≠ runtime proof. F2 must implement Option D + rediscovery; F5 proves G2 native↔fallback convergence.

Evidence: this document §2–§3, §6, §14; `EED-DEC-RFRF-005`.

---

## 5. `dimoSegmentId` consumer audit

Full-repo search (backend runtime + scripts + frontend API types). Classification:

| Consumer | Classification | Synthetic `synqdrive-rfrf-*` safe? |
|----------|----------------|-------------------------------------|
| `energy-events.service.ts` upsert/findUnique | IDENTITY_ONLY | YES (opaque unique string) |
| `energy-events.pipeline.ts` buildUpsertPayload | IDENTITY_ONLY | YES |
| `energy-events.types.ts` / API DTO | API / LOGGING | YES (opaque field) |
| `frontend/src/lib/api.ts` EnergyEvent type | API | YES |
| `refuel-sibling-reconciliation.ts` `extractRefuelTokenId` regex `^dimo-refuel-(\d+)-(\d+)$` | **STRING_FORMAT_ASSUMPTION** | **NO** — returns null; siblings not superseded |
| `physical-refuel-identity.matcher.ts` | G2 — field stored, **not used for SAME/DISTINCT** | YES for matching |
| `physical-refuel-row.mapper.ts` | G2 mapping | YES |
| Ops scripts (`energy-events-*`, forensic closure) | OPS/BACKFILL — explicit id lookups | YES if keyed by sourceEventKey too |
| Trip FSM / trip reconciliation `dimoSegmentId` | **Unrelated domain** (VehicleTrip) | N/A |
| Tests / fixtures | TEST | YES |

| Field | Value |
|-------|-------|
| **SYNTHETIC_DIMO_SEGMENT_ID_COMPATIBLE** | **NOT_PROVEN** |

**Reason:** Legacy sibling reconciliation (`extractRefuelTokenId`) fails closed on non-native format. Production uses G2 V2 (skips legacy reconcile), but compatibility is **not proven fleet-wide** without either:

1. Option D promotion path bypassing legacy reconcile entirely, **and**
2. G2 matcher extensions verified for fallback↔native pairs, **and**
3. Legacy reconcile disabled or updated to use `sourceEventKey`

Until F2/F5 implement and test promotion + G2 paths, synthetic ids are **not** globally safe.

**Ownership (F1.2 — not a blocker to START F2):**

| Phase | Responsibility |
|-------|----------------|
| **F2** | Schema/promotion compatibility contract; idempotency under advisory lock |
| **F5** | Fallback↔native integration / G2 proof matrix |

Blockers for **PROMOTION_RUNTIME_READY** and **PRODUCTION_ENABLEMENT** only — not F2 start.

---

## 6. G2 native ↔ fallback matching

Inspected: `classifyPhysicalRefuelSibling`, `vehicleEnergyEventToRefuelRow`, `compareCanonicalRefuelCandidates`.

**Matcher compares:** `vehicleId`, `endTime`, `fuelEndLiters`, `fuelStartLiters`/`fuelEndLiters` transition, `fuelDelta*`, `odometerEndKm`, window overlap/containment — **not** `dimoSegmentId`.

**Requirements for fallback rows:**

- Populate `rawDetectionMeta.fuelStartLiters`, `fuelEndLiters` (and percent if available)
- Set `fuelDeltaLiters` / `fuelDeltaPercent` consistently
- Set `startTime`/`endTime` from physical evidence windows (not scan window)

| Field | Value |
|-------|-------|
| **G2_NATIVE_FALLBACK_SAME_EVENT_MATCHING** | **SUPPORTED** (design-level; needs F5 integration tests) |

**NEEDS_EXTENSION (F5):** Explicit test matrix for fallback-first → native-later with sparse percent on absolute-only vehicles.

---

## 7. Candidate lifecycle vs persistence authority

`RAW_RISE_OBSERVED` ≠ automatic `VehicleEnergyEvent` persist.

| State | Meaning | Persist? |
|-------|---------|----------|
| **INSUFFICIENT** | Not enough pre/post plateau or material rise | NO |
| **OBSERVED** | Rise onset detected; identity locked; evidence immature | NO (Option D row only) |
| **SETTLING** | Post-rise samples still arriving; fingerprint changing | NO |
| **READY_FOR_PERSIST** | All fail-closed gates pass | YES → promote to VehicleEnergyEvent |
| **REJECTED** | Fail-closed reason (spike, reset, duplicate native, etc.) | NO |

**READY_FOR_PERSIST minimum authority (absolute-only path):**

1. `ABSOLUTE_SIGNAL_TRUST = TRUSTED` for vehicle capability profile
2. ≥3 pre-plateau samples within ±0.5 L (INFERRED threshold)
3. ≥3 post-plateau samples within ±0.5 L after rise (INFERRED)
4. Material absolute rise ≥ PROVISIONAL threshold (≥5 L proposed)
5. Max sample gap in rise corridor ≤ PROVISIONAL bound (see §9)
6. No `DUPLICATE_NATIVE_EVIDENCE` for same physical identity
7. No `SENSOR_RESET_SUSPECTED` / `MOTION_EVIDENCE_CONFLICT`
8. OSM **not** required; route evidence optional (confidence only)

---

## 8. Absolute fuel unit vs signal trust — SEPARATED

| Claim | Field | Status |
|-------|-------|--------|
| DIMO GraphQL field semantic unit | `ABSOLUTE_FUEL_UNIT` | **LITERS** (SynqDrive mapping + schema field name) |
| Vehicle/OEM exposes reliable absolute signal | `ABSOLUTE_SIGNAL_TRUST` | **TRUSTED \| UNTRUSTED \| UNKNOWN** per capability profile |

**UNKNOWN → fail closed.** Unit liters ≠ trusted signal.

---

## 9. Threshold epistemic labels — CORRECTED

| Threshold | Value | F1 label (wrong) | F1.1 label |
|-----------|-------|------------------|------------|
| Max sample gap in rise corridor | ≤ 6 min | CALIBRATED | **PROVISIONAL / INCIDENT_ANCHORED** (KS MS 661 ~4.5 min gap only) |
| Min rise duration | ≥ 30 s | CONFIRMED | **INFERRED_FROM_EXISTING_CODE** (`refuel-fuel-rise.ts` constant; not independently production-validated for fallback) |
| Min absolute rise | ≥ 5 L | PROVISIONAL | PROVISIONAL (unchanged) |
| Pre/post plateau samples | ≥3 @ ±0.5 L | INFERRED | INFERRED (unchanged) |

Fleet calibration authority: **EED-OQ-014** (unchanged OPEN).

---

## 10. KS MS 661 fixture hygiene — CORRECTED

| File | Purpose |
|------|---------|
| `ks-ms-661-2026-09-06-refuel-observed.fixture.ts` | **OBSERVED** audit-confirmed samples only |
| `ks-ms-661-2026-09-06-refuel-synthetic.fixture.ts` | **SYNTHETIC** interpolated rise for algorithm tests |

Removed: monolithic fixture with inferred production IDs and interpolated values presented as audit-derived.

**Production identifiers removed** from executable fixtures — synthetic `fixture-rfrf-*` IDs only; provenance via evidence IDs + audit path constants.

| Field | Value |
|-------|-------|
| **KS_MS_661_OBSERVED_FIXTURE_CLEAN** | **YES** |
| **KS_MS_661_SYNTHETIC_INTERPOLATION_SEPARATED** | **YES** |
| **PRODUCTION_IDENTIFIERS_REMOVED_FROM_EXECUTABLE_FIXTURE** | **YES** |

---

## 11. Scope attestation — CORRECTED

| Field | Value |
|-------|-------|
| **RUNTIME_BEHAVIOR_CHANGED** | **NO** |
| **BACKEND_SOURCE_TREE_CHANGED** | **YES** |
| **FIXTURE_ONLY** | **YES** (backend fixture files; no detector wiring) |
| **PRODUCTION_MUTATED** | **NO** |
| **PRODUCTION_DEPLOYED** | **NO** |

---

## 12. Readiness semantics (F1.2 corrected)

F1.1 used `F2_IMPLEMENTATION_READY = NO` circularly — implementing Option D schema **is** F2's purpose. Separate:

| Field | Value | Meaning |
|-------|-------|---------|
| **F1_ARCHITECTURE_COMPLETE** | **YES** | F1 + F1.1 + F1.2 design closure sufficient |
| **F2_START_AUTHORIZED** | **YES** | F2 may begin; architecture target defined |
| **F2_IMPLEMENTATION_COMPLETE** | **NO** | Schema, lifecycle, promotion not built |
| **FALLBACK_RUNTIME_READY** | **NO** | No detector wiring / runtime path |
| **PRODUCTION_FALLBACK_READY** | **NO** | No rollout / flags remain OFF |

**F2 completion still requires:**

- `raw_refuel_candidates` schema + lifecycle states
- Concurrency / idempotency proof under per-vehicle lock
- Semantic rediscovery contract (§2.4)
- Promotion contract to `VehicleEnergyEvent`
- `dimoSegmentId` compatibility strategy + migration tests

**F5** proves native↔fallback G2 convergence. Do not imply production readiness.

| Gate | Status |
|------|--------|
| WINDOW_LEVEL_NATIVE_SUPPRESSION = FORBIDDEN | **PASS** |
| Option D staging lifecycle defined | **PASS** |
| candidateIdentityKey + evidenceRevisionFingerprint separated | **PASS** |
| Candidate rediscovery design (semantic, not hash-only) | **PASS** |
| `RawRefuelCandidate.id` DB identity separated | **PASS** |
| EED-OQ-013 resolved (design) | **PASS** |
| dimoSegmentId synthetic compatibility | **NOT_PROVEN** (F2/F5 ownership) |
| KS MS 661 observed fixture clean | **PASS** |
| Threshold labels corrected | **PASS** |
| G2 matching contract | **SUPPORTED** (F5 tests) |

| Severity | Count | Description |
|----------|-------|-------------|
| P0 | 0 | — |
| P1 | 1 | Production raw-fuel fallback still absent (motivator unchanged) |

---

## 13. F2 plan adjustment

| Phase | F1 plan | F1.1 adjustment |
|-------|---------|-----------------|
| **F2** | Schema detectionSource + sourceEventKey | **`raw_refuel_candidates` table + lifecycle + promotion contract** |
| **F3** | Pure detector | Unchanged; use synthetic fixture for unit tests, observed for incident regression |
| **F5** | Convergence | **Mandatory** fallback↔native G2 integration matrix |

---

## 14. F1.2 final closure (2026-09-12)

Small addendum merged with F1.1 — no new top-level audit document.

| Correction | Result |
|------------|--------|
| F2 readiness semantics decoupled from F2 work itself | `F2_START_AUTHORIZED=YES`; `F2_IMPLEMENTATION_COMPLETE=NO` |
| Semantic candidate rediscovery under delayed telemetry | `CANDIDATE_REDISCOVERY_DESIGN=PASS` |
| `RawRefuelCandidate.id` vs key vs fingerprint vs matcher | Four-way separation explicit |
| Case C (bucket boundary shift) | EXISTING row rediscovered; key unchanged |
| EED-OQ-013 | `RESOLVED (design)`; `IMPLEMENTATION_PROOF_PENDING=F2/F5` |
| `dimoSegmentId` compatibility | `NOT_PROVEN`; F2 schema / F5 G2 proof ownership |

**Merge gate (PR #1619):**

```
RFRF_F1_FINAL_CLOSURE = PASS
F1_ARCHITECTURE_COMPLETE = YES
F2_START_AUTHORIZED = YES
OPTION_D_STAGING_LIFECYCLE_DEFINED = YES
CANDIDATE_REDISCOVERY_DESIGN = PASS
CANDIDATE_DB_IDENTITY_SEPARATED = YES
IMPLEMENTATION_IDEMPOTENCY_PROOF = PENDING_F2
FALLBACK_RUNTIME_READY = NO
PRODUCTION_FALLBACK_READY = NO
```
