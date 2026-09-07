# EXP-019 — Video Ground-Truth vs DIMO / Detector Correlation

> **Note:** Superseded for human GT text by `EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` (revised GT-10-P0: deceleration not acceleration). Cadence-wide CRITICAL labels superseded by `EXP_019_BIAS_CONTROL_AND_DECISION_READINESS_2026-09-07.md`. Retained for first-pass methodology.

**Date:** 2026-09-07  
**Session:** `2508b697-f101-4155-a0d3-8436e46bb779`  
**Vehicle:** KS MX 2024 · `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` · token `187336`  
**HF authority layer:** `TRUE_T30_SETTLED` (settlement observations.jsonl + exact-window replay)  
**Overlapping VehicleTrip:** `5c788a26-c9ec-4b57-9abb-71d9cbc257a7` (`04:35:00Z` → `04:57:29Z`, COMPLETED)

> Human video GT supplied independently. This document correlates telemetry/detector layers **without re-interpreting video**.

**Forensic script:** `architecture/drivingintelligence/scripts/exp-019-video-gt-correlation-export.cjs`  
**VPS artifacts:** `/tmp/exp-019-video-gt-correlation/correlation-summary.json`

---

## A. Clock alignment

**Mapping:** CEST = UTC + 02:00 (no additional offset applied).

| GT | Video CEST gap start | DIMO UTC gap start | Δ hours |
|----|----------------------|--------------------|---------|
| GT-10-P0 | `06:35:29.538` | `2026-09-07T04:35:29.538Z` | 2 |
| GT-20-P0 | `06:37:13.913` | `2026-09-07T04:37:13.913Z` | 2 |
| GT-30-P0 | `06:42:54.742` | `2026-09-07T04:42:54.742Z` | 2 |
| GT-30-P1 | `06:46:16.344` | `2026-09-07T04:46:16.344Z` | 2 |
| GT-60-P0 | `06:54:29.814` | `2026-09-07T04:54:29.814Z` | 2 |

```
VIDEO_GT_TIMEZONE_MAPPING_VALID = YES
```

---

## Human ground-truth register (verbatim)

### GT-10-P0

Phase: 10s

DIMO settled gap UTC: `2026-09-07T04:35:29.538Z` → `2026-09-07T04:35:52.304Z`

Video CEST: `06:35:29.538` → `06:35:52.304`

Human GT: clear acceleration. Observed speed approximately 36 km/h → ~88 km/h.

Classification: ACCELERATION

GT_EVENT_PRESENT = YES

### GT-20-P0

Phase: 20s

DIMO settled gap UTC: `2026-09-07T04:37:13.913Z` → `2026-09-07T04:40:02.534Z`

Video CEST: `06:37:13.913` → `06:40:02.534`

Human GT: multiple strong dynamic states. Observed examples: ~47 km/h → ~24 km/h, followed later by acceleration reaching approximately ~109 km/h.

Classification: DECELERATION + ACCELERATION + MULTIPLE_DYNAMIC_EVENTS

GT_EVENT_PRESENT = YES

### GT-30-P0

Phase: 30s

DIMO settled gap UTC: `2026-09-07T04:42:54.742Z` → `2026-09-07T04:44:52.054Z`

Video CEST: `06:42:54.742` → `06:44:52.054`

Human GT: toward the end of the gap approximately ~63 km/h → 0 km/h.

Classification: DECELERATION_TO_STOP

GT_EVENT_PRESENT = YES

### GT-30-P1

Phase: 30s

DIMO settled gap UTC: `2026-09-07T04:46:16.344Z` → `2026-09-07T04:47:35.968Z`

Video CEST: `06:46:16.344` → `06:47:35.968`

Human GT: variable-speed urban driving; not a stable/constant-speed interval.

Classification: VARIABLE_SPEED + MULTIPLE_STATE_CHANGES

GT_EVENT_PRESENT = YES

### GT-60-P0

Phase: 60s

DIMO settled gap UTC: `2026-09-07T04:54:29.814Z` → `2026-09-07T04:56:56.693Z`

Video CEST: `06:54:29.814` → `06:56:56.693`

Human GT shows significant stop/go dynamics. Representative observed speed progression approximately: ~44 → ~34 → ~7 → ~24 → ~31 → ~19 → ~10 km/h before the later stationary/end state.

