# RD004 — Whole-Drive Video ↔ Telemetry Validation (Segments A + B)

**Date:** 2026-09-04
**Evidence IDs:** DI-EV-0035A.2 (Segment A) + DI-EV-0035B.3 (Segment B)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Reference drive:** `DIMO_LTE_R1_REFERENCE_DRIVE_004`

## Structure

| Segment | Video window (UTC) | Duration | Evidence ID | Offset validated |
|---------|-------------------|----------|-------------|------------------|
| A (pre-refuel) | 03:37:46 – 03:43:56 | ~6:11 | DI-EV-0035A.2 | **NO** |
| Refuel stop | — | — | — | — |
| B (post-refuel) | 03:47:02.217 – 04:03:42.715 | **1000.498365 s** | DI-EV-0035B.3 | **NO** |

## Cross-segment conclusions

### HF cadence

Both segments are far below 1 Hz continuous speed. Segment B median cadence (~10.6 s) is **sparser** than Segment A (~4.7 s). Large gaps (52–105 s) are systemic, not Segment-A-specific.

### Video master timeline (B.2)

Nine clips stitched in order **5→3→1→9→8→7→4→2→6** via audio cross-correlation (not Drive timestamps). Total overlap **16.775 s**; master duration **1000.498365 s**. Canonical artifact: `rd004-b-video-master-timeline.json`.

Time.is anchor at master t≈0.783333 s → `VIDEO_MASTER_T0_UTC_ESTIMATE = 2026-09-04T03:47:02.216667Z` (frame + display uncertainty).

### Clock alignment

- Segment A: insufficient independent high-authority landmarks → offset **null**
- Segment B (B.1): removed speed-selection bias; supportive ~+13.5 s **not validated**
- Segment B (B.2): **frame-verified** first stop at **t≈621.8 s** (not t=630 snapshot); launch bounded **[673.0, 673.5] s**
- Segment B (B.3): **corrected launch predecessor bug** (35.102 s gap, not ~629 s); launch **interval-censored** — +5.x s **removed** as clock evidence
  - Corrected first-stop displacement vs sparse HF zero: **~+21.7 s** (`SPARSE_STATE_SAMPLE`, **not** clock authority)
  - `CLOCK_FIT_PROVIDER_MATCH_COUNT = 0`; `OFFSET_CANDIDATE_RANGE_SUPPORTIVE = null`
  - 43→0 in 1 s after ~28.7 s gap: **not** validated physical dynamics (`PAIR_PHYSICAL_CONTINUITY_VALIDATED = NO`)
  - Stop timing: **no** event-derived offset aligning same event (`STOP_TIMING_ERROR_SECONDS = null`)
  - HF capture completeness: live DIMO requery (108 buckets) vs sealed (66) → **`HF_SPARSE_CADENCE_ORIGIN = CAPTURE_PIPELINE_SAMPLE_LOSS`** (partial validation)
  - `A_B_APPROX_22S_DISPLACEMENT_REPEAT_OBSERVED = YES` but **not** cross-validated
  - `SPARSE_SAMPLE_DELAY_SEPARATED_FROM_CLOCK_OFFSET = YES`
  - **`PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO`**, `VIDEO_TO_PROVIDER_OFFSET_SECONDS = null`
- Drift over either segment: **not validated**

### Speed accuracy

- DI-EV-0035B MAE ~2.3 km/h: **not canonical** (selection bias)
- B.1/B.2 holdout: time-only matching; **no validated offset** → `SPEED_MAE_KMH = null`
- Diagnostic holdout MAE with unsupported offset: **removed in B.3** (no supportive offset range)
- Sparse HF cadence + dynamic states limit comparable samples
- HF capture audit (B.3): sealed median ~10.6 s; live requery denser → suspect **capture pipeline sample loss**

### Stop timing

- t=630: **SUSTAINED_STOP_STATE** only — not stop-transition landmark
- B-T01 first zero: **621.8 s**; B-T02 launch window: **[673.0, 673.5] s**
- `STOP_TIMING_VALIDATED = NO`; **no** supportive offset applied (B.3 removes circular alignment)

### Gear / reverse

Video provides strong gear and reverse ground truth in Segment B. HF telemetry delivers **no gear** and **no direction** in either segment. Reverse cannot define clock offset.

### Legacy detectors

**0** hard/extreme events on available HF data in both segments. Three telemetry kinematic episodes without legacy alarms are **not** validated false negatives.

### Production

**No changes.** Analysis-only. `READY_FOR_RD004_FINAL_CLOSEOUT = NO` until offset and absolute speed accuracy can be independently validated with sufficient holdout evidence.

## B.3 methodology changes (DI-EV-0035B.3)

1. Launch transition uses **immediate predecessor** (`sorted[i-1]`), not first earlier sample
2. Launch provider transition **interval-censored** over 35.102 s — 20 km/h timestamp is **not** exact launch event
3. **+5.x s launch displacement removed** as clock evidence (`FIRST_LAUNCH_CLOCK_FIT_ELIGIBLE = NO`)
4. Context-continuity gate: local 1 s pair after large gap ≠ continuous physical dynamics
5. Stop displacement reclassified as **sparse observation only** (`FIRST_STOP_DISPLACEMENT_CLOCK_AUTHORITY = NO`)
6. Stop timing: **no** event-derived offset → zero error tautology removed
7. Legacy exploratory clock landmarks forced `CLOCK_FIT_ELIGIBLE = NO` with explicit historical reasons
8. HF capture completeness audit: pipeline trace + read-only DIMO requery diagnostic artifact

## B.2 methodology changes (DI-EV-0035B.2)

1. Audio-correlated master timeline with per-clip master starts and overlap evidence
2. Improved Time.is T0 from frame-level second boundary (not rounded video start)
3. **VIDEO_STATE_ANCHOR** vs **VIDEO_TRANSITION_LANDMARK** semantics separated
4. Frame-verified B-T01 stop transition (621.8 s); t=630 invalidated as transition
5. Bounded B-T02 launch window [673.0, 673.5] — no invented exact event time
6. Clock reassessment distinguishes **clock offset** from **sparse sampling delay**
7. B.1 calibration/holdout separation and time-only holdout matching preserved

## Artifacts

- Segment A: `docs/audits/data/rd004-segment-a/`
- Segment B: `docs/audits/data/rd004-segment-b/` (incl. `rd004-b-video-master-timeline.json`)
- Architecture: `architecture/RD004_A_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT_2026-09-04.md` (A.2) + this document
