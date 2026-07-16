# HV Capacity Shadow Evaluation (Internal Read Model)

Prompt 58/78. Internal technical shadow evaluation for HV capacity and possible SOH — **admin/diagnostic surfaces only**.

## Endpoint

```
GET /api/v1/organizations/:orgId/data-analyse/vehicles/:vehicleId/hv-capacity-shadow-evaluation
```

**Permission:** `data-analyse` `read` (not `fleet-condition` alone).

## Read model fields

| Section | Content |
|---------|---------|
| `capabilityProfile` | Resolved HV method profile (SOC, energy, segments, supported methods) |
| `rechargeSessions` | Session list with quality, M2 summary/median, M3 validation, M2 observations |
| `crossSessionAssessment` | Latest `HV_CAPACITY_SHADOW` assessment + confidence/spread |
| `referenceCapacity` | Active reference + verification status |
| `sohGate` | Latest `HV_SOH_CAPACITY_ESTIMATE` result |
| `publicationBlockers` | Aggregated reasons against customer publication |
| `modelVersions` | M2/M3/cross-session/SOH gate versions |
| `freshness` | Computed/stale flags (31d window) |

## Hard guards

- `publicationEligible: false`, `readinessEffect: false` always
- No raw `dimoTokenId`, `providerSegmentId`, or change-history payloads
- No wiring to canonical battery health, rental readiness, or alerts

## Files

- `hv-capacity-shadow-evaluation.types.ts`
- `hv-capacity-shadow-evaluation.mapper.ts`
- `hv-capacity-shadow-evaluation.service.ts`
- `hv-capacity-shadow-evaluation.controller.ts`