Classification: DECELERATION + REACCELERATION + STOP_GO + MULTIPLE_DYNAMIC_EVENTS

GT_EVENT_PRESENT = YES

**Note:** Do not classify the entire max gap as stationary — only the late/end section approaches stationary/parking state.

---

## B. Settled HF observations (TRUE T+30)

**Common pattern:** **0 speed buckets strictly inside any gap interior** (exclusive of gap boundary timestamps). Gaps are true telemetry voids for HF_HISTORICAL.

Coordinates: **not available** in settled session (consistent with prior EXP-019 evidence).

### GT-10-P0

| Position | UTC | speed | RPM | TPS | throttle | engine load |
|----------|-----|-------|-----|-----|----------|-------------|
| Gap start (last before) | `04:35:29.538Z` | **0** | — | — | — | **0** |
| Gap end (first after) | `04:35:52.304Z` | **0** | — | — | — | **0** |
| Interior samples | — | **0** | — | — | — | — |

3 buckets after gap: all speed **0** km/h.

### GT-20-P0

| Position | UTC | speed | RPM | TPS | throttle | engine load |
|----------|-----|-------|-----|-----|----------|-------------|
| Gap start | `04:37:13.913Z` | **54** | 1235 | 19.6 | 13.7 | 25.1 |
| Gap end | `04:40:02.534Z` | **36** | 1040 | 3.1 | 11.0 | 8.6 |
| Interior samples | — | **0** | — | — | — | — |

3 before: 66, 66, 66 km/h · 3 after: 36, 48, 47 km/h.

### GT-30-P0

| Position | UTC | speed | RPM | TPS | throttle | engine load |
|----------|-----|-------|-----|-----|----------|-------------|
| Gap start | `04:42:54.742Z` | **0** | 674 | 0 | 11.0 | 12.2 |
| Gap end | `04:44:52.054Z` | **22** | 1328.5 | 10.2 | 12.2 | 11.8 |
| Interior samples | — | **0** | — | — | — | — |

3 before: 56, 54, 53 km/h · 3 after: 21, 25, **63** km/h.

### GT-30-P1

| Position | UTC | speed | RPM | TPS | throttle | engine load |
|----------|-----|-------|-----|-----|----------|-------------|
| Gap start | `04:46:16.344Z` | **0** | 675 | 0 | 11.0 | 15.3 |
| Gap end | `04:47:35.968Z` | **4** | 904 | 23.1 | 14.9 | 37.6 |
| Interior samples | — | **0** | — | — | — | — |

3 before: 63, 42, 37 km/h · 3 after: 47, 54, 48 km/h.

### GT-60-P0

| Position | UTC | speed | RPM | TPS | throttle | engine load |
|----------|-----|-------|-----|-----|----------|-------------|
| Gap start | `04:54:29.814Z` | **12** | 820 | 9.4 | 10.6 | 11.8 |
| Gap end | `04:56:56.693Z` | **14** | 1078 | 14.5 | 13.3 | 20.4 |
| Interior samples | — | **0** | — | — | — | — |

3 before: 12, 12, 12 km/h · 3 after: 28, 21, 29 km/h.

---

## C. HF capture classification

| GT | Class | Rationale |
|----|-------|-----------|
| GT-10-P0 | **NOT_OBSERVED** | Gap interior empty; boundary speeds 0→0 contradict human 36→88 km/h acceleration — dynamic event absent from HF |
| GT-20-P0 | **BOUNDARY_ONLY** | Interior empty; boundary 54→36 km/h hints decel endpoint but misses interior multi-state trajectory (incl. ~109 km/h accel) |
| GT-30-P0 | **BOUNDARY_ONLY** | Interior empty; boundary 0→22 km/h does not reconstruct human 63→0 stop sequence inside gap |
| GT-30-P1 | **BOUNDARY_ONLY** | Interior empty; boundary 0→4 km/h; variable urban dynamics not sampled inside gap |
| GT-60-P0 | **BOUNDARY_ONLY** | Interior empty; boundary 12→14 km/h cannot reconstruct stop/go sequence (~44→…→~10) inside gap |

---

## D. Native DIMO driving events (±10s review tolerance)

