# EED-EV-0104 — RFRF OQ-014 Fleet Calibration + Settled Locality (2026-10-01)

**Classification:** DESIGN + PRODUCTION_READONLY_EVIDENCE  
**Mode:** Read-only Production forensics + offline settled-post replay — **no runtime change**  
**Baseline main (audit):** `47f783ad4e0b9941b50ee1fa88340065b7d663ad`  
**Prior design replay:** EED-EV-0103  
**Related ADR:** `decisions/RFRF-F3-SETTLED-POST-REFUEL-MATURITY-2026-09-30.md` (amended in same workstream)

---

## 0. Safety and scope attestations

| Attestation | Value |
|-------------|-------|
| **PRODUCTION_DB_WRITES** | **0** |
| **PROVIDER_WRITES** | **0** |
| **RUNTIME_CHANGED** | **NO** |
| **PRODUCTION_NUMERIC_CAPS_SELECTED** | **NO** |
| **Hybrid Trust v2 changed** | **NO** |
| **Alpha Option C changed** | **NO** |

---

## 1. Canonical physical-event accounting

| Metric | Count |
|--------|------:|
| **CANONICAL_PHYSICAL_EVENT_COUNT** | **14** |
| **POSITIVE_LABELED_PHYSICAL_EVENT_COUNT** | **13** |
| **SUSPECT_PHYSICAL_EVENT_COUNT** | **1** (`KS_MS_661_2026_09_14_SUSPECT_57L`) |
| **NOT_REFUEL_PHYSICAL_EVENT_COUNT** | **0** |

Positive-labeled inventory (13): seven-row calibration pack naturals (excluding suspect control) plus five additional WOB L 7503 native REFUEL dates (2026-09-02, -03, -05, -07, -15) and HMÜ C 215 2026-09-29. Suspect row is **excluded** from positive-labeled calibration population.

---

## 2. Calibration-eligible natural fleet (authoritative N=6)

| # | Event ID | Vehicle |
|---|----------|---------|
| 1 | `KS_MS_661_2026_09_30` | KS MS 661 |
| 2 | `WOB_7503_2026_09_19` | WOB L 7503 |
| 3 | `WOB_7503_2026_09_27_EVENT_B` | WOB L 7503 |
| 4 | `KS_MX_2024_2026_09_16` | KS MX 2024 |
| 5 | `KS_MX_2024_2026_09_04` | KS MX 2024 |
| 6 | `WOB_7503_2026_09_15` | WOB L 7503 |

| Metric | Value |
|--------|-------|
| **NATURAL_ELIGIBLE_EVENT_COUNT** | **6** |
| **NATURAL_ELIGIBLE_VEHICLE_COUNT** | **3** |
| **MAX_EVENTS_FROM_SINGLE_VEHICLE** | **4** (WOB L 7503) |
| **FRACTION_EVENTS_FROM_SINGLE_VEHICLE** | **0.667** |

**Limitation:** 4/6 eligible events are **WOB L 7503**. This is **not** six independent vehicles and must not be read as fleet-wide statistical coverage.

**Excluded from eligible set:** `KS_MS_661_2026_09_06` (sparse / terminal F3 on full provider spine — not calibration-grade settled replay).

---

## 3. Drop calibration evidence (observed sample bounds only)

Population: **DROP_CALIBRATION_ELIGIBLE_N=6** (all six eligible naturals yield a peak→settled drop metric under offline settled design replay).

| Statistic | Value |
|-----------|-------|
| **OBSERVED_PEAK_TO_SETTLED_DROP_L_MIN** | **0** |
| **OBSERVED_PEAK_TO_SETTLED_DROP_L_MEDIAN** | **0** |
| **OBSERVED_PEAK_TO_SETTLED_DROP_L_MAX** | **1** |
| **OBSERVED_PEAK_TO_SETTLED_RATIO_MIN** | **0** |
| **OBSERVED_PEAK_TO_SETTLED_RATIO_MEDIAN** | **0** |
| **OBSERVED_PEAK_TO_SETTLED_RATIO_MAX** | **0.0714** |

