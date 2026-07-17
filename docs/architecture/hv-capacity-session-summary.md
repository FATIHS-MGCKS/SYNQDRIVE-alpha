# HV Capacity Session Summary — M2 Aggregation (Prompt 53/78)

## Purpose

Robust per-session aggregation of M2 `HvCapacityObservation` rows into a **Session-Capacity-Summary**. No cross-session publication.

## Module

Extends `backend/src/modules/vehicle-intelligence/battery-health/hv-capacity-shadow/`

| File | Role |
|------|------|
| `hv-capacity-session-summary.types.ts` | Summary contract, versioned gate constants |
| `hv-capacity-session-summary.aggregator.ts` | Robust stats + shadow gates (pure) |
| `hv-capacity-session-summary.service.ts` | Load observations, aggregate, persist to session metadata |
| `hv-capacity-session-summary.fixtures.ts` | Stable vs unstable session fixtures |

## Robust statistics (no simple mean with outliers)

Valid samples = non-outlier `SHADOW` observations.

| Metric | Method |
|--------|--------|
| Median | Robust center |
| P10 / P90 | Percentile on valid samples |
| MAD | Median absolute deviation from median |
| Robust spread | `1.4826 × MAD` |
| CV | `MAD / median` (robust, not mean-based) |
| SOC coverage | min/max + span on valid samples |
| Temporal coverage | observation span / session duration |
| Provider gaps | gaps > `max(90s, 3× median interval)` |
| Outlier count | from observation metadata |
| Dominant duplicates | max share of samples at one timestamp |

## Versioned shadow gates (v1)

| Gate | Threshold |
|------|-----------|
| Valid samples | ≥ 5 |
| Preferred SOC band samples | ≥ 3 |
| SOC span | ≥ 5 pp |
| CV | ≤ 2 % |
| Dominant duplicate ratio | ≤ 30 % |
| Provider gaps | ≤ 3 |
| Session | final + `capacityShadowEligible` |

## Summary status

| Status | Meaning |
|--------|---------|
| `STABLE_SHADOW` | All gates passed |
| `UNSTABLE_SHADOW` | Samples present but gates failed (e.g. high CV) |
| `INSUFFICIENT` | Too few valid samples |
| `DISQUALIFIED` | Ongoing / not eligible / no valid samples |

## Persistence

Stored in `HvChargeSession.metadata.m2CapacitySummary` after M2 recompute.

## Flow

```
HvCapacityShadowService.recomputeM2ForSession()
  → persist pointwise observations (if new)
  → HvCapacitySessionSummaryService.summarizeSession()
  → metadata.m2CapacitySummary
```

## Tests

- Stable Tesla-like session → `STABLE_SHADOW`, CV < 2 %
- Unstable scattered session → `UNSTABLE_SHADOW`, `CV_ABOVE_SHADOW_LIMIT`
- Insufficient / disqualified sessions
