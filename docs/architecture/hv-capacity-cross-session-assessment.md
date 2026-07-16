# HV Cross-Session Capacity Shadow Assessment

Prompt 55/78. Vehicle-level `BatteryAssessment` of type `HV_CAPACITY_SHADOW` in **Shadow Mode** — no customer publication, no rental readiness, no SOH.

## Inputs

| Source | Role |
|--------|------|
| M2 session medians | Primary — `metadata.m2CapacitySummary` with `STABLE_SHADOW` |
| M3 validation | Validation only — `metadata.m3Validation`, conflict detection |
| Reference capacity | Vehicle context fingerprint (`vehicle_battery_reference_capacities`) |
| M2 model version | Must match across sessions (`modelVersion` gate) |
| Session freshness | End within 31 days |

## Output (`BatteryAssessment`)

- `type`: `HV_CAPACITY_SHADOW`
- `scope`: `HV`
- `scoreValue`: `estimatedUsableCapacityKwh` (cross-session median of session medians)
- `textValue`: `ESTIMATED_USABLE_CAPACITY_NOT_SOH`
- `maturity` (inputSummary): `SHADOW`
- `publicationEligible`: always `false`
- `sohEligible`: always `false`

### Computed fields (inputSummary)

- `sessionCount`, `observationCount`
- `crossSessionMedianKwh`
- `spread` — MAD, robust spread, CV across session medians
- `methodAgreement` — M3 conflict-free ratio
- `confidence` — HIGH / MEDIUM / LOW / INSUFFICIENT
- `gateReasonCodes`, `reasons`

## Initial gates (v1)

| Gate | Rule |
|------|------|
| Min sessions | ≥ 3 `STABLE_SHADOW` sessions |
| Dominant session | No session > 50 % of total observations |
| Cross-session spread | Session-median CV ≤ 3 % |
| Intra-session stability | Each session CV ≤ 2 % |
| M3 conflict | 0 sessions with `methodConflict` |
| Freshness | Sessions within 31 days |
| Model version | Compatible M2 summary `modelVersion` |

## Pipeline

`HvCapacityShadowService.recomputeM2ForSession` → M2 → M2 summary → M3 → **cross-session assessment**.

Idempotency: `hv-cap-shadow-assess:{vehicleId}:m1:{latestSessionEndMs}`

Feature flag: `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED`

## Tesla audit tests

- **4 stable sessions** (3, 4, 6, 7) → ~55.5 kWh, confidence HIGH
- **Conflicting outlier** (68.4 kWh session) → `CROSS_SESSION_SPREAD_HIGH`
- **M3 method conflict** → `M3_METHOD_CONFLICT`

## Files

- `hv-capacity-cross-session.types.ts`
- `hv-capacity-cross-session.policy.ts`
- `hv-capacity-cross-session-assessment.service.ts`
- `battery-assessment.repository.ts` — `persistHvCapacityShadow`
