# Canonical Driving Intelligence V2 Design — DI-EV-0034F / F.1

**Date:** 2026-09-03
**Evidence ID:** DI-EV-0034F
**Closeout revision:** DI-EV-0034F.1 (architecture consistency closeout)
**Evidence class:** ARCHITECTURE_DESIGN + DRIVING_INTELLIGENCE_V2_FOUNDATION
**Authority:** DI-EV-0034E / E.1 (`docs/audits/driving-intelligence-rd003-signal-quality-interpretation-2026-09.md`)
**V2 contract compatibility:** `docs/architecture/driving-intelligence-v2.md`
**Machine-readable:** `docs/audits/data/driving-intelligence-v2-design/`  
**Design module:** `backend/src/modules/vehicle-intelligence/driving-intelligence-v2/driving-intelligence-v2-canonical-design.ts`

**Production unchanged:** Driving Score, detectors, tire/brake runtime — **NO** modifications in this phase.

---

## DI-EV-0034F.1 consistency closeout (human summary)

### Why states were split into parallel layers

A flat state list cannot represent coexisting conditions (e.g. **REVERSE + ACCELERATING + HIGH powertrain demand**). The model now uses **orthogonal layers**: `KINEMATIC_STATE`, `DIRECTION_CONTEXT`, `POWERTRAIN_DEMAND_STATE`, plus non-exclusive `TRANSITION_EPISODE_MARKERS`. `STANDSTILL` is a kinematic state; `STOPPED` is not duplicated — stop semantics live in transition markers / `STANDSTILL_EPISODE`.

### Severity vs evidence confidence

**Physical episode severity** measures how intense the motion was (peak accel, duration, Δspeed, specific energy-change proxy). **Reconstruction confidence** measures how certain we are the episode occurred as reconstructed. A episode can be **HIGH severity + LOW reconstruction confidence** without severity being downgraded.

### Reconstruction vs attribution confidence

**Reconstruction confidence:** “Did this kinematic episode physically happen as reconstructed?” (cadence, gaps, stale holds, signal agreement). **Attribution confidence:** “How safely can we interpret this as driver behavior?” (traffic, gradient, weather, payload, ADAS, regen context). Unknown context lowers **attribution** — not reconstruction for well-observed kinematics.

### Native DIMO events vs HF reconstruction

Per `driving-intelligence-v2.md`: **Native provider behavior events** remain `PROVIDER_CLASSIFIED` primary Driver Conduct evidence when capability exists. **HF speed / derived episodes** are primary for **kinematic reconstruction only** — default `ESTIMATED_PROXY`, may upgrade to `RECONSTRUCTED`, **never silently** to `PROVIDER_CLASSIFIED`.

### Episode overlap / double counting

One physical interval → **one primary kinematic episode** for exposure counting. Qualifiers (`STRONG_ACCELERATION_CANDIDATE`), context overlays (`HIGH_POWERTRAIN_DEMAND`), and transition tags (`LAUNCH`) enrich interpretation without creating duplicate primary exposure.

### Conservative brake/tire semantics

Friction-brake load remains **not directly observable**. Tire **thermal load** is not claimed observed — `SPEED_DURATION_EXPOSURE` replaces ambiguous thermal naming; any thermal-risk proxy is `THERMAL_RISK_PROXY_UNVALIDATED`.

### New RD004 preprocessing test

RD004 must compare **qualified raw HF speed** vs **legacy 3-point smoothed speed** for peak attenuation, timing shifts, duration distortion, and false event suppression/creation. **No preprocessing runtime change** in this phase.

---

## Simple human summary

### 1. What is wrong / limited about the current Driving Score architecture?

Production **Driving Impact V1** (`driving-impact-scorer.ts`) computes a composite **vehicle stress score** from per-100 km harsh-event counts (hard/extreme acceleration, hard/extreme braking, kickdown, launch-like, full-braking) plus p95 deceleration and engine-load context. The pipeline upstream treats **speed deceleration as “braking”**, derives acceleration from consecutive speed pairs **without RD003 cadence gating**, assumes **~1 Hz HF semantics** while physical cadence is **~2 s median**, and carries **no episode confidence**. Event detectors (`hf-acceleration.ts`, `hf-braking.ts`) emit binary LIGHT/MODERATE/HARD/EXTREME classifications from point Δv/Δt — adequate for a first-generation stress proxy but **not** a professional driving-intelligence reconstruction layer.

