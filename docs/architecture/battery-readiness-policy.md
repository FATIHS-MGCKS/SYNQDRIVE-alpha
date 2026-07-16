# Battery Readiness Policy (V4.9.565)

Binding rental readiness policy for battery evidence — integrates with central `RentalHealthService.collectBlockingReasons()` and frontend runtime via `rental_blocked` / `blocking_reasons` (no second blocking engine).

## Flag

`BATTERY_V2_READINESS_ENABLED` (default: `false`) — see `battery-health-v2-rollout-flags.md` §3.12.

## Effects

| Signal | Module effect | `rental_blocked` |
|--------|---------------|------------------|
| Missing / unknown data | `unknown` | **false** |
| Unusual live voltage | hint in reason | **false** |
| Start proxy conspicuous | diagnostic note | **false** |
| REST shadow | no escalation | **false** |
| HV capacity shadow | no escalation | **false** |
| STABLE + VALID qualified LV critical | `critical` | **true** (manual review) |
| Battery warning light | `warning`/`critical` | **true** |
| Safety-relevant battery DTC | via readiness | **true** |
| Confirmed workshop defect | `critical` | **true** (hard block) |
| Provider SOH alone <70 % + medium+ confidence + fresh | policy | **true** |

## Integration

| Module | Role |
|--------|------|
| `battery-readiness.policy.ts` | Central evaluation |
| `battery-evidence-strength.policy.ts` | `canAffectReadiness` tiers |
| `rental-health.service.ts` | `isBatteryRentalBlockWorthy()` → `blocking_reasons` |
| `canonical-battery-read.adapter.ts` | Module state + hint/diagnostic merge |
| `vehicleRuntimeStateBuilder.ts` | Consumer only — reads `rental_blocked` |

## API

- `BATTERY_READINESS_POLICY_VERSION`
- `evaluateBatteryReadiness()`
- `buildBatteryReadinessInputFromSummary()`
- `isBatteryBlockWorthy()`
- `isBatterySafetyDtcFault()` / `hasActiveBatterySafetyDtc()`
