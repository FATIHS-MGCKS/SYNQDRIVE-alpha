# EXP021 P22C — RD003 Session-to-Trip Alignment

**Result:** `TRIP_BINDING_UNIQUE_UTC_VALIDATION_BLOCKED` · PR #2051 · HEAD `9156ce48228eba369d73974592b1f66d0eb56a73`

## Trip binding

- RC session found: **true**
- Window: 2026-09-02T18:59:15.695Z → 2026-09-02T19:36:22.970Z
- Candidate trips (±5 min pad): **1**
- **Unique binding:** `fe40356a-4605-4481-8280-cb44858cacc1`
- Basis: TEMPORAL_OVERLAP_SINGLE_VEHICLE_TRIP_CONTAINS_FULL_RC_SESSION (no spatial proximity proof)

## UTC sync (9 clips)

| Clip | Candidate UTC | Aligned UTC (HF fit) | Residual s | MAE km/h | Cov | UTC gate |
|------|---------------|----------------------|------------|----------|-----|----------|
| RD003_GT_CLIP_001 | 2026-09-02T19:03:49.400Z | 2026-09-02T19:04:08.400Z | 19 | 31.2 | 32% | PARTIAL |
| RD003_GT_CLIP_002 | — | 2026-09-02T19:06:20.000Z | 8.45 | 36.7 | 63% | PARTIAL |
| RD003_GT_CLIP_003 | 2026-09-02T19:08:37.300Z | 2026-09-02T19:08:07.800Z | -29.5 | 32.5 | 25% | PARTIAL |
| RD003_GT_CLIP_004 | 2026-09-02T19:09:50.200Z | 2026-09-02T19:10:10.700Z | 20.5 | 68.5 | 65% | PARTIAL |
| RD003_GT_CLIP_005 | 2026-09-02T19:12:10.300Z | 2026-09-02T19:11:42.300Z | -28 | 32.3 | 81% | PARTIAL |
| RD003_GT_CLIP_006 | — | 2026-09-02T19:21:05.500Z | -1.5 | 28.5 | 56% | PARTIAL |
| RD003_GT_CLIP_007 | 2026-09-02T19:22:30.450Z | 2026-09-02T19:22:53.450Z | 23 | 25.2 | 94% | PARTIAL |
| RD003_GT_CLIP_008 | — | 2026-09-02T19:23:08.500Z | -10.8 | 15.4 | 100% | PARTIAL |
| RD003_GT_CLIP_009 | — | 2026-09-02T19:24:32.000Z | 1.5 | 35.1 | 68% | PARTIAL |

**Validated UTC clips:** 0 · **Offset confidence:** LOW

## Case gates

### HALT_WITHOUT_SIGNAL — **PARTIAL**

Clips 001/005/006/009 include labeled 0 km/h seconds (sparse); no signal-context annotation in GT file.


### STOP_AND_GO — **PARTIAL**

Clips 001, 005, 006 behavioral summaries include STOP→LAUNCH patterns; sparse integer-second speed labels.


### MOVEMENT_DURING_GAP — **BLOCKED**

No clip documents continued motion through a POSITION_ROW_ABSENT-style gap with synchronized video proof.


### MANEUVER_RETURN_SAME_POINT — **PARTIAL**

Clip 009: FORWARD→DECELERATION→NEAR_STOP→REVERSE→STOP→FORWARD_LAUNCH (behavioral summary + 25 speed samples).


## v0_2

Hash `dc4339e7b3687ef613b59e3ee9fe75b7a3d885dce5f5884735421e58a46d4ab7` unchanged.