### 2. What parts can stay?

- **DIMO HF ingest** and **providerTimestamp** anchoring (with added gating in V2)
- **hf-preprocessing** spike filter and gap splitting (extended, not replaced wholesale)
- **Driving Impact scorer formulas** for production until V2 cutover (unchanged this phase)
- **Load component provenance framework** (`driving-impact-load-components.ts`)
- **LTE_R1 native-event anchor path** and assessability reporting
- **Trip enrichment orchestration** (`trip-behavior-enrichment.service.ts`) as integration shell

### 3. What will replace simple harsh-event counting?

**Driving Episodes** — multi-sample temporal objects with continuous severity, exposure-normalized trip features, and explicit confidence — feeding interpretable **behavior dimensions** before any future opaque score.

### 4. What is a Driving Episode?

A coherent multi-sample segment (e.g. ACCELERATION_EPISODE, DECELERATION_EPISODE) with `startedAt`/`endedAt` on **providerTimestamp**, kinematic stats (peak/mean accel, Δspeed, duration), optional powertrain context (RPM, throttle, TPS, engine load, gear state), `sourceCoverage`, `confidence`, and `evidenceFlags`. Episodes survive short telemetry gaps when evidence remains coherent; they are **not** one derivative sample = one event.

### 5. How will confidence work?

Two **separate epistemic layers**: **Reconstruction confidence** (did the kinematic episode occur as reconstructed?) and **Attribution confidence** (how safely can we judge driver behavior?). Provider age is **surface-aware** — historical HF delivery age does not automatically reduce reconstruction confidence. **No production weights** until RD004. **No score without reconstruction confidence** in V2.

### 6. How will acceleration be reconstructed safely?

`a = Δv / Δt` using **real providerTimestamp deltas** on HF_HISTORICAL speed, only across qualified sample pairs — excluding stale holds, duplicates, invalid ordering, and unqualified large gaps. RD003 provisional anchor: **2.0 s** max-gap analysis (not production-selected). Jerk is **episode-context only**.

### 7. How will RPM / throttle / TPS be used?

**Secondary** to speed: RPM confirms dynamic episodes; throttle and TPS provide **separate** demand-context channels (not interchangeable). Agreement (speed↑ + RPM↑ + throttle↑) **raises confidence**; missing secondary context does **not** invalidate kinematic episodes.

### 8. How will trip-level behavior be calculated?

A **canonical trip feature vector**: distance, duration, moving/standstill time, cruise fraction, episode counts **normalized per 100 km and driving hour**, strong-dynamic exposure, **separate positive-accel and decel-magnitude percentiles**, **mass-independent specific kinetic energy proxies**, speed variability, stop/launch counts, powertrain-demand fraction, reconstruction/attribution confidence distributions, telemetry coverage, trip reconstruction confidence.

### 9. How will 30/90-day driver trends work?

Weighted rolling distributions over **7/30/90-day** calendar and rolling distance/driving-hour windows: personal baseline, trend, deviation from baseline, fleet-relative comparison — designed to distinguish **one unusual trip** from **persistent behavior**. No production scoring in this phase.

### 10. What can we already estimate for brake load?

**Longitudinal deceleration load** proxies: speed reduction magnitude, initial speed, deceleration intensity, sustained duration, kinetic-energy change proxy, frequency — with explicit **kinematic provenance** and confidence gating. **Not** friction-brake load directly.

### 11. What can we already estimate for tire load?

**Longitudinal tire load** (kinematic proxy), **speed-duration exposure**, **stop-launch load** — all gated. **Lateral tire load: NOT YET OBSERVABLE**. No observed tire temperature/thermal load — any thermal-risk proxy is explicitly unvalidated.

### 12. What remains impossible with current signals?

Friction-brake identification; exact gear-shift timing; independent absolute speed accuracy (RD003); near-real-time feedback; lateral/cornering load; vehicle mass/payload from engine load; direction from unsigned speed alone; LATEST_LIVE authority without freshness proof; raw jerk as harsh-event timing authority.

### 13. Exactly what must RD004 validate?

