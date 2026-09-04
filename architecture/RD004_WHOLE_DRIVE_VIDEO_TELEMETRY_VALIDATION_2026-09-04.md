# RD004 — Whole-Drive Video ↔ Telemetry Validation (Segments A + B)

**Date:** 2026-09-04
**Evidence IDs:** DI-EV-0035A.2 (Segment A) + DI-EV-0035B.1 (Segment B)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Reference drive:** `DIMO_LTE_R1_REFERENCE_DRIVE_004`

## Structure

| Segment | Video window (UTC) | Duration | Evidence ID | Offset validated |
|---------|-------------------|----------|-------------|------------------|
| A (pre-refuel) | 03:37:46 – 03:43:56 | ~6:11 | DI-EV-0035A.2 | **NO** |
| Refuel stop | — | — | — | — |
| B (post-refuel) | 03:47:02 – 04:03:42 | ~16:40 | DI-EV-0035B.1 | **NO** (supportive ~+13.5 s) |

## Cross-segment conclusions

### HF cadence

Both segments are far below 1 Hz continuous speed. Segment B median cadence (~10.6 s) is **sparser** than Segment A (~4.7 s). Large gaps (52–105 s) are systemic, not Segment-A-specific.

### Clock alignment

- Segment A: insufficient independent high-authority landmarks → offset **null**
- Segment B (B.1): event-boundary calibration + global time-only search → **supportive candidate ~+13.5 s** near exploratory ~+14.3 s, but **`PROVIDER_TIMESTAMP_OFFSET_VALIDATED = NO`** (only 1 qualifying transition landmark)
- DI-EV-0035B offset/MAE claims **invalidated** as canonical (speed-selection bias); preserved as exploratory non-canonical values
- Drift over either segment: **not validated**

### Speed accuracy

- DI-EV-0035B MAE ~2.3 km/h: **not canonical** (selection bias)
- B.1 holdout (17 anchors, time-only, frozen supportive offset): **5 comparable**, diagnostic MAE ~13.8 km/h, headline **`SPEED_MAE_KMH = null`**
- Sparse HF cadence + dynamic states limit comparable samples

### Gear / reverse

Video provides strong gear and reverse ground truth in Segment B. HF telemetry delivers **no gear** and **no direction** in either segment. Reverse cannot define clock offset.

### Legacy detectors

**0** hard/extreme events on available HF data in both segments. Three telemetry kinematic episodes without legacy alarms are **not** validated false negatives.

### Production

**No changes.** Analysis-only. `READY_FOR_RD004_FINAL_CLOSEOUT = NO` until offset and absolute speed accuracy can be independently validated with sufficient holdout evidence.

## B.1 methodology changes (DI-EV-0035B.1)

1. Deterministic **CLOCK_CALIBRATION_SET** vs **SPEED_ACCURACY_HOLDOUT_SET** (no overlap)
2. Clock fit: transition/event-shape landmarks only; CLK-B7 reverse excluded; 0 km/h snapshots not auto-transitions
3. Global offset search −60…+60 s using calibration set only (time-only nearest sample per anchor)
4. Holdout accuracy: time-only sample selection after frozen offset; speed never influences sample choice
5. Stop timing: provider timeline corrected into video time when supportive/validated offset available
6. Supporting signals: event correlation required for Segment-B validation beyond sample count + dynamic range

## Artifacts

- Segment A: `docs/audits/data/rd004-segment-a/`
- Segment B: `docs/audits/data/rd004-segment-b/`
- Architecture: `architecture/RD004_A_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT_2026-09-04.md` (A.2) + this document
