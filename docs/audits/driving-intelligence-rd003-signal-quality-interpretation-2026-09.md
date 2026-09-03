# RD003 Signal Quality Interpretation — DI-EV-0034E / E.1

**Date:** 2026-09-03
**Evidence ID:** DI-EV-0034E
**Closeout revision:** DI-EV-0034E.1 (correctness closeout)
**Evidence class:** SIGNAL_QUALITY + DRIVING_INTELLIGENCE_FOUNDATION
**Session:** DIMO_LTE_R1_REFERENCE_DRIVE_003

## DI-EV-0034E.1 correctness closeout

Human review corrected interpretation/reporting defects before DI-EV-0034F:

- **Alignment-fit MAE ≠ independent accuracy** — `HF_SPEED_ALIGNMENT_FIT_MAE_KMH` (~8.46) is in-sample fit on STRONG basins discovered with the same video GT. `HF_SPEED_INDEPENDENT_ACCURACY_MAE_KMH` is reported only from deterministic holdout evaluation (~7.85 where evaluated).
- **Clip taxonomy** — `UNIQUE_ALIGNMENT_SUPPORTED_CLIPS=2`, `AMBIGUOUS_CLIPS_WITH_STRONG_SPEED_BASIN=6`.
- **Negative controls fixed** — IMG_2804 / IMG_2809 score only declared stable-cruise GT windows (`NEGATIVE_CONTROL_ARTIFICIAL_DYNAMICS=ELEVATED` for both).
- **Acceleration semantics** — `accelerationDistributionStdMps2` (not “noise”); `PROVISIONAL_CANDIDATE_MAX_GAP` (not production recommendation).
- **LATEST_LIVE** — `LATEST_LIVE_DIRECT_VIDEO_VALIDATION=INSUFFICIENT_EVIDENCE` (1 matched point); `LATEST_LIVE_GENERAL_DATA_UTILITY=CONTEXT_WITH_FRESHNESS_GATING` (median cadence ~6s, stale holds).
- **Session coverage** — per-signal `OBSERVED_SPAN_*`, `TEMPORAL_CONTINUITY`, gap metrics replace hardcoded `FULL_SESSION`.
- **Powertrain** — lag analysis (0–4s) and event-direction agreement drive interpretations.
- **Ratings** — each signal has `RATING`, `EVIDENCE_BASIS`, `LIMITATION` in `signal-quality-summary.json`.

## Executive summary

The RD003 time-alignment methodology (DI-EV-0033 through DI-EV-0034D.2) has completed its job. This phase answers the product question: **how good are the available DIMO / SynqDrive signals for professional driving-intelligence reconstruction?**

**Ground truth remains unvalidated** (`GROUND_TRUTH_VALIDATED=NO`). Speed fingerprint information is demonstrably present, but a complete nine-clip absolute chronology is unresolved. No production Driving Score changes were made.

### Simple human summary

| Signal / timeline | Rating |
|-------------------|--------|
| SPEED | USEFUL_WITH_GATING |
| RPM | USEFUL_WITH_GATING |
| THROTTLE (obdThrottlePosition) | SECONDARY_DEMAND_CONTEXT |
| TPS (powertrainCombustionEngineTPS) | SECONDARY_DEMAND_CONTEXT |
| ENGINE_LOAD | POWERTRAIN_DEMAND_CONTEXT_ONLY |
| ACTUAL_GEAR | CONTEXT_ONLY |
| GEAR_RATIO | CONTEXT_ONLY |
| DERIVED_ACCELERATION | USEFUL_WITH_GATING |
| DERIVED_JERK | WEAK |
| PROVIDER_TIMESTAMP | BEST_AVAILABLE_PHYSICAL_EVENT_TIME_AUTHORITY |
| SYNQ_RECEIVED_AT | NOT_RELIABLE |

---

## 1. Can DIMO speed represent real driving dynamics?

**Yes, with gating.** HF_HISTORICAL speed on `providerTimestamp` shows strong fingerprint match to external sparse video GT across eight per-clip STRONG_CANDIDATE basins. Episode shape, ramps, and stops are recoverable at ~2 s median new-physical-sample cadence.

## 2. How accurately?

Across qualified STRONG_CANDIDATE basins (Tier A — **alignment-fit**, not independent accuracy):

