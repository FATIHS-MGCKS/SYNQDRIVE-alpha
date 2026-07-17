# HV SOH Gate Policy (Internal Assessment)

Prompt 57/78. Vehicle-level `BatteryAssessment` of type `HV_SOH_CAPACITY_ESTIMATE` — **internal only**, no customer publication.

## Formula

```
estimatedSohPercent = estimatedUsableCapacityKWh / verifiedReferenceCapacityKWh * 100
```

## Gates (all must pass for percent computation)

| Gate | Rule |
|------|------|
| Reference | Active reference capacity required — else `sohAvailability=UNAVAILABLE` |
| Verification | `verificationStatus=VERIFIED` — unverified → no percent |
| Capacity type | Assessment-compatible (`USABLE`, `USABLE_NET`, `NET`, `WORKSHOP_MEASURED`) |
| Stable assessment | Cross-session `HV_CAPACITY_SHADOW` with `shadowGatePassed=true` |
| Sessions | ≥ 3 qualified sessions |
| Freshness | Cross-session `computedAt` within 31 days |
| Capability | `dimo.segments.recharge` `capabilityVersion` unchanged since cross-session snapshot |
| Method conflict | No M3 method conflicts |
| Model version | `HV_SOH_GATE_MODEL_VERSION` in approved list |
| Plausible band | 50–105 % — **reject without clamping** |

`PUBLICATION_DISABLED` is always recorded when `hvSohPublicationEnabled=false` (default) but does **not** block internal computation.

## Output (`BatteryAssessment`)

- `type`: `HV_SOH_CAPACITY_ESTIMATE`
- `scope`: `HV`
- `scoreValue`: `estimatedSohPercent` (null when gated)
- `textValue`: `ESTIMATED_SOH_PERCENT_INTERNAL`
- `maturity` (inputSummary): `SHADOW` (high confidence) or `PROVISIONAL`
- `publicationEligible`: always `false`
- `sohPublicationEnabled`: mirrors env flag (default `false`)

### Availability

| Value | Meaning |
|-------|---------|
| `UNAVAILABLE` | No reference capacity |
| `GATED` | Reference or assessment gates failed |
| `COMPUTED_INTERNAL` | Percent computed, publication still off |

## Pipeline

`HvCapacityShadowService.recomputeM2ForSession` → M2 → summary → M3 → cross-session → **SOH gate**.

Idempotency: `hv-soh-gate:{vehicleId}:m{version}:{crossSessionKey}:{referenceId}:capv{capabilityVersion}`

Feature flags:

- `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` — pipeline gate (required)
- `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` — default `false`; informational only in v1

## Hard guards

- No wiring to `canonical-battery-health`, `hv_battery_health_current`, rental readiness, alerts, or tasks
- No silent clamping of out-of-band SOH values

## Files

- `hv-soh-gate.types.ts`
- `hv-soh-gate.policy.ts`
- `hv-soh-gate-assessment.service.ts`
- `battery-assessment.repository.ts` — `findLatestHvSohGateAssessment`, `persistHvSohGateAssessment`
