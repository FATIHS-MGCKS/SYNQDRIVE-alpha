# EXP-019 — Bias-Control Pass & Architectural Decision Readiness

**Date:** 2026-09-07  
**Session:** `2508b697-f101-4155-a0d3-8436e46bb779`  
**Vehicle:** KS MX 2024 · token `187336`  
**HF authority:** `TRUE_T30_SETTLED`  
**Export script:** `exp-019-bias-control-export.cjs`  
**VPS artifacts:** `/tmp/exp-019-video-alignment/`

> This pass corrects over-broad cadence claims from prior EXP-019 artifacts while preserving strong **local** gap-window findings. No runtime code, production HF policy, detector thresholds, score weights, or tire/brake models were changed.

---

## A. Selection-bias audit

| Field | Value |
|-------|-------|
| `GT_WINDOW_SELECTION` | **GAP_CONDITIONED** |
| `GT_WINDOWS_RANDOM_SAMPLE` | **NO** |
| `CADENCE_WIDE_FAILURE_RATE_FROM_5_GT_WINDOWS` | **NOT_SUPPORTED** |
| `CONTROL_WINDOW_SELECTION_AUTHORITY` | **VIDEO_FIRST** |
| `CONTROL_WINDOWS_SELECTED_FROM_TELEMETRY` | **NO** |

The five human GT windows (GT-10-P0 … GT-60-P0) were selected because they overlap **material persistent telemetry gaps** (≥10s, transition-excluded). They are **not** a random sample of all driving behavior during each cadence phase.

### What gap-conditioned GT **can** establish

- What physical dynamics can be **lost** when a material HF gap occurs
- Whether alternative authorities (native DIMO events, TripBehaviorEvent, boundary HF) **recover** that loss
- **Severity of local information loss** inside specific gap interiors

### What gap-conditioned GT **cannot** alone establish

- Probability that any random maneuver is lost
- Percentage of the whole drive reconstructed correctly
- Cadence-wide detector recall
- Cadence-wide score error
- Cadence-wide **CRITICAL** risk labels

---

## B. Over-strong claim audit

| Claim | Status | Correction |
|-------|--------|------------|
| `10S/20S/30S/60S_DI_RECONSTRUCTION_RISK=CRITICAL` (cadence-wide) | **OVERSTATED** | Split into `LOCAL_GAP_FAILURE_SEVERITY` + `CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE` |
| `SCORE_INPUT_LOSS=YES` (all GT windows) | **OVERSTATED** | `SCORE_INPUT_LOSS=POTENTIAL` or `UNKNOWN` — no counterfactual score replay |
| `HF_SOLE_AUTHORITY_SUFFICIENT=NO` | **SUPPORTED_LOCALLY_ONLY** | Scope: `HF_SOLE_HIGH_FIDELITY_AUTHORITY=NO` for reviewed gap interiors |
| `TOTAL_DYNAMIC_LOSS` / `MAJOR_DYNAMIC_LOSS` in gap windows | **SUPPORTED_LOCALLY_ONLY** | Valid per-window; do not propagate to cadence |
| `MISSED_BY_ALL_DI_AUTHORITIES` (gap interiors) | **SUPPORTED_LOCALLY_ONLY** | Gap-conditioned N=5 |
| `HF useful as partial authority` | **SUPPORTED** | Control windows show FULL/PARTIAL HF outside gaps |
| Cadence-wide failure rate from 5 GT windows | **OVERSTATED** | **NOT_SUPPORTED** |

```
OVERBROAD_CADENCE_RISK_CLAIMS_CORRECTED = YES
WINDOW_LOCAL_LOSS_PRESERVED = YES
```

---

## C. Control-window methodology

Eight control windows selected **video-first** before telemetry inspection:

- Video continuously visible on overlay timeline
- Timestamps unambiguous (CEST → UTC −2h)
- Vehicle moving or dynamically changing
- **No overlap** with gaps ≥10s, transition windows, or GT gap interiors
- Comfortably inside `PHASE_NATIVE` interval
- No phone-call / video-cut contamination

Mixture: steady driving, normal acceleration/deceleration, stop/go where naturally present.

Controls were **not** selected because telemetry looked good.

---

## D. Control-window ground-truth register

| ID | Phase | Video local | UTC | Behavior | HF samples | HF coverage | Dynamic shape |
|----|-------|-------------|-----|----------|------------|-------------|---------------|
| CTRL-10-01 | 10s | 06:35:53–06:36:15 | 04:35:53–04:36:15Z | NORMAL_ACCELERATION | 16 | FULL | YES |
| CTRL-10-02 | 10s | 06:36:15–06:36:40 | 04:36:15–04:36:40Z | MIXED_DYNAMIC | 13 | FULL | YES |
| CTRL-20-01 | 20s | 06:36:50–06:37:10 | 04:36:50–04:37:10Z | STEADY_SPEED | 5 | PARTIAL | PARTIAL |
| CTRL-20-02 | 20s | 06:40:15–06:41:20 | 04:40:15–04:41:20Z | MIXED_DYNAMIC | 23 | FULL | YES |
| CTRL-30-01 | 30s | 06:42:16–06:42:50 | 04:42:16–04:42:50Z | STEADY_SPEED | 4 | PARTIAL | PARTIAL |
| CTRL-30-02 | 30s | 06:47:38–06:48:08 | 04:47:38–04:48:08Z | NORMAL_ACCELERATION | 2 | PARTIAL | PARTIAL |
| CTRL-60-01 | 60s | 06:49:23–06:50:15 | 04:49:23–04:50:15Z | MIXED_DYNAMIC | 5 | PARTIAL | YES |
| CTRL-60-02 | 60s | 06:57:00–06:57:28 | 04:57:00–04:57:28Z | NORMAL_DECELERATION | 14 | FULL | YES |

