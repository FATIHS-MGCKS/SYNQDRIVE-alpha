# M3.3E E2 — Longitudinal Battery Health Model Architecture / Scientific Contract

**Date:** 2026-09-25  
**Phase:** M3.3E E2 (architecture + scientific audit — documentation / contract design only)  
**Registry module:** Battery V2 (`AUTHORITY_ACTIVE`)  
**Status:** **M3.3E E2 ARCHITECTURE COMPLETE** (draft PR; merge + post-merge seal pending)  
**Contract names introduced (design only, not implemented):** `M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1`, `M3_3E_E2_MODEL_POLICY_V1`, `M3_3E_CALIBRATION_UNSET_V1`  
**`M3_3E_HEALTH_MODEL_IMPLEMENTED=NO`**

> This document is the scientific contract for how SynqDrive may (and may not) draw longitudinal battery conclusions from `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1`. It changes **no** runtime code, schema, flag, readiness policy, publication path, or production data.

**Headline conclusion (epistemic state: `CONFIRMED` from code + prior authority):**  
The evidence available through E1 today supports, at most, **descriptive longitudinal statistics of measured rest-voltage descriptors within one comparable version segment**. It does **not** support an absolute battery condition, a health percentage, a state-of-health (SOH), remaining useful life (RUL), failure prediction, or replacement recommendation. Under the default (and currently only) calibration profile, every directional or condition classification resolves to a **first-class no-conclusion state**. E2 prefers "insufficient evidence for an absolute health claim" over any invented number.

---

## 1. Purpose / scope

### 1.1 Purpose

Define the scientific architecture that a future longitudinal battery model (E3 engineering and later phases) must obey:

1. What each available signal physically means and which confounders dominate it.
2. When a longitudinal comparison is legal (comparability contract).
3. When evidence is sufficient for which claim level (evidence sufficiency architecture).
4. How trends, outliers, temperature, and confidence are represented.
5. Which output states exist, including first-class no-conclusion states.
6. How the model relates to the existing `LV_ESTIMATED_HEALTH` assessment, to readiness, and to persistence/publication.
7. Which claims are forbidden, and which questions remain open, by owner phase.

### 1.2 In scope

- Scientific signal inventory of every field carried by `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1`.
- Semantic separations: measurement ≠ evidence quality ≠ trend ≠ condition ≠ confidence ≠ SOH ≠ readiness.
- Output taxonomy and determinism/versioning contract for a pure evaluator.
- Claim-control matrix and open-decision register.
- Proposed E3 engineering boundary.

### 1.3 Out of scope (non-goals — hard)

| Non-goal | Status |
|----------|--------|
| Production TypeScript implementation | **Not in E2** |
| Runtime wiring (Nest providers, hooks, workers, schedulers) | **Not in E2** |
| Database writes (`BatteryAssessment`, `BatteryPublication`, any table) | **Not in E2** |
| Prisma schema / migration | **Not in E2** |
| Feature-flag change | **Not in E2** |
| Deployment / production mutation | **Not in E2** |
| M3.3F activation / D3 production materialization | **Not in E2** (`M3_3F_REMAINS_PENDING=YES`) |
| Readiness policy change | **Not in E2** |
| Customer UI / copy (M3.3H) | **Not in E2** |
| Numeric thresholds without evidence | **Forbidden** — represented as `CALIBRATION_REQUIRED` |

---

## 2. Starting authority

### 2.1 Verified baseline (from `main`, not trusted blindly)

