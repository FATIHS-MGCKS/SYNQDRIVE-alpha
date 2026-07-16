# HV Capacity M3 Validation — SEGMENT_ADDED_ENERGY_OVER_SOC

Prompt 54/78. M3 is **VALIDATION_ONLY** — it does not publish SOH and does not replace M2 shadow capacity.

## Formula

```
estimatedSessionCapacityKWh = segmentAddedEnergyKWh / (deltaSocPercent / 100)
```

- `segmentAddedEnergyKWh` = DIMO recharge segment aggregate delta (`HvChargeSession.energyAddedKwh`)
- `deltaSocPercent` = segment SOC delta (`HvChargeSession.deltaSocPercent`)
- **Not** naive first/last current-energy delta from timeseries

## Gates

| Gate | Rule |
|------|------|
| Session finalized | `isOngoing === false`, `endAt` present |
| Validation eligible | `metadata.capacityValidationEligible === true` (QUALIFIED + ΔSOC ≥ 20 pp) |
| DIMO segment source | `source === DIMO_RECHARGE_SEGMENT` |
| Strong boundaries | DIMO segment with start + end |
| ΔSOC | ≥ 20 percentage points |
| Segment aggregate | `energyAddedKwh` present and 0.5–50 kWh |
| Added-energy reset | `addedEnergyMinKwh` ≥ 2 kWh when available |
| First/last divergence | Naive `endEnergy − startEnergy` must not diverge > 15 % from segment aggregate |
| Capacity band | Result within 15–120 kWh |

## Method conflict

When M2 session median is available, deviation > 10 % marks `METHOD_CONFLICT_WITH_M2`. Observation quality becomes `INSUFFICIENT_COVERAGE` (validation signal, not SOH).

## Persistence

### `HvCapacityObservation`

- `method`: `SEGMENT_ADDED_ENERGY_OVER_SOC`
- `modelVersion`: 1
- `estimatedSohPct`: always `null`
- `deltaSocPercent`, `deltaEnergyKwh`: session deltas
- `idempotencyKey`: `hv-cap-m3:{sessionId}:m1`
- `metadata`: validation-only contract (`validationOnly`, `segmentAggregateSource`, conflict fields)

### `HvChargeSession.metadata.m3Validation`

Session-level validation outcome including gate reasons and method conflict.

## Pipeline wiring

`HvCapacityShadowService.recomputeM2ForSession` runs M2 pointwise observations → M2 session summary → **M3 validation** (passes M2 median for conflict detection).

Feature flag: `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` (shared with M2 shadow path).

## Tesla audit references

| Case | Segment aggregate | Result |
|------|-------------------|--------|
| Session 4 | 15.18 kWh / 27.4 % | ~55.4 kWh — plausible |
| Session 7 | 22.70 kWh / 40.3 % | ~56.3 kWh — plausible |
| Session 7 timeseries first/last | — | ~71.3 kWh — **rejected** (first/last divergence gate) |

## Files

- `hv-capacity-m3.types.ts` — constants, metadata contracts
- `hv-capacity-m3.policy.ts` — formula, gates, conflict detection
- `hv-capacity-m3-validation.service.ts` — persist observation + session metadata
- `hv-capacity-m3.fixtures.ts` — audit-based test inputs