Machine-readable: `/tmp/exp-019-video-alignment/control-window-register.json`

---

## E. Control vs gap authority correlation

Same authority stack as gap GT register: TRUE T+30 settled HF, phase-native records, speed/RPM/TPS/load, coordinates (none), DIMO native events, TripBehaviorEvent, HF-derived detectors, impact/stress aggregates, DI V2 (not available).

**Controls:** 0/8 native events relevant; 0/8 TripBehaviorEvent relevant — consistent with session-level absence, not evidence of mitigation.

---

## F. Video ↔ telemetry anchor error

Populations reported **separately** (do not combine gap-boundary anchors with dense control samples).

| Population | Anchors | Median \|Δt\| ms | P90 \|Δt\| ms | Median \|Δspeed\| km/h | P90 \|Δspeed\| km/h |
|------------|---------|------------------|---------------|------------------------|---------------------|
| **GAP_WINDOWS** | 38 (incl. interior sequence anchors) | 186 | 534 | 21 | 61 |
| **CONTROL_WINDOWS** | 24 | 1106 | 6078 | 8.5 | 32 |

Gap-window speed errors are dominated by **HF void interiors** and boundary mismatches (e.g. GT-20-P0 end: video ~111 vs HF 36). Control windows show materially lower median speed error when HF samples exist.

---

## G. Gap vs control reconstruction comparison

### TABLE 1 — GAP VS CONTROL

| Metric | GAP GT | CONTROLS |
|--------|--------|----------|
| windows | 5 | 8 |
| dynamic windows | 5 | 8 |
| HF full | 0 | 4 |
| HF partial | 0 | 4 |
| HF none | **5** | **0** |
| native mitigated | 0 | 0 |
| DI mitigated | 0 | 0 |
| not assessable | 1 (GT-30-P0 video cuts) | 0 |

```
GAP_VS_CONTROL_RECONSTRUCTION_DIFFERENCE = CLEAR_DIFFERENCE
```

Reconstruction quality **materially differs**: gap-conditioned windows show universal HF interior void; non-gap controls show FULL or PARTIAL HF coverage with preserved dynamic shape in most windows.

---

## H. Whole-phase coverage context

### TABLE 2 — PHASE GAP EXPOSURE

| | **10s** | **20s** | **30s** | **60s** |
|---|---------|---------|---------|---------|
| phase duration | 306.9 s (5.1 min) | 302.4 s (5.0 min) | 392.6 s (6.5 min) | 722.1 s (12.0 min) |
| fraction inside ≥10s gaps | **7.4%** | **65.7%** | **68.4%** | **58.0%** |
| fraction inside ≥20s gaps | 7.4% | **55.8%** | **65.9%** | **39.7%** |
| fraction inside ≥60s gaps | 0% | **55.8%** | **50.2%** | **20.3%** |

**Interpretation:** 10s phase has a **single** 22.8s gap (~7% of phase). 20s/30s/60s phases have **majority** of phase time inside ≥10s gaps — but this does **not** imply cadence-wide reconstruction failure; it quantifies **exposure** to sparse regions.

---

## I. Dynamic exposure estimate

| Field | Value |
|-------|-------|
| `OBSERVED_DYNAMIC_TIME_IN_GAPS` | **UNKNOWN** |
| `OBSERVED_DYNAMIC_TIME_OUTSIDE_GAPS` | **UNKNOWN** |

Full-drive video continuity is insufficient (manual cuts reported) to rigorously partition observed dynamic time. Do not claim full-trip event recall.

---

## J. HF sole-authority reassessment

| Field | Value |
|-------|-------|
| `HF_USEFUL_AS_PARTIAL_AUTHORITY` | **YES** |
| `HF_SOLE_HIGH_FIDELITY_AUTHORITY` | **NO** |
| `HF_SOLE_AUTHORITY_SUFFICIENT_FOR_HIGH_FIDELITY_RECONSTRUCTION` | **NO** (gap windows) |

**Supported because:** video-confirmed dynamic trajectories occur inside settled HF voids; 0 interior HF speed samples in all 5 gap GT windows; native events and TripBehaviorEvent did not reconstruct those windows.

**Does NOT imply:** HF has no value; all HF windows unreliable; HF cannot contribute to DI.

---

## K. Architecture options (evidence only — no implementation)

