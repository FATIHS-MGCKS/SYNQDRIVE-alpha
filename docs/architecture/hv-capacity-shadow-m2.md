# HV Capacity Shadow M2 — CURRENT_ENERGY_OVER_SOC (Prompt 52/78)

## Purpose

Shadow capacity estimation inside qualified `HvChargeSession` rows using pointwise M2:

```
estimatedUsableCapacityKWh = currentEnergyKWh / (socPercent / 100)
```

No publication and no SOH — internal shadow observations only.

## Module

`backend/src/modules/vehicle-intelligence/battery-health/hv-capacity-shadow/`

| File | Role |
|------|------|
| `hv-capacity-m2.types.ts` | Constants, sample types, metadata contract |
| `hv-capacity-m2.policy.ts` | Gates, formula, outlier detection |
| `hv-capacity-m2.fixtures.ts` | Tesla KS FH 660E audit samples (~55.5 kWh) |
| `hv-capacity-m2-sample-provider.service.ts` | Loads HV snapshots during session window |
| `hv-capacity-observation.repository.ts` | INSERT-only `HvCapacityObservation` persistence |
| `hv-capacity-shadow.service.ts` | Session orchestration |
| `hv-capacity-shadow-producer.service.ts` | Enqueues `HV_CAPACITY_SHADOW_RECOMPUTE` |
| `hv-capacity-shadow.policy.ts` | Blocks publication/SOH side effects |

## Gates

- SOC > 0
- Prefer SOC 10–90 % (`preferredSocBand` metadata flag)
- Current energy and SOC synchronized within 60 s (`timestampDeltaMs`)
- Real new provider observations (provider observation policy)
- No stale repetition / duplicate timestamps
- Qualified session (`metadata.capacityShadowEligible`)
- Plausible unit (kWh / % ranges)
- Plausible vehicle capacity band (reference ±40 % or default 15–120 kWh)
- Outliers marked (>15 % from session median)

## Persistence — `HvCapacityObservation`

| Field | Value |
|-------|--------|
| `method` | `CURRENT_ENERGY_OVER_SOC` |
| `estimatedCapacityKwh` | computed value |
| `observedAt` | SOC anchor timestamp |
| `quality` | `SHADOW` (outliers: `INSUFFICIENT_COVERAGE`) |
| `chargeSessionId` | session link |
| `modelVersion` | `1` |
| `metadata` | `socPercent`, `currentEnergyKwh`, `timestampDeltaMs`, `preferredSocBand`, `outlier`, `shadowMode` |

`estimatedSohPct` is always null — no SOH publication.

## Trigger flow

```
HvChargeSessionPersist (completed/eligible)
  → HvCapacityShadowProducerService
  → HV_CAPACITY_SHADOW_RECOMPUTE job
  → HvCapacityShadowRecomputeHandler
  → HvCapacityShadowService.recomputeM2ForSession()
```

## Feature flag

`BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` (default OFF)

## Tests

- `hv-capacity-m2.policy.spec.ts` — formula, gates, Tesla audit medians ~55.5 kWh
- `hv-capacity-shadow.service.spec.ts` — persistence contract, eligibility skips
- `hv-capacity-session-summary.aggregator.spec.ts` — stable/unstable session aggregation (Prompt 53)