One ~20–25 min continuous master video (S1–S13), second-phone time reference, cluster-focused: absolute speed accuracy; providerTimestamp offset/drift; true event timing error; stable-cruise false dynamics; acceleration/deceleration reconstruction; candidate cadence gate; RPM/throttle/TPS confirmation; stop/launch reconstruction; gear state; direction/reverse; long continuous telemetry; stale-hold behavior; **preprocessing filter response** (raw vs legacy-smoothed speed). See `rd004-validation-contract.json`.

---

## Part 1 — Current production architecture audit

### Pipeline map (CURRENT_STATE)

```
RAW INPUT          DIMO HF signals(interval:"1s") → HighFrequencyReading[]
       ↓
TRANSFORMATION     hf-preprocessing.ts (spike filter, 3-pt smooth, 5s gap split)
       ↓
EVENT DETECTOR     hf-acceleration.ts | hf-braking.ts | hf-abuse.ts
       ↓                 lte-r1-behavior-enrichment (native events + HF context)
AGGREGATION        trip-behavior-enrichment.service.ts → event counts, abuse score
       ↓
SCORE              driving-impact-scorer.ts → longitudinal/braking/stopGo/highSpeed/thermal
       ↓                 → drivingStressScore (composite)
UI / HEALTH        driving-impact-load-components.ts → tireLoad, brakingLoad, engineLoad
```

### Detector inventory

| Component | Input | Timestamp | Cadence assumption | Threshold/window | Output | Confidence | RD003 conflict | Class |
|-----------|-------|-----------|-------------------|------------------|--------|------------|----------------|-------|
| hf-preprocessing | speed, rpm, throttle, load | provider `timestamp` | consecutive pairs; 5s gap | MAX_ACCEL 25 m/s² | CleanHfPoint[] | none | no stale-hold dedupe | KEEP_WITH_GATE |
| hf-acceleration | speed pairs | provider ts | ~1s comment; any dt>0 | entry 1.5 m/s² | HARD/EXTREME events | none | ~2s cadence noise; no gap gate | REPLACE_WITH_EPISODE_MODEL |
| hf-braking | speed pairs | provider ts | same | entry 1.5 decel | BrakingEvent | none | decel≡braking | REPLACE_WITH_EPISODE_MODEL |
| hf-abuse | HF + rpm/throttle | provider ts | whole-trip segment | FULL_BRAKING 7.5 m/s² | abuse events | feasibility only | kinematic braking abuse | KEEP_WITH_GATE |
| driving-impact-scorer | per-100km rates | trip aggregate | MIN 2 km trip | capLinear refs | 0-100 scores | none | engine load component | KEEP (unchanged) |
| load-components | scores + provenance | trip | rolling 30d window | composite weights | tire/brake/engine load | evidence strength | BRAKING_PROXY_KINEMATICS | KEEP (unchanged) |

Full machine-readable map: `current-vs-future-architecture.json`.

---

## Part 2 — Canonical pipeline (PROPOSED DI-V2)

```
RAW TELEMETRY
        ↓
PHYSICAL SAMPLE NORMALIZATION
        ↓
SIGNAL QUALITY / FRESHNESS GATE
        ↓
KINEMATIC RECONSTRUCTION
        ↓
MULTI-SIGNAL CONTEXT
        ↓
DRIVING STATE SEGMENTATION
        ↓
DRIVING EPISODE RECONSTRUCTION
        ↓
EPISODE CONFIDENCE
        ↓
TRIP FEATURE EXTRACTION
        ↓
BEHAVIOR / LOAD DIMENSIONS
        ↓
FUTURE DRIVING SCORE
        ↓
TIRE / BRAKE LOAD MODELS
```

Every derived value traceable to: source signal, acquisition surface, providerTimestamp, sample identity, cadence, quality flags, derivation method.

---

## Parts 3–18 — Design summaries

Detailed schemas in `docs/audits/data/driving-intelligence-v2-design/`:

