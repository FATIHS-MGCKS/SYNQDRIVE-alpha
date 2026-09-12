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

### 2.2 Two explicit concepts

| Concept | Purpose | Mutability |
|---------|---------|------------|
| **`candidateIdentityKey`** | Stable logical candidate identity across rescans, window shifts, delayed telemetry | **Immutable once assigned** at first OBSERVED lock |
| **`evidenceRevisionFingerprint`** | Audit/debug digest of current evidence maturity | **Updates** on every reconciliation pass |

**Rule:** `candidateIdentityKey` MUST NOT include post-plateau peak, rise end time, or post-plateau median.

### 2.3 Proposed `candidateIdentityKey` algorithm (F2 design)

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

**Promotion mapping (Option D):**

- `RawRefuelCandidate.candidateIdentityKey` — assigned at OBSERVED lock, never changes
- `RawRefuelCandidate.evidenceRevisionFingerprint` — updated each scan
- On promotion: `VehicleEnergyEvent.sourceEventKey = candidateIdentityKey`
- `VehicleEnergyEvent.dimoSegmentId = synqdrive-rfrf-{vehicleId}-{hash(candidateIdentityKey)}` (opaque upsert key only)

### 2.4 Delayed telemetry worked examples

| # | Scenario | candidateIdentityKey | evidenceRevisionFingerprint |
|---|----------|---------------------|----------------------------|
| 1 | Post plateau extends 29 L → 31 L | **SAME** (post level excluded) | CHANGES |
| 2 | Rise end moves +6 min | **SAME** | CHANGES |
| 3 | Earlier raw sample arrives (shifts rise onset <5 min bucket) | **SAME** if onset stays in same 5-min bucket; **DIFFER** if bucket changes (rare; hold SETTLING until bucket stable) | CHANGES |
| 4 | Reconcile window shifts +15 min | **SAME** (identity independent of scan window) | may CHANGE |
| 5 | Duplicate raw samples arrive | **SAME** (dedupe before hash) | unchanged if identical |
| 6 | Same refuel seen by fast + warm reconciliation | **SAME** (upsert by candidateIdentityKey) | may CHANGE |
| 7 | Two refuels 45 min apart | **DIFFER** (different riseOnsetBucketUtc) | independent |

**Verdict:** `DELAYED_TELEMETRY_IDENTITY_STABILITY = PASS` **only with Option D staging table** that assigns `candidateIdentityKey` at OBSERVED lock before promotion. Direct-to-VehicleEnergyEvent without staging **FAILS** example 3 edge cases.

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
| **EED_OQ_013_STATUS** | **CLOSED (design)** |

**Resolution:** Physical refuel identity is **not** `dimoSegmentId`. Canonical identity is:

1. **`candidateIdentityKey`** for raw fallback lifecycle (Option D)
2. **`sourceEventKey`** on promoted `VehicleEnergyEvent`
3. **G2 `classifyPhysicalRefuelSibling`** for native↔fallback convergence using fuel transition + time evidence (not segment id format)

`dimoSegmentId` remains an **upsert compatibility key** (native provider id or namespaced promotion id). Legacy `refuel-sibling-reconciliation.ts` regex is **not** identity authority when G2 V2 enabled.

Evidence: this document §2–§3, §6, `EED-DEC-RFRF-005`.

**Note:** Design closure ≠ production implementation. F2 must implement Option D before operational identity is proven.

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

Until F2 implements and tests this, synthetic ids are **not** globally safe.

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

## 12. F2 readiness gate

| Gate | Status |
|------|--------|
| WINDOW_LEVEL_NATIVE_SUPPRESSION = FORBIDDEN | **PASS** (design corrected) |
| candidateIdentityKey defined + delayed telemetry examples | **PASS** (design) |
| evidenceRevisionFingerprint separated | **PASS** |
| EED-OQ-013 closed at design level | **PASS** |
| dimoSegmentId synthetic compatibility | **FAIL** (NOT_PROVEN) |
| KS MS 661 observed fixture clean | **PASS** |
| Production identifiers sanitized | **PASS** |
| Threshold labels corrected | **PASS** |
| G2 matching contract | **SUPPORTED** (needs F5 tests) |
| Option D staging table designed | **PASS** |

| Field | Value |
|-------|-------|
| **F2_IMPLEMENTATION_READY** | **NO** |

**Blockers:** Implement Option D schema + prove dimoSegmentId/sibling-reconcile compatibility in F2 integration tests.

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