**Crucial wording:** These values are **OBSERVED SAMPLE BOUNDS** from six FMS natural events. They are **NOT** Production caps, safe upper bounds, or recommended thresholds. Only **one** of six eligible events shows non-zero peak→settled drop (KS MS 661 2026-09-30, 1 L).

| Decision | Value |
|----------|-------|
| **PRODUCTION_UPPER_BOUND_ESTABLISHED** | **NO** |
| **CALIBRATION_DECISION** | **CALIBRATION_INSUFFICIENT** |

---

## 4. Settling timing vs locality — separate evidence populations

Do **not** use one universal **N** for all calibration questions.

| Population | N | Meaning |
|------------|--:|---------|
| **DROP_CALIBRATION_ELIGIBLE_N** | **6** | Offline settled replay yields peak→settled drop metric |
| **SETTLING_TIMING_CALIBRATION_ELIGIBLE_N** | **5** | Physical settling duration defensible (continuous peak→settled path) |
| **LOCALITY_CALIBRATION_ELIGIBLE_N** | **5** | Locality class CONTIGUOUS_LOCAL or BOUNDED_WITH_MINOR_GAPS |

### 4.1 WOB L 7503 2026-09-19 (delayed observation)

| Field | Value |
|-------|-------|
| **REFUEL_LABEL_VALID** | **YES** (physical refuel ground truth preserved) |
| **SETTLED_TIMING_CALIBRATION_ELIGIBLE** | **NO** |
| **Peak → settled-window start** | **2325 s** |
| **Max gap peak → settled-window start** | **2325 s** |
| **Locality class** | **DELAYED_OBSERVATION** |
| **Physical settling duration defensible** | **NO** |

The physical **REFUEL** evidence remains valid. What is **invalid** is interpreting the delayed **16:54** observation as proof that the tank physically required **2325 seconds** to settle. Use **OBSERVATION_DELAY_TO_SETTLED_WINDOW** for diagnostics, not physical settling duration.

Fixture reference: `backend/src/modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/testing/wob-2026-09-19-observed-fuel.fixture.ts` (peak **16:15:15Z**, settled window from **16:54:00Z**).

---

## 5. Locality sensitivity matrix (six eligible naturals)

Hypothetical offline constraint (not Production): peak→settled-start ≤ cap **and** inter-sample continuity from peak through settled-window start ≤ existing design `maxSampleGapMs` semantics.

All numeric caps labeled **OFFLINE_SENSITIVITY_ONLY** — **no** Production authority selected.

| Cap | NATURAL_READY | LOST_EVENT_IDS |
|-----|-------------:|----------------|
| **30 s** | **4** | `KS_MS_661_2026_09_30`, `WOB_7503_2026_09_19` |
| **60 s** | **4** | same |
| **120 s** | **5** | `WOB_7503_2026_09_19` |
| **180 s** | **5** | `WOB_7503_2026_09_19` |
| **300 s** | **5** | `WOB_7503_2026_09_19` |
| **600 s** | **5** | `WOB_7503_2026_09_19` |
| **Unbounded current design** | **6** | *(none — current settled resolver, no added locality cap)* |

**SAFETY_NEGATIVE_READY_COUNT=0** across sensitivity grid (terminal rejection dominance unchanged vs EED-EV-0103).

---

## 6. Locality authority design (symbolic only)

| Field | Value |
|-------|-------|
| **LOCALITY_AUTHORITY_DESIGN** | **SEPARATE_SYMBOLIC_AUTHORITY** |
| **Symbol** | `maxPeakToSettledContinuityGapMs` |
| **Classification** | **SYMBOLIC_UNCALIBRATED** |
| **Numeric Production value** | **NONE selected in this evidence** |

