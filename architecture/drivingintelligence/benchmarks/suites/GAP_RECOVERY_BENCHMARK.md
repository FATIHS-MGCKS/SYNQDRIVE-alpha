# Suite: GAP_RECOVERY_BENCHMARK

**Goal:** Missing, late, or contradictory measurements — settlement, ROW_ABSENT, watermark exclusion.

## Benchmarks

| BMK_ID | Phenomenon |
|--------|------------|
| `BMK-RD001` | 151 s gap |
| `BMK-RD004` | Late buckets, watermark |
| `BMK-RD002` | Sparse HF Δt P50 13.489s |
| `BMK-KS-MX-CAL` | Post-settlement completeness |
| `BMK-TESLA-LDI10D-20261016` | ROW_ABSENT leading buckets |
| `BMK-P21-R3-AUDI-20261014` | 8 true tri-state gaps vs 763 NO_NUMERIC |

## Rules

- `MISSING_BUCKET_INSIDE_WINDOW` ≠ stop
- Production HF Recovery V2 — code on binary, **feature OFF** (`DEPLOYMENT_STATE.md`)

## Metrics

- Gap duration distribution (MEASURED on sealed exports)
- Interior HF sample count inside video-GT gap windows (EXP-019)