**Session total (DIMO `events` API):** 1 native event

| Timestamp (UTC) | Name | Ingested `DrivingEvent` |
|-----------------|------|-------------------------|
| `2026-09-07T04:54:00.000Z` | `behavior.harshAcceleration` | YES — `HARSH_ACCELERATION`, severity 0.6 |

| GT | Native in review window? | Events | Offset from gap start |
|----|--------------------------|--------|------------------------|
| GT-10-P0 | **NO** | — | — |
| GT-20-P0 | **NO** | — | — |
| GT-30-P0 | **NO** | — | — |
| GT-30-P1 | **NO** | — | — |
| GT-60-P0 | **NO** | `behavior.harshAcceleration` at `04:54:00Z` is **29.8s before** gap start (`04:54:29.814Z`) and **before** review start (`04:54:19.814Z`) | −29.8s |

Native events do **not** cover any of the five human-verified gap interiors on this drive (N=1).

---

## E. SynqDrive HF detector output (`TripBehaviorEvent`)

**Session total:** 0 `TripBehaviorEvent` rows for vehicle in experiment window.

| GT | HF-derived event produced? | Reason if no |
|----|---------------------------|--------------|
| All 5 GT | **NO** | Gap interiors contain **zero** HF speed samples → point-pair detectors cannot reconstruct acceleration/braking episodes inside gaps; production path did not emit behavior events at these timestamps |

Detector thresholds were **not** modified for this analysis.

---

## F. Downstream score / load consequence

**Trip-level aggregates exist** for overlapping trip `5c788a26-…`:

| Field | Value |
|-------|-------|
| `drivingScore` / `drivingStressScore` | 16 |
| `brakingStressScore` | 0 |
| `longitudinalStressScore` | 33.4 |

| GT | TripBehaviorEvent | DrivingEvent (native) | Window contribution |
|----|-------------------|----------------------|---------------------|
| GT-10-P0 | NONE | NONE | **NO_CONTRIBUTION** |
| GT-20-P0 | NONE | NONE | **NO_CONTRIBUTION** |
| GT-30-P0 | NONE | NONE | **NO_CONTRIBUTION** |
| GT-30-P1 | NONE | NONE | **NO_CONTRIBUTION** |
| GT-60-P0 | NONE | NONE (nearest native event precedes window) | **NO_CONTRIBUTION** |

Trip-level score exists but **does not preserve per-window physical dynamics** lost inside gaps.

---

## G. Event loss matrix

| GT event | HF historical | Native event | HF detector | Score/load |
|----------|---------------|--------------|-------------|------------|
| GT-10-P0 | **NONE** | **NONE** | **NONE** | **NONE** |
| GT-20-P0 | **BOUNDARY_ONLY** | **NONE** | **NONE** | **NONE** |
| GT-30-P0 | **BOUNDARY_ONLY** | **NONE** | **NONE** | **NONE** |
| GT-30-P1 | **BOUNDARY_ONLY** | **NONE** | **NONE** | **NONE** |
| GT-60-P0 | **BOUNDARY_ONLY** | **NONE** | **NONE** | **NONE** |

---

## H. Information-loss severity

| GT | Severity | Rationale |
|----|----------|-----------|
| GT-10-P0 | **CRITICAL** | Human acceleration entirely absent from all DI authorities; boundaries contradict video speeds |
| GT-20-P0 | **CRITICAL** | Largest gap (168.6s); multi-state dynamics lost; no native/detector/score fallback |
| GT-30-P0 | **HIGH** | Decel-to-stop not reconstructible; boundary end speed 22 km/h ≠ human ~0 km/h |
| GT-30-P1 | **HIGH** | Variable-speed interval unsampled inside 79.6s gap |
| GT-60-P0 | **HIGH** | Stop/go sequence inside 146.9s gap absent; single native harsh-accel precedes gap but does not cover interior |

---

## I. Layered authority hypothesis

**Hypothesis:** HF_HISTORICAL alone is insufficient as sole high-resolution Driving Intelligence authority.

**EXP-019 video-GT evidence:** **PARTIALLY_SUPPORTS** (strong direction; N=1; ascending phase order confounded)

