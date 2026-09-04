# RD004 — Whole-Drive Video ↔ Telemetry Validation (Segments A + B)

**Date:** 2026-09-04
**Evidence IDs:** DI-EV-0035A.2 (Segment A) + DI-EV-0035B (Segment B)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Reference drive:** `DIMO_LTE_R1_REFERENCE_DRIVE_004`

## Structure

| Segment | Video window (UTC) | Duration | Evidence ID | Offset validated |
|---------|-------------------|----------|-------------|------------------|
| A (pre-refuel) | 03:37:46 – 03:43:56 | ~6:11 | DI-EV-0035A.2 | **NO** |
| Refuel stop | — | — | — | — |
| B (post-refuel) | 03:47:02 – 04:03:42 | ~16:40 | DI-EV-0035B | **YES (~+14.3 s)** |

## Cross-segment conclusions

### HF cadence

Both segments are far below 1 Hz continuous speed. Segment B median cadence (~10.6 s) is **sparser** than Segment A (~4.7 s). Large gaps (52–105 s) are systemic, not Segment-A-specific.

### Clock alignment

- Segment A: insufficient independent high-authority landmarks → offset **null**
- Segment B: 25 dashboard anchors + 3 independent clock landmarks → offset **~+14.3 s validated**
- Drift over either segment: **not validated**

### Speed accuracy

Only measurable after Segment B offset validation: **MAE ~2.3 km/h** across 18 high-confidence dashboard anchors.

### Gear / reverse

Video provides strong gear and reverse ground truth in Segment B. HF telemetry delivers **no gear** and **no direction** in either segment.

### Legacy detectors

**0** hard/extreme events on available HF data in both segments. Segment B larger dynamics did not trigger legacy harsh classification on sparse HF.

### Production

**No changes.** Analysis-only. Ready for RD004 final closeout documentation — not production calibration.

## Artifacts

- Segment A: `docs/audits/data/rd004-segment-a/`
- Segment B: `docs/audits/data/rd004-segment-b/`
- Architecture: `architecture/RD004_A_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT_2026-09-04.md` (A.2) + this document