**Do not** reuse `absolute.maxSampleGapMs` as the peak→settled locality authority. That symbol expresses existing F3 sample-region gap semantics (including within-settled-window gaps). Reusing it would couple rise-path gap calibration, settled-window internal gaps, and peak→settled locality — one tuning change could silently move another authority.

See amended ADR §4.5 and §10 for normative wording.

---

## 7. Phase-aware strong-regression (design only)

| Finding | Value |
|---------|-------|
| **EMPIRICALLY_OBSERVED_VALID_REFUEL_STRONG_REGRESSION_CONFLICT_COUNT** | **0** |
| **STRUCTURAL_CONFLICT_EXISTS_FOR_VALID_SETTLING_DROP_GT_1L** | **YES** |

Future phases (design): **RISING → PEAK_REACHED → SETTLING → SETTLED**, separate from terminal **SENSOR_RESET / TRUE_RETURN_TO_BASELINE / UNSTABLE_RISE**. Mandatory invariants documented in ADR §11. **Current runtime F3 remains authoritative** until a separately authorized implementation PR.

---

## 8. Bounded recovery (nine positive-labeled ineligible targets)

Source priority used: Production candidate metadata → bounded **DIMO GraphQL read-only** (VPS, 2026-10-01) → repo fixtures where already committed.

| Event | Recovery outcome |
|-------|------------------|
| **KS_MX_2024_2026_09_04** | **FULL_REPLAY** — newly eligible; spine artifact below |
| **WOB_7503_2026_09_15** | **FULL_REPLAY** — newly eligible; spine artifact below |
| **KS_MS_661_2026_09_06** | PARTIAL — provider spine recovered; terminal F3 / no settled READY |
| **WOB_7503_2026_09_24** | PARTIAL — DIMO spine; no settled plateau in window |
| **HMUE_C_215_2026_09_29** | PARTIAL — DIMO spine; terminal F3 |
| **WOB_7503_2026_09_02** | PARTIAL — no settled READY |
| **WOB_7503_2026_09_03** | PARTIAL — no settled READY |
| **WOB_7503_2026_09_05** | PARTIAL — terminal F3 |
| **WOB_7503_2026_09_07** | PARTIAL — terminal F3 |

Native REFUEL labels alone do **not** imply calibration-grade telemetry without a valid absolute spine and admissible settled replay.

---

## 9. Sanitized spine artifacts (read-only extracts)

| Event | Artifact |
|-------|----------|
| KS MX 2024 2026-09-04 | `evidence/data/EED-EV-0104-KS-MX-2024-2026-09-04-ABSOLUTE-SPINE.json` |
| WOB L 7503 2026-09-15 | `evidence/data/EED-EV-0104-WOB-L-7503-2026-09-15-ABSOLUTE-SPINE.json` |

Each file contains: event ID, vehicle label, source classification, bounded query window, provider aggregation semantics (`powertrainFuelSystemAbsoluteLevel`, AVG, interval), timestamps and liter values only. **No** secrets, tokens, or auth material. **No interpolation.**

---

## 10. Open questions (status)

| ID | Status | Note |
|----|--------|------|
| **EED-OQ-014** | **OPEN** | EED-EV-0103 design replay + **this** six-event fleet/locality evidence; separate symbolic locality authority; numeric Production caps **open**; fleet concentration insufficient |
| **EED-OQ-019** | **PARTIALLY_RESOLVED** | Hybrid activation proven; durable calibration store / Production numeric caps **not** solved |

---

## 11. What this evidence does **not** prove

- Production numeric caps for peak→settled drop or locality  
- Runtime F3 settled-post implementation  
- Absolute-only trust or automatic fallback promotion authority  
- Fleet-wide statistical generalization beyond the six listed naturals  

**Maturity (registry):** PROVEN_BY_READONLY_PRODUCTION_EVIDENCE + design replay cross-check (see EVIDENCE_REGISTRY.md).
