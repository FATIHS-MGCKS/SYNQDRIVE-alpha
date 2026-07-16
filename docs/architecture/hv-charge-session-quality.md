# HV Charge Session Quality Assessment (Prompt 51/78)

## Purpose

Central quality assessment for `HvChargeSession` rows — unified status, measurement quality mapping, and capacity shadow eligibility gates.

## Module

`backend/src/modules/vehicle-intelligence/battery-health/hv-charge-session/`

| File | Role |
|------|------|
| `hv-charge-session-quality.status.ts` | `HvChargeSessionQualityStatus` enum + reason codes |
| `hv-charge-session-quality.assessor.ts` | Central assessor from DIMO segment, fallback candidate, or generic input |
| `hv-charge-session.quality.ts` | Thin wrappers + `isBetterSessionQuality` |

## Quality statuses

| Status | Meaning |
|--------|---------|
| `QUALIFIED` | DIMO completed session, ΔSOC ≥ 20 %, strong boundaries |
| `PARTIAL` | M2 shadow path — ΔSOC ≥ 5 %, current energy present, sub-M3 or fallback |
| `INSUFFICIENT_SOC_DELTA` | SOC movement too small |
| `INSUFFICIENT_COVERAGE` | Duration, samples, or energy coverage insufficient |
| `PROVIDER_GAPS` | Started before range, missing end, receive/observation skew |
| `ADDED_ENERGY_RESET` | Mid-session added-energy reset or negative delta |
| `ONGOING` | Provider session not finalized |
| `CONFLICTING_SOURCES` | Fallback superseded by DIMO segment |
| `INVALID` | Corrupt timestamps or SOC range |

## Assessment dimensions

Session boundaries, ongoing/final, SOC delta, sample coverage, provider gaps, duplicate timestamps, current-energy availability, added-energy resets, interruptions (via fallback), source strength, data age (receive vs observation skew).

## Capacity shadow gating

Only `QUALIFIED` and clearly defined `PARTIAL` (M2: DIMO source, ΔSOC ≥ 5 %, current energy present) may supply capacity shadow inputs. `capacityValidationEligible` is true only for `QUALIFIED` with ΔSOC ≥ 20 %.

## Persistence

`qualityStatus`, `qualityReasonCodes`, `capacityShadowEligible`, `capacityValidationEligible` stored in `HvChargeSession.metadata`. Column `quality` maps to `BatteryMeasurementQuality`.

## Tests

`hv-charge-session-quality.assessor.spec.ts` — Tesla KS FH 660E audit segments (sessions 1–4 + ongoing) and edge cases.