| Fact | Verified value | Method |
|------|----------------|--------|
| Expected main at task start | `a37f372bf3017b879827f52e6f2a018a857bb1d9` (PR #1771 E1 seal) | `git rev-parse`, `gh pr view 1771` → MERGED at that SHA |
| `origin/main` at branch time | `a733a2df9c3fb67bfd2188127d946d9bf28ad68c` | One additional commit: PR #1770 (`docs(tdl,dimo)` trip-detection boundary docs) — **no Battery V2 file touched** (`git diff --name-only a37f372bf a733a2df9` contains no `battery` path) |
| E1 merge | PR #1765 @ `553ba670a0a5b99689c6575417b75d4f0b9fb422` | `git merge-base --is-ancestor` → ancestor of main |
| E1 golden fingerprint | `d426d1b020a2e281581bba677cbc16a9b96f46705dc1f7c4acfa26f49e93ae5f` | Literal in `longitudinal-assessment-input.golden.ts` |
| E1 test suites on main | 3 suites / 97 tests **PASS** | `npx jest longitudinal-assessment-input` on main |
| `modelSufficiency` | Type literal `'NOT_EVALUATED'` only | `longitudinal-assessment-input.types.ts` |
| Production runtime baseline | `2b0ef15f` (unchanged by E0/E1/E2) | `CURRENT_STATE.md` |
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | `false` (production) | `CURRENT_STATE.md` — no natural C3 rows (BLOCK-M3.3D-001) |

### 2.2 Authority chain consumed

| Layer | Authority | Contract |
|-------|-----------|----------|
| Rest sessions + generalized evidence | M3.3A/B | `BatteryGeneralizedEvidenceObservation`, R1 8h ladder |
| Per-session features | M3.3C C1–C3 | `M3_3C_C3_V1`, `M3_3C_C1_V1`, `M3_3C_C2_V1`, `M3_3C_FEATURE_INPUT_V1` |
| Longitudinal profile | M3.3D D0–D2 | `M3_3D_LONGITUDINAL_PROFILE_V1`, `M3_3D_PROFILE_POLICY_V1` |
| Materialization / integrity | M3.3D D3/D4 | `BatteryLongitudinalProfileRevision`, `M3_3D_D4_INTEGRITY_INSPECTION_V1` |
| Assessment input | M3.3E E0–E1 | `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1` |
| **This document** | **M3.3E E2** | **Scientific model contract (design only)** |

### 2.3 Invariants preserved (A–R, restated as E2 constraints)

| ID | Invariant | E2 consequence |
|----|-----------|----------------|
| A | Only D3 `DEFAULT` observations with D4 `ELIGIBLE` disposition are assessment-grade | E2 model reads **only** `assessmentGradeObservations`; excluded counts are context, never evidence |
| B | `modelSufficiency='NOT_EVALUATED'` in E1 | E2 defines sufficiency **in the model result**, never by mutating E1 |
| C | E1 is pure, deterministic, fingerprinted | E2 result binds `consumptionInputFingerprint` |
| D | Scientific time axis = `anchorAt` | E2 trend axis = `anchorAt`; never `materializedAt`, `createdAt`, `inspectionGeneratedAt`, request time |
| E | Version segments preserved (`sourceSegmentIndex`), no A→B→A merge | E2 evaluates per segment; **no cross-segment pooling** |
| F | D4 integrity ≠ model confidence ≠ health (E0 §14) | E2 carries integrity as reason codes; no mechanical mapping to confidence or condition |
| G | Temperature is context only (E0 §12, D0) | E2 V1: temperature is explanatory context + coverage descriptor; no normalization |
| H | No implicit charge-class health ordering (E0 §13) | E2 uses charge class only as a comparability key |
| I | `LV_ESTIMATED_HEALTH` is `ESTIMATED_HEALTH_NOT_SOH` | E2 never emits or implies SOH; never replaces LV Estimated Health |
| J | Shadow/proxy evidence never blocks readiness | E2 output has **no** readiness effect |
| K | No `BatteryAssessment` / `BatteryPublication` writes before M3.3G | E2 result is non-persisted |
| L | `NO_8H_REST_DOES_NOT_MEAN_BAD_BATTERY=YES` (R1 §11) | Missing/short rests → no-conclusion, never adverse |
| M | Absolute SOH / CCA / capacity-Ah not supported (R1 §9) | Claim matrix: **NOT_SUPPORTED** |
| N | C1 outlier policy `NO_HARD_POINT_DELETION_THEIL_SEN_ROBUST_ONLY` | E2 flags outliers; never deletes observations |
| O | Thresholds with unknown provenance are not reused (`BAT-V2-GAP-THRESHOLD-PROVENANCE-001`) | Existing LV chemistry bands are **not** imported |
| P | D3/D4 not runtime-reachable; M3.3F pending | E2 adds no reachability |
| Q | Multi-tenant scoping preserved (org + vehicle identity carried by E1) | E2 model is per `(organizationId, vehicleId)` input; no cross-vehicle pooling in V1 |
| R | Append-only history | Ledger entry appended; no historical record rewritten |

---

## 3. Scientific signal inventory

Source: `LongitudinalInputFeatureScalars` + `M3_3E_AssessmentGradeObservationV1` context fields, computed by C1 (`rest-session-retention*.policy.ts`) and C2 (`rest-session-charge-opportunity.policy.ts`), carried unchanged by D1 → D2 → D3 → E1.

**Classification key** — *Kind*: `MEASURED` (direct provider observation, possibly aggregated), `DERIVED` (deterministic function of measurements), `PROXY` (stands in for an unobserved physical quantity), `METADATA` (sampling/quality description, not a battery property).  
**Epistemic tags** on physical interpretation: `CONFIRMED` = follows from code/physics definition; `INFERRED` = standard lead-acid/LV electrochemistry reasoning not yet validated on SynqDrive data.

### 3.1 Physical meaning

| Field | Unit | Source (computation) | Kind | Physical meaning | Directionality |
|-------|------|----------------------|------|------------------|----------------|
| `medianRestVoltageMv` | mV (int) | C1 `deterministicMedianInt` over eligible rest points (`Math.round(V*1000)`) | MEASURED (aggregated) | Central resting terminal voltage of the LV battery during one key-off rest. Approximates open-circuit voltage only after relaxation and only under near-zero load (`INFERRED`); dominated by state of charge (SOC) | Higher ≈ higher SOC. **No health direction** without SOC control |
| `minimumRestVoltageMv` | mV (int) | C1 min over eligible points | MEASURED (extreme) | Lowest single rest sample; usually the latest/deepest point | Single-point; no health direction |
| `maximumRestVoltageMv` | mV (int) | C1 max over eligible points | MEASURED (extreme) | Highest single rest sample; usually the earliest point (surface charge not yet relaxed) (`INFERRED`) | Single-point; no health direction |
| `restVoltageVarianceMv2` | mV² | C1 `populationVariance` over eligible point mV | DERIVED | **Mixes** the systematic decay trajectory with measurement noise/wake artifacts — **not** a noise metric (`CONFIRMED` by definition) | None |
| `robustRestSlopeMvPerHour` | mV/h (float) | C1 Theil-Sen median pairwise slope vs `actualRestAgeMs` (null if <2 distinct ages) | DERIVED | Intra-session rest voltage retention rate. Under constant small load, relates to draw current ÷ (effective capacity × dOCV/dSOC) (`INFERRED`); lead-acid relaxation is non-linear, so value depends on which part of the rest is sampled | More negative = faster decay. **Not** a capacity or health measure without load/relaxation control |
| `shutdownToFirstRestDeltaMv` | mV (int) | C1: anchor mV (`ENGINE_OFF_TRANSITION`, age 0, same session) − first rest point mV; C3 passes a retention anchor **only** when `anchorResolution.status='SELECTED'`, so non-null ⇒ `SELECTED` (`CONFIRMED`, `rest-session-feature-computation.service.ts`) | DERIVED | Post-shutdown voltage drop: alternator/charging residual + surface-charge relaxation up to first rest sample (`INFERRED`) | Positive = drop. Depends on alternator setpoint and first-point age |
| `numberOfValidRestPoints` | count | C1 eligible point count | METADATA | Sampling density of the rest | None (quality) |
| `maxActualRestAgeMs` | ms | C1 max `actualRestAgeMs` | METADATA | Rest depth reached by the sampled evidence | None (context) |
| `maxInterObservationGapMs` | ms | C1 max consecutive age gap (null if <2) | METADATA | Largest sampling hole | None (quality) |
| `observationSpanMs` | ms | C1 last − first eligible age (0 if 1 point) | METADATA | Duration covered by rest samples | None (quality) |
| `missingRungCount` | count | C1 missing nominal 8h ladder rungs 1..max positive index (null when no point has a positive `nominalRestIntervalIndex`) | METADATA | Ladder completeness vs R1 nominal cadence | None (quality) |
| *derived:* `firstRestPointAgeMs` | ms | `maxActualRestAgeMs − observationSpanMs` (exact integer arithmetic) | DERIVED | Age of first rest sample; determines how much relaxation is inside `shutdownToFirstRestDeltaMv` | None (alignment key) |
| `chargeOpportunityClass` | enum | C2 V1: **hard-coded `UNKNOWN`** (`CHARGE_OPPORTUNITY_THRESHOLD_STATUS='NOT_PRODUCTION_CALIBRATED'`) | METADATA (placeholder) | Intended: how well the battery was charged before rest. **Today: no information** (`CONFIRMED`) | None |
| `chargeContextCompleteness` | string[] | C2 reason list (always contains `PRIOR_SESSION_FEATURE_NOT_RESOLVED_IN_C2`) | METADATA | Why charge context is incomplete | None |
| `temperatureC` | °C | C2: preceding trip `outsideTemperatureStartC` | PROXY | **Exterior air temperature at the start of the preceding trip** — not battery temperature, not rest-period temperature; age relative to rest unknown in E1 (`CONFIRMED`) | None |
| `temperatureSource` | enum/string | C2: `TRIP_EXTERIOR` or `UNKNOWN` | METADATA | Provenance of `temperatureC` | None |
| `anchorResolutionStatus` | `SELECTED`/`UNAVAILABLE`/`AMBIGUOUS` | C3 input summary | METADATA | Whether a trustworthy shutdown anchor was bound | None |
| `anchorAt` | ISO-8601 UTC (`toISOString` form) | Rest session anchor | METADATA (time) | Scientific time axis (E0 §10) | — |
| `integrityContext.digestVerificationScope` | `FULL`/`BOUNDED_LATEST_WINDOW`/`NOT_EVALUATED` | D4 | METADATA (integrity) | How much of the revision's digest set was verified | None (never confidence) |

### 3.2 Confounders, temperature sensitivity, charge/rest dependence

| Field | Dominant confounders | Temperature sensitivity | Charge / rest dependence |
|-------|---------------------|------------------------|--------------------------|
| `medianRestVoltageMv` | SOC at shutdown (trip length, alternator strategy, start-stop), rest depth, parasitic draw (incl. telematics device / DIMO hardware), surface charge, HEV/PHEV DC-DC top-ups during rest, wake-induced load at sample time, provider voltage resolution (unknown) | OCV has a chemistry-dependent temperature coefficient; cold also slows relaxation (`INFERRED`); not quantified in repository | **Strong** — SOC-dominated; changes with rest depth |
| `minimum/maximumRestVoltageMv` | As median, plus single-sample noise; max biased by first-point age, min by rest depth | As median | **Strong**; extreme statistics shift with sample count |
| `restVoltageVarianceMv2` | Rest depth and span (longer span ⇒ larger systematic spread), sample count, wake artifacts | Indirect | **Strong** dependence on span/depth |
| `robustRestSlopeMvPerHour` | Parasitic draw magnitude, relaxation phase sampled (early rest decays faster), DC-DC top-ups (can make slope positive), wake loads, SOC region (dOCV/dSOC not constant) | Draw and relaxation are temperature-dependent (`INFERRED`) | **Strong** — requires first-point age and rest-depth alignment |
| `shutdownToFirstRestDeltaMv` | Alternator setpoint / smart-charging, first-point age, anchor quality, trip-end load | Charging voltage strategies are often temperature-compensated (`INFERRED`) | **Strong** — requires anchor `SELECTED` + first-point age alignment |
| Metadata fields | Provider wake cadence (auto `REST_WAKE` promotion disabled → ladder points are mostly `PARKED_REST_CANDIDATE`), telemetry gaps | — | They *are* the rest descriptors |
| `temperatureC` | Trip-start vs rest-time mismatch, sun/garage, missing trips | Is the temperature | — |

### 3.3 Longitudinal usage properties

| Field | Longitudinal comparability | Cross-version safety | Normalization need | Absolute threshold supportable? | Relative-only? | Key limitation |
|-------|---------------------------|----------------------|--------------------|-------------------------------|----------------|----------------|
| `medianRestVoltageMv` | Within one segment, **only** as measured descriptor unless charge + rest depth controlled | Same segment only | SOC / rest-depth / temperature — **none available V1** | **NO** (existing chemistry bands belong to `LV_ESTIMATED_HEALTH`, provenance UNKNOWN, chemistry not in E1) | **YES** | SOC-dominated; cannot separate charge state from battery condition |
| `minimum/maximumRestVoltageMv` | Weak (extreme-value statistics depend on n) | Same segment only | Sample-count control | **NO** | YES | Not used as primary metric |
| `restVoltageVarianceMv2` | Weak | Same segment only | Span control | **NO** | YES | Conflates trajectory and noise |
| `robustRestSlopeMvPerHour` | Within segment; comparable at claim level B only with rest-depth + first-point-age + charge alignment | Same segment only | Rest-phase alignment | **NO** | **YES** | Load not observed; relaxation non-linear |
| `shutdownToFirstRestDeltaMv` | Within segment; requires anchor `SELECTED` and first-point-age band match | Same segment only | First-point age alignment | **NO** | **YES** | Mostly a charging-system/relaxation signal, not battery condition |
| Metadata fields | Gating / quality only | Same segment only | — | N/A | N/A | Never evidence of condition |
| `chargeOpportunityClass` | Comparability key (V1 value always `UNKNOWN`) | — | — | N/A | N/A | Uninformative until C2 classifier calibrated |
| `temperatureC` | Context / coverage only | — | Future stratification variable | N/A | N/A | Not battery temperature |

**Primary metrics (V1):** `medianRestVoltageMv` (rest level), `robustRestSlopeMvPerHour` (rest retention), `shutdownToFirstRestDeltaMv` (post-shutdown relaxation). All other feature fields are **gating / quality metadata**, not condition evidence.

**Signals not available in E1** (so no model may rely on them): per-point retention series, pairwise rest deltas, temperature timestamp/age, battery chemistry, powertrain profile (ICE/HEV/PHEV/BEV), source `BatteryMeasurement` ids, cranking/start voltage, charge current, provider SOC.

---

## 4. Semantic separations

Seven layers are **orthogonal**. No layer may be computed by relabeling another.

| Layer | Question answered | V1 source | Must never be derived from |
|-------|-------------------|-----------|----------------------------|
| **Measurement** | What values were observed? | E1 feature scalars | — |
| **Evidence quality** | Is the evidence complete, dense, comparable, verified? | Metadata fields, coverage counts, D4 scope | Measured values themselves |
| **Trend** | How did a measured descriptor change over `anchorAt` within a segment? | E2 descriptive statistics | Condition labels, LV Estimated Health |
| **Condition** | What state is the battery in? | **Not assessed in V1** (`condition='NOT_ASSESSED'`) | Trend sign alone; confidence; integrity |
| **Confidence** | How much should a stated classification be trusted? | Weakest-link over sufficiency, comparability, context control, calibration maturity | Condition; D4 `overallStatus` (mechanically) |
| **SOH** | Remaining capacity vs nominal (workshop / provider) | **Out of model** — never emitted | Any E2 output |
| **Readiness** | May the vehicle be rented/dispatched? | `battery-readiness.policy.ts` (`1.0.0`) | Any E2 output (V1) |

Concrete prohibitions:

- A decreasing `medianRestVoltageMv` trend is a **measured descriptor change**, not "degradation".
- `NO_DIRECTIONAL_CHANGE_RESOLVED` is not "stable" and not "healthy" (detection power is uncalibrated).
- `INSUFFICIENT_EVIDENCE` is not "unknown condition = risky"; it carries no adverse meaning (invariant L).
- High confidence of "no conclusion" is meaningless; confidence applies only to classifications that exist.

---

## 5. Evidence sufficiency architecture

### 5.1 Principle

Sufficiency is **per segment, per metric, per claim level**. A vehicle can be sufficient for a rest-level descriptor trend and insufficient for a retention trend at the same time.

### 5.2 Sufficiency states

| State | Meaning |
|-------|---------|
| `INSUFFICIENT_STRUCTURAL` | Fails a mathematical minimum (below) — no statistic of that kind can exist |
| `UNDETERMINED_CALIBRATION_REQUIRED` | Passes structural minima, but the calibrated minimum for a *classification* is not established (V1 default) |
| `INSUFFICIENT_CALIBRATED` | Fails a calibrated minimum (only possible once a calibrated profile exists) |
| `SUFFICIENT` | Passes structural and calibrated minima for the requested claim level (not reachable under `M3_3E_CALIBRATION_UNSET_V1`) |

### 5.3 Structural minima (mathematical, not calibrated)

These are not battery thresholds; they follow from the definition of the statistic.

| Statistic | Structural minimum | Reason |
|-----------|-------------------|--------|
| Series level (median) | ≥1 non-null value | Median undefined on empty set |
| Theil-Sen trend slope vs `anchorAt` | ≥2 **distinct** `anchorAt` values among non-null metric values | Pairwise slope needs a non-zero time delta (same rule as C1 zero-age skip) |
| Residual dispersion / outlier flags / persistence counts | ≥3 distinct `anchorAt` values | With 2 points the Theil-Sen line passes through both; residuals are identically zero, so dispersion is undefined |
| Step-change candidate | ≥2 values on each side of a candidate split (≥4 total) | A median of each side must exist with a non-trivial split |

### 5.4 Calibrated sufficiency dimensions (all `CALIBRATION_REQUIRED`)

| Dimension | Descriptor computed (always) | Minimum for classification |
|-----------|------------------------------|---------------------------|
| Observation count | Non-null metric values in segment | `CAL-M3.3E-001` — **UNSET** |
| Evidence span | Last − first `anchorAt` (ms) in segment | `CAL-M3.3E-002` — **UNSET** |
| Temporal concentration | Largest share of observations within one calendar-independent window (window length itself calibrated) | `CAL-M3.3E-003` — **UNSET** |
| Rest-depth alignment | `maxActualRestAgeMs` range; band membership once bands exist | `CAL-M3.3E-004` (= `CAL-M3.3D-003`) — **UNSET** |
| First-point-age alignment | `firstRestPointAgeMs` range | `CAL-M3.3E-005` — **UNSET** |
| Per-session slope support | `numberOfValidRestPoints`, `observationSpanMs` | `CAL-M3.3E-011` (links `CAL-M3.3D-001`) — **UNSET** |
| Context diversity / control | Charge class distribution, completeness reasons | Requires calibrated C2 classifier (`CAL-M3.3E-010`) |
| Temperature coverage | Share of observations with `temperatureSource=TRIP_EXTERIOR` | `CAL-M3.3E-009` — **UNSET** |

**Fail-closed rule:** an UNSET calibrated minimum is never treated as zero or as satisfied. It yields `UNDETERMINED_CALIBRATION_REQUIRED` and suppresses every classification that depends on it.

**`NUMERIC_THRESHOLDS_EVIDENCE_BACKED=NO`** — E2 introduces no numeric battery threshold.

---

## 6. Comparability contract

### 6.1 Comparability key (per observation pair / series)

Two observations are comparable for a metric at a claim level only if all applicable keys match:

| Key | Level M (measured descriptor) | Level B (rest behavior) | Level C (condition) |
|-----|------------------------------|--------------------------|---------------------|
| Same `sourceSegmentIndex` | **Required** | **Required** | Not defined V1 |
| Same metric, non-null | Required | Required | — |
| `anchorResolutionStatus='SELECTED'` (for `shutdownToFirstRestDeltaMv`) | Required | Required | — |
| Charge class equal and ≠ `UNKNOWN` | Not required — carries `CHARGE_CONTEXT_UNCONTROLLED` | **Required** | — |
| Rest-depth band equal | Not required — carries `REST_DEPTH_UNCONTROLLED` | **Required** (band function = `CAL-M3.3E-004`) | — |
| First-point-age band equal (delta + slope metrics) | Not required — carries reason code | **Required** (`CAL-M3.3E-005`) | — |
| D4 `digestVerificationScope` | Carried, not gated (reason code when `BOUNDED_LATEST_WINDOW`) | Carried | — |

### 6.2 Comparability states

| State | Meaning |
|-------|---------|
| `SAME_SEGMENT_COMPARABLE` | All Level B keys satisfied (unreachable in V1: charge class always `UNKNOWN`, bands UNSET) |
| `SAME_SEGMENT_CONTEXT_LIMITED` | Same segment; Level M keys satisfied; context keys uncontrolled (the **only reachable comparable state in V1**) |
| `CROSS_SEGMENT_NOT_COMPARABLE` | Different `sourceSegmentIndex` — always, including equal tuples in A→B→A patterns |
| `NOT_COMPARABLE_ANCHOR_UNRESOLVED` | Delta metric with anchor `UNAVAILABLE`/`AMBIGUOUS` |
| `NOT_COMPARABLE_CHARGE_CONTEXT_UNRESOLVED` | Level B requested, charge class `UNKNOWN` |
| `NOT_COMPARABLE_REST_DEPTH_UNALIGNED` | Level B requested, bands differ or UNSET |

### 6.3 Multi-segment handling

- Evaluate each segment independently. **`CROSS_VERSION_POOLING_DEFAULT=NO`**.
- No latest-segment-wins, no concatenation, no averaging across segments.
- Vehicle summary:
  - exactly one segment passes structural minima → `SINGLE_EVALUABLE_SEGMENT` (reference its `sourceSegmentIndex`);
  - more than one → `SEGMENTED_NO_POOLED_CONCLUSION` (all segment results listed; no vehicle-level trend);
  - none → `NO_EVALUABLE_SEGMENT`.
- Future cross-version pooling requires an explicit equivalence decision (links `DEC-M3.3D-005`) and a model policy version bump.

---

## 7. Trend semantics

### 7.1 Estimators (descriptive, always computed when structurally possible)

For each segment × primary metric, over observations with non-null metric values, ordered as E1 orders them (`anchorAt`, then `restSessionId`, UTF-16 code-unit comparison):

| Statistic | Definition |
|-----------|-----------|
| `seriesCount`, `distinctAnchorCount` | Integers |
| `seriesSpanMs` | `Date.parse(last anchorAt) − Date.parse(first anchorAt)` |
| `seriesMedian` | Median of metric values (even n: mean of two middle values) |
| `theilSenSlopePerDay` | Median of pairwise slopes `(y_j − y_i) × 86_400_000 / (t_j − t_i)` for `t_j > t_i`; pairs with equal `t` skipped |
| `kendallPairCounts` | Integers `{increasing, decreasing, tied}` over the same pairs (sign of `y_j − y_i`) — directional agreement without any significance transform |
| `residualMad` | Median absolute deviation of residuals from the Theil-Sen line (intercept = median of `y − slope·t`), n ≥ 3 |
| `stepChangeCandidate` | Split index maximizing `|median(right) − median(left)|` with ≥2 per side; earliest index on ties; reported as descriptive, never as event |

Slope units: rest level and delta metrics → mV/day; retention metric → (mV/h)/day.

### 7.2 Trend states

| State | Reachable in V1 (UNSET calibration)? | Meaning |
|-------|--------------------------------------|---------|
| `NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL` | Yes | Below structural minimum |
| `NOT_COMPARABLE` | Yes | Comparability state not comparable |
| `NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED` | **Yes (default for every evaluable series)** | Statistics exist; no classification permitted |
| `NO_DIRECTIONAL_CHANGE_RESOLVED` | No (requires calibrated detection limits) | Not "stable" — change below calibrated detectable magnitude |
| `DIRECTIONAL_CHANGE_INCREASING` / `DIRECTIONAL_CHANGE_DECREASING` | No | Physically neutral direction of the **descriptor**; never "worsening"/"improving" |
| `STEP_CHANGE_CANDIDATE` | No | Possible discontinuity (e.g., unobserved battery replacement, BLOCK-M3.3D-003) — requires corroboration |
| `INCONSISTENT` | No | Directional agreement below calibrated minimum or split-half disagreement |

Mapping a descriptor direction to an adverse/benign battery meaning is a **condition** step and is not defined in V1.

---

## 8. Temperature / context policy

| Decision | Value |
|----------|-------|
| `TEMPERATURE_ROLE_V1` | Explanatory context + coverage descriptor only |
| `TEMPERATURE_IS_GATE_V1` | **NO** |
| `TEMPERATURE_NORMALIZATION_V1` | **NO** |
| `TEMPERATURE_IS_BATTERY_TEMPERATURE` | **NO** (`TRIP_EXTERIOR` = preceding trip-start exterior air) |
| Reuse of existing chemistry curves / temperature penalties from `lv-chemistry-assessment-context.policy.ts` | **NO** — those are absolute-level constructs of `LV_ESTIMATED_HEALTH`, require chemistry (not in E1), and have `UNKNOWN` threshold provenance |

Per segment × metric, E2 emits temperature context descriptors: count with `TRIP_EXTERIOR`, count `UNKNOWN`, min/median/max of known `temperatureC`. Reason codes: `TEMPERATURE_CONTEXT_ONLY` (always), `TEMPERATURE_UNKNOWN_PRESENT` (any unknown), `TEMPERATURE_RANGE_UNCONTROLLED` (known range present but no stratification). Future temperature stratification requires temperature age relative to rest (not in E1), calibrated bands (`CAL-M3.3E-009`), and a model policy version bump.

Charge context: always emit `CHARGE_CONTEXT_UNCONTROLLED` while any observation has `chargeOpportunityClass='UNKNOWN'` (every observation under C2 V1), plus `CHARGE_CLASSIFIER_NOT_PRODUCTION_CALIBRATED`.

---

## 9. Outlier policy

| Rule | Value |
|------|-------|
| Observation deletion | **Never** (consistent with C1 `NO_HARD_POINT_DELETION_THEIL_SEN_ROBUST_ONLY`) |
| Robustness | Theil-Sen + medians already bound single-point influence |
| Flag basis | Residual vs Theil-Sen line in units of `residualMad`; multiplier `CAL-M3.3E-008` — **UNSET** ⇒ no statistical flags emitted in V1 |
| Zero MAD | No statistical outlier flag possible (division undefined) |

Outlier classes (per `restSessionId`):

| Class | Meaning | V1 reachable |
|-------|---------|--------------|
| `REPRESENTATIVE` | Default | Yes |
| `CONTEXTUAL_EXTREME` | Structurally legal but context-atypical (e.g., `anchorResolutionStatus≠SELECTED`, `numberOfValidRestPoints=1`) — context descriptor only | Yes |
| `STATISTICAL_OUTLIER` | Residual beyond calibrated MAD multiple | No |
| `CHANGE_POINT_CANDIDATE` | Belongs to the post-split side of a step candidate | No |
| `CORROBORATION_REQUIRED` | Flagged and not yet corroborated by another metric/segment | No |

---

## 10. Confidence / uncertainty

| Decision | Value |
|----------|-------|
| Representation | Categorical: `NOT_APPLICABLE` \| `LOW` \| `MODERATE` \| `HIGH` |
| Numeric 0–100 score | **Forbidden** |
| Independent of condition | **YES** (`CONFIDENCE_SEPARATE_FROM_CONDITION=YES`) |
| Aggregation | Weakest link over factors: structural sufficiency, calibrated sufficiency, comparability state, context control (charge, rest depth, first-point age), temperature coverage, outlier presence, step-change presence |
| Calibration cap | `UNCALIBRATED` ⇒ `NOT_APPLICABLE` (no classification exists); `SHADOW_CALIBRATED` ⇒ ≤ `MODERATE`; `NATURAL_VALIDATED` ⇒ `HIGH` possible |
| D4 integrity | Carried as reason codes (`DIGEST_SCOPE_BOUNDED_LATEST_WINDOW`, `EXCLUDED_NON_ELIGIBLE_SESSIONS_PRESENT`); **not** a mechanical confidence input (E0 §14) |
| Descriptive statistics | Carry no confidence claim; uncertainty is expressed by counts, spans, `residualMad`, `kendallPairCounts` |

Reason codes (closed V1 set; additions require model policy version bump):
`CALIBRATION_NOT_ESTABLISHED`, `CHARGE_CONTEXT_UNCONTROLLED`, `CHARGE_CLASSIFIER_NOT_PRODUCTION_CALIBRATED`, `REST_DEPTH_UNCONTROLLED`, `FIRST_POINT_AGE_UNCONTROLLED`, `TEMPERATURE_CONTEXT_ONLY`, `TEMPERATURE_UNKNOWN_PRESENT`, `TEMPERATURE_RANGE_UNCONTROLLED`, `ANCHOR_UNRESOLVED_FOR_DELTA_METRIC`, `INSUFFICIENT_DISTINCT_ANCHORS`, `INSUFFICIENT_POINTS_FOR_DISPERSION`, `MULTI_SEGMENT_NO_POOLING`, `DIGEST_SCOPE_BOUNDED_LATEST_WINDOW`, `DIGEST_SCOPE_NOT_EVALUATED`, `EXCLUDED_NON_ELIGIBLE_SESSIONS_PRESENT`, `WAKE_SAMPLED_REST_NOT_TRUSTED_REST`, `SHARED_PROVENANCE_WITH_LV_ESTIMATED_HEALTH_UNRESOLVED`, `NO_ASSESSMENT_GRADE_OBSERVATIONS`.

---

## 11. Output taxonomy

### 11.1 `M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1` (design contract)

```text
M3_3E_LongitudinalHealthEvaluationV1 {
  contractVersion: 'M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1'
  modelPolicyVersion: 'M3_3E_E2_MODEL_POLICY_V1'
  calibration: {
    calibrationProfileId: string            // V1 default 'M3_3E_CALIBRATION_UNSET_V1'
    calibrationMaturity: 'UNCALIBRATED' | 'SHADOW_CALIBRATED' | 'NATURAL_VALIDATED'
    calibrationProfileFingerprint: string   // sha256 of canonical profile
  }
  inputBinding: {
    inputContractVersion: 'M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1'
    consumptionInputFingerprint: string
    organizationId, vehicleId, revisionIdentity   // carried from E1 identity
  }
  evaluationStatus: 'EVALUATED_DESCRIPTIVE_ONLY' | 'NO_CONCLUSION'
  noConclusionReasons: ReasonCode[]
  claimLevel: 'NONE' | 'MEASURED_DESCRIPTOR_CHANGE'   // 'REST_BEHAVIOR_CHANGE' reserved, not emitted V1
  condition: 'NOT_ASSESSED'                            // only legal V1 value
  segments: [{
    sourceSegmentIndex, versionTuple,
    metrics: [{
      metric: 'MEDIAN_REST_VOLTAGE' | 'ROBUST_REST_SLOPE' | 'SHUTDOWN_TO_FIRST_REST_DELTA'
      comparability: ComparabilityState
      sufficiency: SufficiencyState
      statistics: { seriesCount, distinctAnchorCount, seriesSpanMs, seriesMedian,
                    theilSenSlopePerDay | null, kendallPairCounts | null,
                    residualMad | null, stepChangeCandidate | null }
      contextDescriptors: { temperature, chargeClassCounts, restDepthRangeMs, firstPointAgeRangeMs }
      trendState: TrendState
      outliers: [{ restSessionId, outlierClass }]   // UTF-16 ordered by restSessionId
      confidence: 'NOT_APPLICABLE' | 'LOW' | 'MODERATE' | 'HIGH'
      reasonCodes: ReasonCode[]                       // sorted, deduplicated
    }]
  }]
  vehicleSummary: 'SINGLE_EVALUABLE_SEGMENT' | 'SEGMENTED_NO_POOLED_CONCLUSION' | 'NO_EVALUABLE_SEGMENT'
  resultFingerprint: string
}
```

### 11.2 Forbidden output fields (V1)

`healthScore`, `healthPercent`, `soh`, `sohPercent`, `remainingUsefulLife`, `failureProbability`, `replacementRecommended`, `readinessEffect`, `publicationEligible`, `validUntil`, `evaluatedAt` (wall clock), any customer-facing label.

### 11.3 Condition taxonomy

**`condition='NOT_ASSESSED'` is the only legal V1 value.** The R1 §9 "in principle" labels (`HEALTHY`/`WATCH`/`DEGRADED`/`HIGH_RISK`/`UNKNOWN`) are **not adopted**: no evidence links any E1 descriptor pattern to battery condition on SynqDrive data, and no ground truth exists (`NAT-M3.3F-008`). Adoption is `PROD-M3.3G-001`.

---

## 12. Determinism / versioning

### 12.1 Versions

| Version | Scope | Bump when |
|---------|-------|-----------|
| `contractVersion` | Output shape | Field added/removed/retyped |
| `modelPolicyVersion` | Estimators, state machine, reason-code set, comparability keys | Any semantic change |
| `calibrationProfileId` (+ fingerprint) | Numeric parameters | Any parameter change; UNSET profile is a named, fingerprinted version |

### 12.2 Determinism contract

| Rule | Requirement |
|------|-------------|
| Inputs | E1 object + explicit calibration profile object only |
| Clock | **No** `Date.now()`, `new Date()` without argument, request time, `inspectionGeneratedAt`, `materializedAt` |
| Time parsing | `Date.parse(anchorAt)` only after validating `new Date(x).toISOString() === x` (same check as `longitudinal-profile.validation.ts`); otherwise reject input |
| Arithmetic | IEEE-754 basic operations (`+ − × ÷`, comparisons) and `Math.round`/`Math.abs`/`Math.floor` only; squares by `x * x`; **no** `**`, `Math.pow`, `Math.sqrt`, `Math.log`, `Math.exp`, or other implementation-approximated functions in fingerprinted outputs |
| Operation order | Fixed, documented summation order (ascending series order) |
| Ordering | E1 order for series; `restSessionId` by `compareUtf16CodeUnitLexicographic`; reason codes by the same comparator |
| Quantization | Derived real outputs quantized with `Math.round` to integer micro-units (µV/day; (µV/h)/day; µV for MAD/medians of floats) — resolution ≪ 1 mV input resolution; exact rule is an E3 engineering choice recorded in the E3 doc |
| Locale | No `localeCompare`, `Intl`, `toLocaleString` |
| Result fingerprint | `sha256HexLowercaseUtf8(canonicalFeatureInputUtf8(preimage))` with preimage `{contractVersion, modelPolicyVersion, calibrationProfileId, calibrationProfileFingerprint, consumptionInputFingerprint, canonical result body without resultFingerprint}` — same primitives as E1 |
| Serializer constraints | `canonicalizeFeatureInputValue` rejects `undefined` and non-finite numbers ⇒ absent values are `null`, never omitted-by-undefined; division by zero must be guarded before it can produce `Infinity`/`NaN`; `String(-0)` serializes as `0` |
| Golden | E3 must pin a golden `resultFingerprint` for a fixed fixture under `M3_3E_CALIBRATION_UNSET_V1` |

Note: C1 `populationVariance` uses `**`; that value is already computed and digested upstream and is consumed as data, so it does not affect E2 determinism. E3 must not reuse that helper in fingerprinted code.

---

## 13. Existing LV Estimated Health interaction

`LV_ESTIMATED_HEALTH` (model version 1, policy `1.0.0`, `scoreSemantics='ESTIMATED_HEALTH_NOT_SOH'`) maps absolute resting voltage through chemistry bands to a score, weights measurement kinds, derives confidence from chemistry context, and depends on `now` (`validUntil`, selection).

| # | Mandatory question | E2 answer |
|---|-------------------|-----------|
| 1 | Does the longitudinal model replace `LV_ESTIMATED_HEALTH`? | **NO.** It is a separate, relative, longitudinal evidence layer; LV Estimated Health remains the only LV assessment path |
| 2 | Does E2 feed into (fuse with) `LV_ESTIMATED_HEALTH` now? | **NO.** Different evidence units (per-session descriptors vs individual measurements), absolute vs relative semantics, wall-clock dependence vs pure determinism |
| 3 | Is there evidence overlap / double-counting risk? | **YES.** Both paths consume `LIVE_VOLTAGE` provenance: GE observations carry `sourceMeasurementId` → `BatteryMeasurement` (`sourceKind` `LIVE_VOLTAGE_CLASSIFY`), which may also back LV `REST_60M`/`REST_6H` measurements. E1 does **not** carry measurement ids, so overlap cannot be resolved at E2/E3. Any fusion requires an evidence-overlap ledger keyed on `BatteryMeasurement` ids (`PROD-M3.3G-003`) |
| 4 | Which is authoritative when they disagree? | **Undefined by design in V1** — they do not share an output space (E2 emits no condition). Arbitration is `PROD-M3.3G-002` |
| 5 | Does E2 change the meaning of "estimated health" vs SOH? | **NO.** Four distinct concepts remain: behavioral estimated health (`LV_ESTIMATED_HEALTH`), longitudinal descriptor behavior (E2), workshop SOH (external test), provider SOH (HV `canonical.hv.providerSoh`). E2 claims none of the other three |

`LV_ESTIMATED_HEALTH_SEPARATION_PRESERVED=YES`. `WORKSHOP_SOH_CLAIM_INTRODUCED=NO`.

---

## 14. Readiness separation

| Decision | Value |
|----------|-------|
| E2/E3 output consumed by `battery-readiness.policy.ts` | **NO** |
| `BATTERY_READINESS_POLICY_VERSION` | Unchanged `1.0.0` |
| No-conclusion → readiness `UNKNOWN`/`NOT_READY`/`HINT` | **Forbidden** |
| Descriptor trend → readiness effect | **Forbidden** in V1 |
| Future use | Requires M3.3G product decision + readiness policy version bump (`PROD-M3.3G-006`); even then, shadow/proxy-grade evidence stays non-blocking (invariant J) |

`READINESS_POLICY_CHANGED=NO`.

---

## 15. Persistence / publication boundary

| Decision | Value |
|----------|-------|
| E3 result persisted | **NO** (pure, in-memory value) |
| New `BatteryAssessmentType` | **NO** |
| `BatteryAssessment` / `BatteryPublication` writes | **NO** |
| DTO / API / Master Admin / customer UI | **NO** |
| Nest provider / scheduler / hook | **NO** |
| Feature flag | **NO** |
| D3 production materialization | **NO** — M3.3F gate unchanged |
| Owner of persistence/publication decision | M3.3G (`PROD-M3.3G-004`, `PROD-M3.3G-005`) |

---

## 16. Failure / no-conclusion states

`INSUFFICIENT_EVIDENCE` is first-class: every row below produces a valid, fingerprinted result (not an exception), except malformed input.

| # | Situation | Result |
|---|-----------|--------|
| 1 | `modelEvaluation.inputAvailability='NO_ASSESSMENT_GRADE_INPUT'` | `evaluationStatus=NO_CONCLUSION`, `NO_ASSESSMENT_GRADE_OBSERVATIONS`, `vehicleSummary=NO_EVALUABLE_SEGMENT` |
| 2 | Segment below structural minimum for a metric | Metric `NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL` + `INSUFFICIENT_DISTINCT_ANCHORS` / `INSUFFICIENT_POINTS_FOR_DISPERSION` |
| 3 | Enough total observations but split across segments, each below minimum | Per-segment insufficiency; `MULTI_SEGMENT_NO_POOLING`; no pooled rescue |
| 4 | Evidence temporally concentrated | Descriptors emitted; classification suppressed (`UNDETERMINED_CALIBRATION_REQUIRED` until `CAL-M3.3E-003`) |
| 5 | Charge context unknown (all V1 data) | `CHARGE_CONTEXT_UNCONTROLLED`; Level B `NOT_COMPARABLE_CHARGE_CONTEXT_UNRESOLVED` |
| 6 | Temperature missing / uncontrolled | Context reason codes only; no gate, no adjustment |
| 7 | Anchor unresolved for delta metric | Delta is already `null` upstream for non-`SELECTED` anchors, so those sessions are absent from the delta series; reason code `ANCHOR_UNRESOLVED_FOR_DELTA_METRIC` when any exist; other metrics unaffected. A non-null delta paired with non-`SELECTED` status is an **inconsistent input** ⇒ row 14 (reject) |
| 8 | Outlier-dominated or zero-dispersion series | No deletion; flags only when calibrated; `residualMad=0` ⇒ no statistical flags |
| 9 | Contradictory metrics (descriptors move in different directions) | No reconciliation into a condition; each metric reported independently |
| 10 | Step discontinuity (possible battery replacement / configuration change) | Descriptive `stepChangeCandidate` only; no event claim (BLOCK-M3.3D-003) |
| 11 | Calibration profile UNSET (V1 default) | Every evaluable series `NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED`; `CALIBRATION_NOT_ESTABLISHED` |
| 12 | Quarantined / source-limited sessions exist | `EXCLUDED_NON_ELIGIBLE_SESSIONS_PRESENT`; excluded sessions never enter series |
| 13 | D4 scope `BOUNDED_LATEST_WINDOW` / `NOT_EVALUATED` | Reason code only |
| 14 | Malformed / inconsistent input (contract version mismatch, invalid `anchorAt`, `consumptionInputFingerprint` mismatch on recompute via `computeM3_3E_ConsumptionInputFingerprintV1`, non-null delta with non-`SELECTED` anchor) | **Reject** (typed error) — fail closed, no partial result |

---

## 17. Scientific claim-control matrix

| CLAIM | SUPPORTED_NOW? | REQUIRED_EVIDENCE | STATUS |
|-------|----------------|-------------------|--------|
| "Insufficient evidence for a longitudinal conclusion" | **YES** | Structural/calibrated sufficiency evaluation | `SUPPORTED` |
| "Measured rest-voltage descriptor X changed within segment S (context uncontrolled)" | **YES, descriptively** (statistics only; no classification under UNSET calibration) | Same-segment series, structural minima | `SUPPORTED_DESCRIPTIVE_ONLY` |
| "Voltage behavior changed" (classified direction) | **NO** | Calibrated detection limits (`CAL-M3.3E-006`), sufficiency minima | `CALIBRATION_REQUIRED` |
| "Trusted REST behavior changed" | **NO** | Resolved charge class (calibrated C2), rest-depth + first-point-age bands, trusted wake sampling, natural data | `BLOCKED_CALIBRATION_AND_NATURAL_DATA` |
| "Battery behavior is stable" | **NO** | Calibrated detection power; absence of change is not evidence of stability | `NOT_SUPPORTED` |
| "Battery is worsening" | **NO** | Condition mapping validated against ground truth | `NOT_SUPPORTED` |
| "Battery is healthy" | **NO** | Validated condition model + ground truth | `NOT_SUPPORTED` |
| "Battery is degraded" | **NO** | Validated condition model + ground truth | `NOT_SUPPORTED` |
| "Temperature-adjusted rest behavior" | **NO** | Battery-proximate temperature with age, calibrated stratification | `NOT_SUPPORTED` |
| "Vehicle A's battery is worse than vehicle B's" | **NO** | Cross-vehicle comparability (chemistry, capacity, powertrain) | `NOT_SUPPORTED` |
| "Workshop SOH is X%" | **NO** | Workshop test result (separate evidence source) | `NOT_SUPPORTED` (out of model) |
| "Provider SOH" | **NO** | Provider field (HV path) | `OUT_OF_MODEL` |
| "Remaining useful life is N months" | **NO** | Degradation model + failure ground truth | `NOT_SUPPORTED` |
| "Battery failure predicted" | **NO** | Validated failure labels | `NOT_SUPPORTED` |
| "Battery replacement recommended" | **NO** | Validated condition + product decision | `NOT_SUPPORTED` |
| "Battery was replaced" | **NO** | Workshop/config event signal | `NOT_SUPPORTED` (BLOCK-M3.3D-003) |

---

## 18. Open decisions

### A. Architecture decisions (blocking E3?)

| ID | Question | Why it was open | Resolving evidence | Blocks E3? | Owner phase | Status |
|----|----------|-----------------|--------------------|-----------|-------------|--------|
| ARCH-M3.3E-001 | Output contract shape for the pure evaluator | Not defined before E2 | §11 | NO | E2 | **CLOSED_IN_E2** |
| ARCH-M3.3E-002 | Trend time axis and estimator family | Not defined | §7 (`anchorAt`, Theil-Sen, Kendall counts) | NO | E2 | **CLOSED_IN_E2** |
| ARCH-M3.3E-003 | Cross-segment pooling | E1 preserved segments but model policy undefined | §6.3 (no pooling V1) | NO | E2 | **CLOSED_IN_E2** |
| ARCH-M3.3E-004 | Behavior with UNSET calibration | Risk of inventing numbers | §5.4 fail-closed, named UNSET profile | NO | E2 | **CLOSED_IN_E2** |
| ARCH-M3.3E-005 | Determinism of derived float outputs | Float ops / quantization undefined | §12.2 | NO | E2 | **CLOSED_IN_E2** |
| ARCH-M3.3E-006 | Relation to LV Estimated Health / readiness / persistence | Undefined | §13–§15 | NO | E2 | **CLOSED_IN_E2** |

No architecture question blocking a pure, non-persisted, fail-closed E3 evaluator remains open.

### B. Calibration items (block conclusion-bearing output, not E3 engineering)

| ID | Question | Why unresolved | Resolving evidence | Blocks E3? | Owner phase |
|----|----------|----------------|--------------------|-----------|-------------|
| CAL-M3.3E-001 | Minimum series count for classification | No natural C3 data | M3.3F shadow distributions | NO | M3.3F |
| CAL-M3.3E-002 | Minimum evidence span | Same | M3.3F | NO | M3.3F |
| CAL-M3.3E-003 | Temporal concentration window + limit | Same | M3.3F | NO | M3.3F |
| CAL-M3.3E-004 | Rest-depth bands (= CAL-M3.3D-003) | Relaxation curve unmeasured on fleet | M3.3F repeatability analysis | NO | M3.3F |
| CAL-M3.3E-005 | First-point-age bands | Same | M3.3F | NO | M3.3F |
| CAL-M3.3E-006 | Minimum detectable slope + directional agreement per metric | Noise floor unknown | Same-condition repeatability (NAT-M3.3F-003) | NO | M3.3F |
| CAL-M3.3E-007 | Step-change magnitude | Same | Labeled replacement events (NAT-M3.3F-009) | NO | M3.3F/G |
| CAL-M3.3E-008 | Outlier MAD multiplier | Same | M3.3F residual distributions | NO | M3.3F |
| CAL-M3.3E-009 | Temperature coverage minimum + strata | Temperature is trip-start exterior only | Temperature age evidence (NAT-M3.3F-007) | NO | M3.3F+ |
| CAL-M3.3E-010 | C2 charge-opportunity classifier thresholds | `NOT_PRODUCTION_CALIBRATED`; class always `UNKNOWN` | C2 calibration + engine-running coverage bridge | NO | M3.3C/F |
| CAL-M3.3E-011 | Per-session minimum points/span for slope metric (links CAL-M3.3D-001) | Same | M3.3F | NO | M3.3F |

### C. Product decisions (M3.3G / M3.3H)

| ID | Question | Why unresolved | Resolving evidence | Blocks E3? | Owner phase |
|----|----------|----------------|--------------------|-----------|-------------|
| PROD-M3.3G-001 | Adopt any condition taxonomy | No validated mapping | Ground truth + calibrated model | NO | M3.3G |
| PROD-M3.3G-002 | Arbitration / fusion with `LV_ESTIMATED_HEALTH` | Different output spaces | M3.3G design | NO | M3.3G |
| PROD-M3.3G-003 | Evidence-overlap ledger on `BatteryMeasurement` ids | E1 carries no measurement ids | Contract extension (new E1 version) | NO | M3.3G |
| PROD-M3.3G-004 | Persist evaluation (new type / table) | Out of E2 scope | M3.3G design | NO | M3.3G |
| PROD-M3.3G-005 | Publication eligibility | Same | M3.3G | NO | M3.3G |
| PROD-M3.3G-006 | Readiness integration (policy version bump) | Same | M3.3G + readiness authority | NO | M3.3G |
| PROD-M3.3H-001 | Customer wording (9 locales) + presentation of segmented results | No UI in scope | M3.3H design | NO | M3.3H |
| PROD-M3.3G-007 | Battery replacement / configuration change workflow (BLOCK-M3.3D-003) | No automatic signal | Workshop/config event source | NO | M3.3G |

### D. Natural-data validation items

| ID | Question | Why unresolved | Resolving evidence | Blocks E3? | Owner phase |
|----|----------|----------------|--------------------|-----------|-------------|
| NAT-M3.3F-001 | Do natural C3 rows exist at fleet scale? | Shadow flag OFF (BLOCK-M3.3D-001) | M3.3F activation | NO | M3.3F |
| NAT-M3.3F-002 | Per-vehicle descriptor distributions | Same | M3.3F | NO | M3.3F |
| NAT-M3.3F-003 | Same-condition session repeatability (R1 `SESSION_REPEATABILITY`) | Same | M3.3F | NO | M3.3F |
| NAT-M3.3F-004 | Wake-sampling artifacts (`PARKED_REST_CANDIDATE` vs trusted rest) | Auto wake promotion OFF | Wake-voltage comparison | NO | M3.3F |
| NAT-M3.3F-005 | Telematics-device parasitic draw magnitude | Not measured | Draw estimation study | NO | M3.3F |
| NAT-M3.3F-006 | HEV/PHEV DC-DC top-ups during rest | Powertrain not in E1 | Powertrain-tagged data | NO | M3.3F |
| NAT-M3.3F-007 | Temperature relation and temperature age | Trip-start exterior only | Temperature-aligned data | NO | M3.3F+ |
| NAT-M3.3F-008 | Ground truth for any condition claim | No workshop linkage | Workshop test correlation | NO | M3.3G |
| NAT-M3.3F-009 | Labeled battery replacement events | No signal | Workshop/config records | NO | M3.3G |

---

## 19. Proposed E3 engineering boundary

**E3 scope:** a pure, non-persisted, calibration-parameterized, fail-closed evaluator producing `M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1` from `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1`.

| Item | Boundary |
|------|----------|
| Location | `backend/src/modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/` (next to E1) |
| Proposed files | `longitudinal-health-evaluation.types.ts`, `…constants.ts` (versions, reason codes), `…calibration-profile.ts` (UNSET profile + fingerprint), `…policy.ts` (pure evaluator), `…golden.ts`, `…spec.ts` |
| Allowed imports | E1 types/constants, `computeM3_3E_ConsumptionInputFingerprintV1`, `compareUtf16CodeUnitLexicographic`, `canonicalFeatureInputUtf8`, `sha256HexLowercaseUtf8` |
| Forbidden imports | Nest, Prisma, repositories, `lv-assessment/*`, `battery-readiness.policy.ts`, publication, flags/config, clock |
| Default calibration | `M3_3E_CALIBRATION_UNSET_V1` (`UNCALIBRATED`); every calibrated minimum `null` |
| Output under default | Descriptive statistics + `NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED`; `condition='NOT_ASSESSED'`; `confidence='NOT_APPLICABLE'` |
| Minimum test matrix | Empty input; single observation; two distinct anchors (slope, no MAD); equal anchors; ≥3 anchors (MAD); anchor unresolved exclusion for delta metric; multi-segment A→B→A (no pooling, `SEGMENTED_NO_POOLED_CONCLUSION`); charge `UNKNOWN` reason codes; temperature unknown/mixed; zero MAD; step-change descriptive split with ties; UTF-16 ordering; forbidden-field absence; no-clock (fake timers unchanged output); input immutability; malformed `anchorAt` rejection; golden `resultFingerprint`; fingerprint sensitivity per preimage field; calibration profile change ⇒ fingerprint change; static import guard |
| Non-goals | Persistence, Nest reachability, flags, D3 materialization, readiness, publication, UI, calibration values |

`M3_3E_E3_IMPLEMENTATION_READY=YES` applies **only** to this boundary. A conclusion-bearing model is **not** ready (`M3_3E_CONCLUSION_BEARING_MODEL_READY=NO`), blocked by all B items (notably CAL-M3.3E-010) and D items (notably NAT-M3.3F-001, NAT-M3.3F-008).

---

## 20. Machine-readable decision summary

```yaml
M3_3E_E2_ARCHITECTURE: COMPLETE
M3_3E_E2_CONTRACT: M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1
M3_3E_E2_MODEL_POLICY_VERSION: M3_3E_E2_MODEL_POLICY_V1
M3_3E_E2_DEFAULT_CALIBRATION_PROFILE: M3_3E_CALIBRATION_UNSET_V1
M3_3E_HEALTH_MODEL_IMPLEMENTED: NO
M3_3E_E3_IMPLEMENTATION_READY: YES   # pure, non-persisted, fail-closed evaluator only
M3_3E_CONCLUSION_BEARING_MODEL_READY: NO
SCIENTIFIC_SIGNAL_INVENTORY_COMPLETE: YES
PRIMARY_METRICS_V1: [MEDIAN_REST_VOLTAGE, ROBUST_REST_SLOPE, SHUTDOWN_TO_FIRST_REST_DELTA]
EVIDENCE_SUFFICIENCY_DEFINED: YES
NUMERIC_THRESHOLDS_EVIDENCE_BACKED: NO
CALIBRATION_REQUIRED: YES
COMPARABILITY_CONTRACT_DEFINED: YES
CROSS_VERSION_POOLING_DEFAULT: NO
TREND_SEMANTICS_DEFINED: YES
TREND_TIME_AXIS: anchorAt
TREND_ESTIMATOR: THEIL_SEN_PAIRWISE_MEDIAN_WITH_KENDALL_PAIR_COUNTS
TEMPERATURE_POLICY_DEFINED: YES
TEMPERATURE_ROLE_V1: CONTEXT_ONLY
OUTLIER_POLICY_DEFINED: YES
OUTLIER_DELETION: NEVER
CONFIDENCE_SEPARATE_FROM_CONDITION: YES
CONFIDENCE_NUMERIC_SCORE: FORBIDDEN
INSUFFICIENT_EVIDENCE_FIRST_CLASS: YES
OUTPUT_TAXONOMY_DEFINED: YES
CONDITION_V1: NOT_ASSESSED_ONLY
MODEL_VERSIONING_DEFINED: YES
DETERMINISM_CONTRACT_DEFINED: YES
LV_ESTIMATED_HEALTH_SEPARATION_PRESERVED: YES
LV_ESTIMATED_HEALTH_FUSION_V1: NO
SHARED_LIVE_VOLTAGE_PROVENANCE_RISK: YES   # resolution owned by PROD-M3.3G-003
WORKSHOP_SOH_CLAIM_INTRODUCED: NO
READINESS_POLICY_CHANGED: NO
BATTERY_ASSESSMENT_WRITES_ADDED: NO
BATTERY_PUBLICATION_WRITES_ADDED: NO
PRISMA_CHANGED: NO
MIGRATION_ADDED: NO
RUNTIME_WIRING_ADDED: NO
FEATURE_FLAG_CHANGED: NO
PRODUCTION_DATA_MUTATED: NO
M3_3F_REMAINS_PENDING: YES
D3_RUNTIME_REACHABLE: NO
D4_RUNTIME_REACHABLE: NO
PRODUCTION_MATERIALIZATION_READY: NO
OPEN_ARCHITECTURE_BLOCKERS: []
OPEN_CALIBRATION_ITEMS: [CAL-M3.3E-001, CAL-M3.3E-002, CAL-M3.3E-003, CAL-M3.3E-004, CAL-M3.3E-005, CAL-M3.3E-006, CAL-M3.3E-007, CAL-M3.3E-008, CAL-M3.3E-009, CAL-M3.3E-010, CAL-M3.3E-011]
OPEN_M3_3G_PRODUCT_DECISIONS: [PROD-M3.3G-001, PROD-M3.3G-002, PROD-M3.3G-003, PROD-M3.3G-004, PROD-M3.3G-005, PROD-M3.3G-006, PROD-M3.3G-007, PROD-M3.3H-001]
OPEN_NATURAL_DATA_VALIDATION_ITEMS: [NAT-M3.3F-001, NAT-M3.3F-002, NAT-M3.3F-003, NAT-M3.3F-004, NAT-M3.3F-005, NAT-M3.3F-006, NAT-M3.3F-007, NAT-M3.3F-008, NAT-M3.3F-009]
NEXT_RECOMMENDED_SLICE: M3.3E E3 pure fail-closed longitudinal evaluator (after E2 merge + post-merge seal)
DECISION_STATUS: PROPOSED   # architecture contract; VALIDATED only after E3 fixtures + M3.3F natural data
```