| Part | Topic | Artifact |
|------|-------|----------|
| 3 | Physical sample normalization | `current-vs-future-architecture.json` (physicalSampleNormalization) |
| 4 | Quality gating | `quality-gate-design.json` |
| 5 | Kinematic reconstruction | `signal-authority-model.json` (DERIVED_KINEMATICS) |
| 6 | Driving state model | `driving-state-model.json` |
| 7 | Episode reconstruction | `episode-taxonomy.json` |
| 8 | Semantic distinctions | `episode-taxonomy.json` (semanticDistinctions) |
| 9 | Multi-signal fusion | `signal-authority-model.json` |
| 10 | Episode confidence | `episode-confidence-model.json` |
| 11 | Episode severity | `episode-taxonomy.json` (severityModel) |
| 12 | Behavior dimensions | `driver-behavior-dimensions.json` |
| 13 | Trip feature vector | `trip-feature-vector.json` |
| 14 | High-timeframe aggregation | `high-timeframe-aggregation.json` |
| 15 | Brake load foundation | `brake-load-foundation.json` |
| 16 | Tire load foundation | `tire-load-foundation.json` |
| 17 | Context fairness | `current-vs-future-architecture.json` (contextFairness) |
| 18 | Legacy vs V2 migration | `migration-plan.json` + component classifications in architecture JSON |

---

## Part 19 — RD004 validation contract

**Status:** PLANNED — do not invent results.

Canonical capture: one continuous master video ~20–25 min, scenarios S1–S13, second phone as independent time reference (visible start/end), cluster-focused recording.

RD004 must validate: absolute speed accuracy; providerTimestamp offset/drift; true event timing error; stable-cruise false dynamics; acceleration reconstruction; candidate cadence gate; RPM/throttle/TPS confirmation; stop/launch reconstruction; deceleration reconstruction; gear state; direction/reverse; long continuous telemetry; stale-hold behavior.

Artifact: `rd004-validation-contract.json`.

---

## Part 20 — What DI-EV-0034F must NOT do

- Score weights, penalties, final harsh thresholds
- Production confidence weights or max-gap threshold
- Production tire/brake wear formulas
- Runtime cutover or deployment
- RD004 execution or invented RD004 results

---

## Recommended phase sequence

1. **DI-EV-0034F** — Canonical design (this document)  
2. **RD004** — Controlled validation drive  
3. **DI-EV-0034G** — RD004 evidence ingestion  
4. **DI-EV-0034H** — Episode parameter calibration  
5. **DI-EV-0034I** — Behavior dimension calibration  
6. **DI-EV-0034J** — Driving Score V2 design  
7. **DI-EV-0034K** — Brake/tire load integration  

---

## Status flags

| Flag | Value |
|------|-------|
| ORTHOGONAL_STATE_MODEL_DESIGNED | YES |
| PHYSICAL_SEVERITY_SEPARATED_FROM_CONFIDENCE | YES |
| RECONSTRUCTION_CONFIDENCE_DESIGNED | YES |
| ATTRIBUTION_CONFIDENCE_DESIGNED | YES |
| NATIVE_EVENT_AUTHORITY_CONTRACT_PRESERVED | YES |
| HF_KINEMATIC_AUTHORITY_SCOPE_EXPLICIT | YES |
| EPISODE_OVERLAP_POLICY_DESIGNED | YES |
| PRIMARY_EXPOSURE_DOUBLE_COUNT_PREVENTED | YES |
| POSITIVE_NEGATIVE_DYNAMICS_SEPARATED | YES |
| MASS_INDEPENDENT_ENERGY_PROXY_EXPLICIT | YES |
| TIRE_THERMAL_DIRECT_OBSERVATION_CLAIMED | NO |
| PROVIDER_AGE_POLICY | SURFACE_AWARE |
| RD004_PREPROCESSING_RESPONSE_VALIDATION_ADDED | YES |
| FLEET_COMPARABLE_COHORT_REQUIREMENT_ADDED | YES |
| PRODUCTION_SCORE_CHANGED | NO |
| PRODUCTION_DETECTORS_CHANGED | NO |
| TIRE_RUNTIME_CHANGED | NO |
| BRAKE_RUNTIME_CHANGED | NO |
| DEPLOYED | NO |
| READY_FOR_RD004_CONTROLLED_VALIDATION | YES |

---

## Related artifacts

- RD003 authority: `docs/audits/data/rd003-signal-quality/`
- Prior V2 contract (preserved, superseded for reconstruction design): `docs/architecture/driving-intelligence-v2.md`
- Design invariants tested: `driving-intelligence-v2-canonical-design.spec.ts` (13 tests)