- **HF_HISTORICAL alignment-fit MAE:** ~8.5 km/h (`HF_SPEED_ALIGNMENT_FIT_MAE_KMH`, 109 matched GT points)
- **Within-clip holdout MAE:** ~7.85 km/h (`HF_SPEED_WITHIN_CLIP_HOLDOUT_MAE_KMH` — generalization evidence only)
- **`HF_SPEED_INDEPENDENT_ABSOLUTE_ACCURACY_MAE_KMH`:** `null` (`INDEPENDENT_ABSOLUTE_ACCURACY_VALIDATED=NO`)
- **Unique-alignment holdout:** 1 clip evaluated (IMG_2805); **ambiguous diagnostic holdout:** 6 clips
- **HF aggregate RMSE:** ~12.2 km/h
- **Max absolute error:** ~52 km/h (outlier episodes; not typical)

`IN_SAMPLE_ALIGNMENT_FIT_NOT_INDEPENDENT_ACCURACY=YES`. Per-clip MAE varies; best clips approach single-digit km/h under strong basins. This is **candidate alignment evidence**, not validated global truth.

## 3. At what temporal resolution?

- **HF_HISTORICAL speed:** ~2.0 s median new physical sample cadence (providerTimestamp deltas after dedupe + stale-hold exclusion)
- **Interpolation gap policy (alignment):** 3 s max for HF
- **LATEST_LIVE:** nominally faster retrieval but **stale holds** and extreme provider-sample age tails (p90 multi-second to thousands of seconds) require gating

## 4. Is HF better than LATEST_LIVE for driving reconstruction?

**For offline episode reconstruction: generally yes.** HF_HISTORICAL provides denser unique physical samples and better video-GT coverage in qualified basins. `LATEST_LIVE_DIRECT_VIDEO_VALIDATION=INSUFFICIENT_EVIDENCE` (only ~1 matched GT point). `LATEST_LIVE_GENERAL_DATA_UTILITY=CONTEXT_WITH_FRESHNESS_GATING` — median cadence ~6s, stale-hold exposure, large provider-age tail. LATEST_LIVE may still help near-real-time surfaces when freshness is explicitly evaluated — not assumed from surface name alone.

## 5. Is synqReceivedAt suitable for physical event timing?

**No.** `synqReceivedAt` is delivery/ingress timing. Ingress-time alignment was not supported for any clip (`INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS=0`). Physical events must anchor on `providerTimestamp` with explicit provider-sample-age and stale-hold awareness.

## 6. Can acceleration be reconstructed reliably?

**Partially / weak without conservative gating.** Derived longitudinal acceleration from speed using true `providerTimestamp` Δt:

| Max-gap policy | Reliable accel fraction |
|----------------|----------------------|
| 1.5 s | ~39% |
| 2.0 s | ~63% |
| 3.0 s | ~75% |
| 5.0 s | higher coverage, more interpolation-dominated risk |

**Provisional analysis anchor:** 2.0 s (not selected for production). Stale-hold duplicates are excluded. Conclusion: **USEFUL_WITH_GATING** at best; classified **WEAK** in summary due to coverage/noise trade-offs.

## 7. Can jerk be reconstructed reliably?

**Not for direct harsh-event timing.** Raw cadence-aware jerk without smoothing: `JERK_DIRECT_USE=EPISODE_CONTEXT_ONLY` at 2 s gap policy (~55% reliable jerk fraction). High sensitivity to Δt noise. Suitable only as contextual episode support, not instantaneous authority.

## 8. Can RPM support acceleration / shift interpretation?

**Yes as secondary dynamic confirmation (Tier B).** `powertrainCombustionEngineSpeed` is dynamically informative on HF with event-correlated support around qualified speed episodes. **Shift signature detectability: PARTIAL** — IMG_2810 video S2→S3 landmark exists, but RPM alone does not prove precise shift timing.

## 9. Are throttle and TPS useful and how?

**Yes, separately, as secondary demand context.** `obdThrottlePosition` and `powertrainCombustionEngineTPS` are **not** interchangeable — kept separate in all analysis. Both show dynamic range and plausible correlation with speed/RPM in aligned windows. Classification: **SECONDARY_DEMAND_CONTEXT** (USEFUL_WITH_GATING).

## 10. What does engine load actually contribute?

**Powertrain demand context only.** `obdEngineLoad` may support high-demand episode context and stress estimation **beyond** RPM+throttle in some windows, but must **not** be interpreted as vehicle mass, payload, or road load. Rating: **CONTEXT_ONLY**.