| Layer | Finding |
|-------|---------|
| HF_HISTORICAL | 0/5 gap interiors sampled; 4/5 boundary-only; 1/5 not observed |
| Native DIMO events | 1 session event; **0/5** GT windows covered |
| HF detectors | **0** `TripBehaviorEvent` at GT windows |
| LATEST_LIVE | Not evaluated in this pass (prior RD003: not offline reconstruction authority) |

Layered model (HF + native + optional live surface + confidence-aware reconstruction) is **directionally supported** but **not validated** as an implementation on this drive.

---

## J. Cadence implication (video event preservation)

| Cadence | GT events in gaps | Fully preserved | Partially preserved | Boundary only | Lost (HF) |
|---------|-------------------|-----------------|----------------------|---------------|-----------|
| **10s** | 1 | 0 | 0 | 0 | **1** |
| **20s** | 1 | 0 | 0 | 1 | 0 |
| **30s** | 2 | 0 | 0 | 2 | 0 |
| **60s** | 1 | 0 | 0 | 1 | 0 |

**Interpretation:** Slower polling did **not** uniquely cause gap loss — **10s phase also lost the acceleration event entirely** (NOT_OBSERVED). Large gaps persist at all cadences post-settlement (provider temporal sparsity). Phase exposure duration differs; **N=1** — do not extrapolate fleet-wide.

---

## K. Real dynamics reconstructible today?

| Cadence | Answer | Source composition |
|---------|--------|-------------------|
| **10s** | **NO** | HF boundaries 0→0; no interior; no native/detector fallback |
| **20s** | **PARTIAL** | HF boundary 54→36 only; interior multi-state missing |
| **30s** | **PARTIAL** | HF boundaries only; stop/variable dynamics not inside gaps |
| **60s** | **PARTIAL** | HF boundary 12→14; stop/go interior missing; one native harsh-accel **before** gap |

---

## L. Poll rate vs provider sparsity

| Signal | Evidence |
|--------|----------|
| Polling-induced loss | Request-rate drops 55–84% at slower phases **without** eliminating max gaps |
| Provider sparsity | Identical max gaps at T+25 and T+30; **10s phase** still exhibits 22.8s max gap and 81.5% zero-results |
| Confound | Ascending 10→60 phase order — route/traffic/time not isolated |

```
DOMINANT_LIMITATION = PROVIDER_SPARSITY (with MIXED poll/exposure confound — not sole cause)
```

---

## M. Experiment conclusion

```
BEST_SUPPORTED_CADENCE = NO_CADENCE_CONCLUSION
CONFIDENCE = LOW (N=1; video-GT now verified for 5 windows; all cadences lose interior dynamics)
HF_30S_BLOCK_POLLING_VALIDATED = NO
```

Alternative supported outcome: **dominant problem is provider historical temporal sparsity rather than poll cadence alone.**

---

## N. Recommended next experiment

**RECOMMENDED_NEXT_EXPERIMENT = D** — combination of **A + B**:

1. **Counterbalanced 60→30→20→10 drive** (reduce phase-order confound) — option A  
2. **Same cadence matrix + explicit multi-authority capture** (HF + native events query per phase + document LATEST_LIVE if applicable) — option B  

Justification: Video GT proves physical dynamics occur inside provider gaps at **every** tested poll interval including 10s. Slowing polls reduces request rate but does not restore interior trajectories. Next run should separate **cadence** from **authority completeness** before any production policy change.

**Do not execute in this task.**

---

## O. Authority flags

| Field | Value |
|-------|-------|
| VIDEO_GT_VERIFIED | **YES** (5 human-verified windows) |
| VIDEO_GT_SUPPORTS_HF_HISTORICAL_SOLE_AUTHORITY | **NO** |
| PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED | **NO** |
| READY_FOR_HUMAN_ARCHITECTURE_REVIEW | **YES** |

---

## Cross-links

- Alignment windows: `EXP_019_VIDEO_GT_ALIGNMENT_WINDOWS_2026-09-07.md`
- Live calibration: `LIVE_HF_CALIBRATION_KS_MX_2024_10_20_30_60_2026-09-07.md`
- Detector audit: `evidence/driving-events/DETECTOR_AUDIT.md`
- Native events: `evidence/driving-events/NATIVE_DIMO_EVENTS.md`
