# C5 PTQ V0 vs production-parity C4

Generated from `outputs/c5_regression_summary.json` (DI pin `579ee8b2`, C4 `MOTION_CORE_SPEED_C4_V0_5_DEV`).

## Summary

| Drive | C4 MAE | C5 MAE | C4 P95 | C5 P95 | C4 max | C5 max | C4 cov. | C5 cov. | Common n | Common MAE C4→C5 | Common P95 C4→C5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TES16 | 2.27 | 2.39 | 4.49 | 4.90 | **19.90** | **7.53** | 83.0% | 80.9% | 785 | 2.29 → 2.40 | 4.49 → 4.90 |
| TIG22 | 2.91 | 2.90 | 5.92 | 5.61 | 14.38 | 14.54 | 96.3% | 95.2% | 1349 | 2.88 → 2.90 | 5.73 → 5.61 |
| TES21-1 | 2.29 | 2.57 | 8.56 | 7.78 | 13.55 | 9.88 | 65.5% | **40.6%** | 93 | 2.04 → 2.57 | 7.42 → 7.78 |
| TES21-2 | 3.52 | 3.41 | 9.52 | 9.38 | 20.64 | 19.90 | 74.6% | 67.1% | 159 | 3.42 → 3.35 | 9.52 → 9.38 |

Coverage = paired readable video seconds / readable reference seconds.

## Pre-registered acceptance gates

| Gate | Result |
| --- | --- |
| Common-second MAE ≤ C4 + 0.1 km/h (all drives) | **FAIL** (TES16, TES21-1) |
| Common-second P95 ≤ C4 + 0.2 km/h (all drives) | **FAIL** (TES16, TES21-1) |
| Coverage ≥ C4 − 1 pp per drive | **FAIL** (all four drives) |
| TES16 false ACCEL 03:50:20–23 removed | **PASS** (C4: 1 event, C5: 0) |
| TES16 critical numeric seconds max error ≤ 8 km/h | **PASS** (max 6.48 km/h) |
| Hard teleport quarantine parity | **PASS** (identical `OUTLIER_REJECTED` label sets) |
| TIG22 19:04 events auto-scored | **N/A** (no video after 19:03:02) |

**ALL_ACCEPTANCE_GATES = FAIL** → experiment **NOT_PROVEN** for production promotion; no parameter retuning performed.

## TES16 mechanism check (Fable counter-control)

| Second (UTC) | Video | C4 | C5 | C5 quality |
| --- | ---: | ---: | ---: | --- |
| 03:50:20 | 133 | 113.1 | **129.2** | SPARSE_SUPPORT |
| 03:50:22 | 132 | 128.2 | **126.7** | REPAIRED (TIME_SUSPECT :22) |
| 03:50:23 | 132 | 148.3 | **125.7** | SPARSE_SUPPORT |

The false-accel window is corrected with **numeric** speeds, not by masking to UNKNOWN. Whole-trip max error drops from 19.9 km/h (C4) to 7.5 km/h (C5) at the cost of ~2.1 pp coverage (mostly `PTQ_INSUFFICIENT_SUPPORT` near sparse edges).

## Runtime

~100 ms per full-trip C5 replay (TIG22-scale grid), ≤4 s lookahead documented in `PTQ_FROZEN.lookaheadS`.

## Charts

- `outputs/charts/TES16_speed_timeseries.svg`
- `outputs/charts/TIG22_1904_timeseries.svg`