## 11. Can ActualGear identify state?

**Yes.** Gear state is observable (especially LATEST_SLOW). `GEAR_STATE_USEFUL=YES`.

## 12. Can ActualGear identify exact shift timing?

**No.** `GEAR_CHANGE_TIMING_OBSERVABILITY=NO`, `PRECISE_SHIFT_TIMING_USEFUL=NO`. Cadence too slow for sub-second shift timing despite video landmark on IMG_2810.

## 13. Can reverse direction be reconstructed?

**Partially.** IMG_2811 video GT documents forward → stop → reverse → stop → forward. Unsigned speed magnitude cannot determine direction. Gear/state telemetry provides **PARTIAL** complement. `DIRECTION_RECONSTRUCTION_CAPABILITY=PARTIAL`.

## 14. Which signals are safe for production Driving Score?

**Only speed (HF_HISTORICAL, providerTimestamp-aligned, confidence-gated)** is nominated as safe primary input for a **future** redesigned score. This phase does **not** modify production Driving Score.

## 15. Which signals require cadence/confidence gating?

- powertrainCombustionEngineSpeed  
- obdThrottlePosition  
- powertrainCombustionEngineTPS  
- derived longitudinal acceleration  
- LATEST_LIVE speed  

## 16. Which signals should never be used as direct authorities?

- synqReceivedAt as physical event time  
- obdEngineLoad as mass/payload proxy  
- raw jerk without cadence qualification  
- gear timing without cadence proof  
- unsigned speed alone for direction  
- LATEST_LIVE without stale-hold gating  

---

## Evidence tiers

| Tier | Class | Signals |
|------|-------|---------|
| A | DIRECT_VIDEO_VALIDATION | speed (numeric), discrete video facts (gear display, stop, direction, shift) |
| B | ALIGNED_EVENT_CORRELATED_SUPPORT | RPM, throttle, TPS, engine load in qualified speed windows |
| C | STATE_CONTEXT | ActualGear, ActualGearRatio |

---

## Negative controls

IMG_2804 and stable early IMG_2809 (negative-control cruise clips): telemetry should not invent large artificial acceleration/braking bursts. Analysis reports cruise speed error dispersion; elevated artificial-motion risk flagged when HF error std-dev exceeds threshold.

---

## Proposed signal authority model (not implemented)

| Class | Members |
|-------|---------|
| PRIMARY_KINEMATIC_AUTHORITY | speed (HF_HISTORICAL, providerTimestamp) |
| SECONDARY_DYNAMIC_CONFIRMATION | powertrainCombustionEngineSpeed |
| POWERTRAIN_CONTEXT | obdThrottlePosition, powertrainCombustionEngineTPS, obdEngineLoad |
| STATE_CONTEXT | powertrainTransmissionActualGear, powertrainTransmissionActualGearRatio |
| DELIVERY_ONLY | synqReceivedAt, requestStartedAt |
| UNSUITABLE | ingress-as-physics, ungated LATEST_LIVE, mass-from-load |

### Proposed confidence factors (documentation only)

sampleCadenceMedianSeconds, providerSampleAgeP90Seconds, staleHoldDurationSeconds, acquisitionSurface, supportingSignalAgreementCount, alignmentBasinCoverage, interpolationGapSeconds, missingnessRate

---

## Readiness

| Use case | Status |
|----------|--------|
| Offline trip reconstruction | READY_WITH_GATING |
| Near-real-time feedback | NOT_READY |
| Post-trip driving score (production) | FOUNDATION_ONLY_NOT_PRODUCTION |

**READY_FOR_DI_EV_0034F_DRIVING_INTELLIGENCE_DESIGN:** YES

---

## Artifacts

`docs/audits/data/rd003-signal-quality/`

- `signal-surface-quality-matrix.json`
- `speed-video-validation.json`
- `cadence-and-staleness.json`
- `derived-acceleration-quality.json`
- `jerk-quality.json`
- `powertrain-signal-correlation.json`
- `gear-direction-quality.json`
- `use-case-eligibility-matrix.json`
- `signal-quality-summary.json`

## Invariants

- External GT SHA unchanged: `ea0d78ee…`
- DI-EV-0033 canonical telemetry SHA unchanged: `69209a6d…`
- DI-EV-0034B/C/D artifacts preserved
- `DRIVING_SCORE_CHANGED=NO`
- `REFERENCE_CAPTURE_RUNTIME_CHANGED=NO`
