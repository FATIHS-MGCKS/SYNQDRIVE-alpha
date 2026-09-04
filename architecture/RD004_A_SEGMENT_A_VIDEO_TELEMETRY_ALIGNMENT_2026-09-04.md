# RD004-A.2 — Segment A Video ↔ Telemetry Alignment (Semantics Closeout)

**Date:** 2026-09-04
**Evidence ID:** DI-EV-0035A.2
**Supersedes semantics defects in:** DI-EV-0035A.1
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)

## Scope

Segment A only (departure → fuel station, ~370.65 s video). Segment B (~16:40) pending.

## A.2 semantics corrections

| Area | DI-EV-0035A.1 defect | DI-EV-0035A.2 fix |
|------|---------------------|-------------------|
| Provider offset | `VIDEO_TO_PROVIDER_OFFSET_SECONDS ≈ +22.2 s` from approximate H | **null**; H stored as `PROVISIONAL_LANDMARK_H_DISPLACEMENT_SECONDS` only (`NOT_A_CLOCK_OFFSET_ESTIMATE`) |
| Clock-fit landmarks | H counted as clock-fit eligible | `CLOCK_FIT_ELIGIBLE_LANDMARKS = []`; `VIDEO_PROVIDER_ALIGNMENT_CLASS = INSUFFICIENT_EVIDENCE` |
| True peak attenuation | Same-timestamp proxy at raw peak time | Independent raw vs smoothed local maxima in same event window |
| Invariants | — | `APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET = YES`; `TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY = YES` |

## Preserved valid evidence (unchanged raw bytes)

- 38 HF speed samples, ~4.7 s median cadence (not 1 Hz)
- 0 legacy hard/extreme events on available data
- **VIDEO_ABSOLUTE_TIME_ANCHORED = YES** (Time.is); provider offset **not validated**
- Reverse: video YES, telemetry NO
- Absolute speed accuracy: NOT VALIDATED
- Drift: NOT VALIDATED

## Preprocessing metrics (distinct)

| Metric | Segment A value | Meaning |
|--------|-----------------|---------|
| `MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH` | ~18.33 | Same `providerTimestamp` raw vs legacy smoothed |
| `TRUE_LOCAL_PEAK_ATTENUATION_KMH` | ~10 | Max abs(raw_peak − smoothed_peak) in same local windows |
| `TRUE_LOCAL_PEAK_EVENT_COUNT` | 6 | Valid independent peak pairs |

## Module / CLI

- `reference-capture-rd004-a-segment-a.ts`
- `reference-capture-drive-004-a-segment-a-analyze.ts`
- 31 methodology/semantics tests

## Artifacts

`docs/audits/data/rd004-segment-a/` — regenerated with A.2 semantics.

**No production changes. RD004 whole drive NOT complete.**
