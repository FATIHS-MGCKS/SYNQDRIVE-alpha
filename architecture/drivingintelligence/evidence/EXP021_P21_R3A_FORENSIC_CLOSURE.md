# EXP021 P2.1 R3A — Forensic closure (diagnosis V2, 628 breakdown, longest segment)

**Status:** COMPLETE (read-only)  
**PR:** #2020  
**Trip / WI:** same as [EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md](./EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md)  
**Artifact:** `/opt/cursor/artifacts/exp021-p21-r3a-forensic.json`

## Plain-language closure

The **628** “transition/hold” seconds from R3 V1 were not one homogeneous bug: they are mostly **`FROZEN_UNRESOLVED` at the center** (501 s total across the trip), dominated by a **293 s opening block** (07:37:04–07:41:56 Europe/Berlin) where GPS coordinates barely change, S1 emits **`TRANSITION_UNCERTAIN` + `abstentionReason=POSITION_FROZEN`**, and numeric L3 speed is correctly withheld. R3 V1 **lumped** true position gaps (8 s) with hold geometry; **V2 splits** position gaps (8) from hold semantics (755).

The **8** V1 `ROW_ABSENT_OR_SIGNAL_NULL_GAP` cases are **not** all provider outages: V2 finds **1** acquisition-window edge support second, **6** explicit `ROW_ABSENT`, **1** missing in-window bucket — at bucket level **4** `ROW_ABSENT` + **1** missing label** on a 1481-label grid vs **1480** S2 intervals.

**POST_GAP_REACQUIRE:** not seen on this trip; policy analysis shows the branch is **structurally overshadowed** (`L3_SUPPORT_CROSSES_GAP` → `SUPPORT_WINDOW_COMPROMISED` before the POST_GAP check; leg-threshold checks duplicate `GEOMETRY_JUMP`).

Forensic loader now uses the **same read-only transaction** pattern as P2.1 preview, **DB snapshot metadata** for S4D verify, and **`resolveDiV0TripSpeedQualityCalibrationBundle(shadow_run.calibration_version)`** (`CALIBRATION_UNSET_V0` on this run).

## Baseline reproduced

| Metric | Value |
|--------|------:|
| Intervals | 1480 |
| Trusted numeric | 691 |
| NO_NUMERIC | 763 |
| CROSS_SOURCE_CONFLICT | 26 |
| Replay mode | `ACTIVE_PRIMARY` |

## V1 → V2 reconciliation (763 NO_NUMERIC)

| V1 (R3) | Count | V2 replacement (disjoint) |
|---------|------:|---------------------------|
| `TRANSITION_RELEASE_OR_UNRESOLVED_HOLD` | 628 | See hold detail table (not a single V2 code) |
| `STATIONARY_WITH_FRESH_POSITIONS` | 127 | `HOLD_TRANSITION_STATIONARY_SUPPORTED_BAND` (144 total stationary; 17 counted as V1 transition due to neighbor hold priority) |
| `ROW_ABSENT_OR_SIGNAL_NULL_GAP` | 8 | `POS_GAP_*` (8) — see below |

### V2 position-gap slice (8 intervals)

| V2 code | Intervals |
|---------|----------:|
| `POS_GAP_WINDOW_EDGE_OUTSIDE_ACQUISITION` | 1 |
| `POS_GAP_ROW_ABSENT_EXPLICIT` | 6 |
| `POS_GAP_MISSING_BUCKET_INSIDE_WINDOW` | 1 |

### V2 hold / motion slice (755 intervals)

| Hold detail | Intervals | Longest run (s) |
|-------------|----------:|----------------:|
| `CENTER_FROZEN_UNRESOLVED` | 501 | **289** |
| `STATIONARY_SUPPORTED_BAND` | 144 | 22 |
| `MOVING_SPEED_UNKNOWN` | 33 | (see segment stats in JSON) |
| `TRANSITION_UNCERTAIN_FRESH_L3_SUPPORT` | 42 | — |
| `NEIGHBOR_HOLD_OR_RELEASE_FRESH_CENTER` | 23 | — |
| `CENTER_RELEASE` | 13 | — |
| `NO_MOTION_EVIDENCE` | 6 | — |
| `OTHER_S1_DOCUMENTED` | 1 | — |

**33 `MOVING_SPEED_UNKNOWN`:** all in V2 `HOLD_TRANSITION_MOVING_SPEED_UNKNOWN` (not “unknown hold” — S1 documents movement without numeric estimate).

**17 stationary seconds in V1 transition bucket:** `STATIONARY_SUPPORTED_BAND` at center but neighbor/center hold geometry caused V1 `frozenRelease` priority before stationary-fresh classification.

## Position buckets vs intervals

| Measure | Count |
|---------|------:|
| Expected 1 Hz labels (acquisition grid) | 1481 |
| Labels present in pinned POSITION channel | 1480 |
| `ROW_ABSENT` buckets | 4 |
| `SIGNAL_NULL` buckets | 0 |
| Present with valid coordinates | 1476 |
| Missing label inside window | 1 |
| S2 intervals | 1480 |

Full raster ≠ 1480 valid measurements; assessability numerators use **intervals**, not raw bucket validity.

## Longest V1 transition segment (293 s)

| Field | Value |
|-------|--------|
| UTC | `2026-10-14T05:37:04Z` → `2026-10-14T05:41:56Z` |
| Europe/Berlin | `2026-10-14 07:37:04` → `2026-10-14 07:41:56` |
| Motion | 293 × `TRANSITION_UNCERTAIN` |
| Position | 288 × `FROZEN_UNRESOLVED`, 1 × `RELEASE`, 4 × `FRESH` |
| Distinct coordinate keys | 6 |
| Longest identical coordinate run | **288 s** |
| Sample release jump | ~**13 m** at `05:41:52Z` |
| R1 buckets in segment | 15 (sparse); samples mostly **0 km/h** |
| S1 rule blocking numeric speed | Hold / frozen path → L3 not published as `MOVING_SPEED_ESTIMATED` |

**Interpretation:** observed near-static coordinates + frozen classification + abstention; **not** labeled confirmed physical stop or provider fault. R1 interval timing offset as conflict explanation remains **hypothesis** (not independently proven on this trip).

## Stillstand / coverage wording corrections

- Dominant NO_NUMERIC driver on this trip is **hold/frozen transition (501 s `FROZEN_UNRESOLVED` center)**, not the 144 s stationary band alone.
- **144** stationary band seconds are **not** 144 guaranteed future `TRUSTED_LIMITED` candidates — P1 still requires contract change; conflicts/evidence gates apply separately.
- Stationary-only P1 fix would **not** automatically yield **FULL** assessability (70% **trusted numeric** gate unchanged).

## Engineering

- `di-v0-p21-r3-forensic-loader.ts` — read-only transaction + calibration resolver  
- `di-v0-p21-r3-forensic-classify.ts` — V1/V2 + hold detail  
- `di-v0-p21-r3-forensic-analyze.ts` — report + longest-segment narrative  
- Tests: `di-v0-p21-r3-forensic-classify.unit.spec.ts`, extended `di-v0-speed-qc-s1-p1-composed.spec.ts`, POST_GAP overshadowing in `di-v0-speed-qc.hardening.spec.ts`
