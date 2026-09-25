# P2.5 post-fix epoch + LTE_R1 true cadence baseline — epoch start

**Status:** EPOCH_ACTIVE (append-only; do not rewrite historical pre-fix epoch)

## Pre-fix epoch (historical, retained)

| Field | Value |
|-------|--------|
| T0 | `2026-09-18T09:33:25.000Z` |
| T7 | `2026-09-25T09:33:25.000Z` |
| CLASS | `PRE_FIX_VALIDATION` |

## Post-fix deploy binding

| Field | Value |
|-------|--------|
| DEPLOYED_SHA | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` |
| Option-C merge | PR #1697 |

## Shared post-fix epoch

| Field | Value |
|-------|--------|
| **NEW_T0** | `2026-09-25T21:39:17.621Z` |
| **NEW_T7** | `2026-10-02T21:39:17.621Z` |
| **CORRECTNESS_BLOCKING_AT_T0** | `0` |
| **LTE_R1 cadence cohort** | `6` vehicles (4/4 P2.5 pilots ⊆ cohort) |

Canonical manifest (Production shared evidence path):

`/opt/synqdrive/shared/evidence/p25-post-fix-lte-r1-epoch/P25_LTE_R1_EPOCH_MANIFEST.json`

Append-only cadence observations:

`/opt/synqdrive/shared/evidence/p25-post-fix-lte-r1-epoch/lte-r1-cadence-observations.ndjson`

Passive observer (no provider calls, no Production DB writes, no poll cadence mutation):

`backend/scripts/ops/p25-lte-r1-passive-cadence-observer.cjs` (deployed to VPS shared ops path)

## Scientific rules (epoch freeze)

- Do not equate HTTP poll success with fresh device telemetry.
- Do not equate `providerFetchedAt` advance with per-signal source timestamp advance.
- `SOURCE_ADVANCE` only when signal source timestamp strictly increases.
- 30s Production polling remains the measurement baseline; observer samples at 30s without changing app timers.

## Checkpoints

- T+24h: data-quality audit only
- T+72h: preliminary cadence distribution only
- T+7: final P2.5 + LTE_R1 analysis