| Option | Description | Classification |
|--------|-------------|----------------|
| **A** | HF_HISTORICAL-only | **CONTRADICTED** for high-fidelity gap-window reconstruction |
| **B** | HF + DIMO native events | **PROMISING_BUT_UNPROVEN** |
| **C** | HF + LATEST/LIVE capture/replay | **PROMISING_BUT_UNPROVEN** |
| **D** | Multi-authority fusion (HF + native + latest/live) | **PROMISING_BUT_UNPROVEN** |
| **E** | Reference Capture / Flight Recorder for calibration only; production post-trip separate | **SUPPORTED_BY_CURRENT_EVIDENCE** |

Do not select production architecture from N=1 ascending drive.

---

## L. Next experiment — counterbalanced drive (EXP-020 proposal)

| Field | Value |
|-------|-------|
| Sequence | **60s → 30s → 20s → 10s** (counterbalanced vs EXP-019) |
| Vehicle | KS MX 2024 (if available) |
| Machinery | Same Reference Capture + settlement/replay |
| Video | Timestamped full-drive overlay |
| GT methodology | Same gap GT + control register |
| **Bias control** | Predefine control windows on **video before** inspecting telemetry gaps |

**Workflow:** Human/video analyst marks physical maneuvers and control windows first → telemetry analyst maps gaps second.

---

## M. Sample size / stopping rule

| Rule | Value |
|------|-------|
| Minimum before cadence preference | EXP-019 ascending + **one** counterbalanced descending run |
| After two runs, if results conflict | `MORE_REFERENCE_DATA_REQUIRED=YES` |
| If results agree strongly | Cadence may become **CANDIDATE** — not production-approved |
| Production cutover | Separate validation gate |

---

## N. Revised cadence risk semantics

| Cadence | `LOCAL_GAP_FAILURE_SEVERITY` | `CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE` |
|---------|------------------------------|------------------------------------------|
| **10s** | HIGH | LOW |
| **20s** | CRITICAL (168.6s max gap) | UNKNOWN |
| **30s** | HIGH | UNKNOWN |
| **60s** | HIGH | UNKNOWN |

Prior `DI_RECONSTRUCTION_RISK=CRITICAL` labels for entire cadences are **withdrawn**.

---

## O. Score / load claim control

Per GT window (preserved from event register):

| Window | `PHYSICAL_DYNAMIC_INFORMATION_LOST` | `PRODUCTION_SCORE_MATERIALLY_AFFECTED` | `BRAKE_LOAD` | `TIRE_LOAD` |
|--------|-------------------------------------|------------------------------------------|--------------|-------------|
| GT-10-P0 | YES | UNKNOWN | UNKNOWN | UNKNOWN |
| GT-20-P0 | YES | UNKNOWN | UNKNOWN | UNKNOWN |
| GT-30-P0 | YES (telemetry) / N_A (video) | UNKNOWN | UNKNOWN | UNKNOWN |
| GT-30-P1 | YES | UNKNOWN | UNKNOWN | UNKNOWN |
| GT-60-P0 | YES | UNKNOWN | UNKNOWN | UNKNOWN |

`SCORE_INPUT_LOSS` downgraded from YES → **POTENTIAL** (plausible but not counterfactually proven).

---

## TABLE 3 — CLAIM SCOPE

| Claim | Status |
|-------|--------|
| HF useful as partial authority | **SUPPORTED** |
| HF sufficient as sole high-fidelity authority | **SUPPORTED_LOCALLY_ONLY** (rejection in gap windows) |
| Native events mitigate observed GT gaps | **SUPPORTED_LOCALLY_ONLY** (NO at 5/5 windows) |
| Other authority mitigates observed GT gaps | **SUPPORTED_LOCALLY_ONLY** (NO at 5/5 windows) |
| Cadence-wide CRITICAL risk supported | **NOT_SUPPORTED** |
| Score impact proven | **NOT_SUPPORTED** |
| Brake-load impact proven | **NOT_SUPPORTED** |
| Tire-load impact proven | **NOT_SUPPORTED** |

---

## S. Architectural decision readiness

```
ARCHITECTURAL_DECISION_READINESS = READY_FOR_EXPERIMENT_DESIGN_DECISION
PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED = NO
```

EXP-019 supports **hypothesis refinement** and **EXP-020 experiment design**. It does **not** support production architecture cutover or cadence selection.

---

## Cross-links

| Artifact | Path |
|----------|------|
| Gap GT event register | `EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` |
| Alignment windows | `EXP_019_VIDEO_GT_ALIGNMENT_WINDOWS_2026-09-07.md` |
| Prior correlation (partially superseded) | `EXP_019_VIDEO_GT_VS_TELEMETRY_CORRELATION_2026-09-07.md` |
| Live calibration closeout | `LIVE_HF_CALIBRATION_KS_MX_2024_10_20_30_60_2026-09-07.md` |

### VPS machine-readable

| File | Path |
|------|------|
| Control register | `control-window-register.json` |
| Gap vs control | `gap-vs-control-comparison.json` |
| Phase gap fractions | `phase-gap-fractions.json` |
| Anchor errors | `anchor-error-summary.json` |
| Decision readiness | `decision-readiness.json` |
