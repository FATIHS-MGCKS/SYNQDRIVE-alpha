# EXP021 P22B — Ground Truth Recovery & Feasibility

**PR #2051** · **HEAD** `f15a458c26ab20fb3e0fc59c18495bb305e9cff2`  
**Result:** `PARTIAL_RECOVERY_FEASIBLE_INDEPENDENT_VALIDATION_BLOCKED`

## Trip binding (RD003)

- **SynqDrive trip_id:** none documented (reference-capture **session** `0fa040aa-6105-4872-9b2c-f8ad477009b8`).
- **Vehicle:** Tiguan `19fedd4b-c4e8-4de8-a125-dab293326e7e` (LTE_R1).
- **Unique UTC trip window:** not validated globally (`GROUND_TRUTH_VALIDATED=NO`, multi-clock PENDING).

## RD003 vs v0_2 independence

- **v0_2 code path:** **NOT USED** for parameter selection.
- **EXP021 halt prototype:** Tesla reference = development; RD003 = separate lineage (inventory only in P22A).

## RD004 video ground truth

- **Halt/stop GT for v0_2:** **NO** (`STOP_TIMING_VALIDATED=NO`).
- **Late-bucket / watermark:** telemetry capture diagnostics — **not** movement ground truth.

## Recovery matrix

| Case | Class |
|------|--------|
| HALT_WITHOUT_SIGNAL | **PARTIALLY_RECOVERABLE** |
| SLOW_ROLL_NO_FULL_HALT | **NEW_CAPTURE_REQUIRED** |
| STOP_AND_GO | **PARTIALLY_RECOVERABLE** |
| MOVEMENT_DURING_GAP | **PARTIALLY_RECOVERABLE** |
| MANEUVER_RETURN_SAME_POINT | **PARTIALLY_RECOVERABLE** |

## Independent validation without new video?

**NO** — no trip-aligned P21 pin + validated per-second labels for all five cases.

## v0_2

Parameter hash `dc4339e7b3687ef613b59e3ee9fe75b7a3d885dce5f5884735421e58a46d4ab7` — unchanged.

## Next safe action

Offline: complete RD003 clip-alignment review to VALIDATED status OR schedule single new capture per protocols; then bind P21 pin and replay frozen v0_2 without tuning.
