# Battery V2 — HV SOH Authority

## Provider SOH (canonical read path)

**Field:** `powertrainTractionBatteryStateOfHealth` → `tractionBatterySohPercent`

**Ingestion:** `HvBatteryHealthService.recordSnapshot()` → `BatteryEvidence` (`scope: HV`, `sourceType: PROVIDER_REPORTED`, `valueType: SOH_PERCENT`).

**Canonical resolution priority** (`CanonicalBatteryHealthService`):

1. Fresh provider-reported SOH (evidence or `VehicleLatestState.tractionBatterySohPercent`)
2. Workshop / document / manual evidence
3. Legacy pairwise capacity estimate — only if `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED`
4. Else → **unavailable** (no fabricated %)

**Freshness:** 45 days for provider SOH observation.

**Conflict tier:** `PROVIDER_OEM_SOH` wins over document/workshop over estimated.

## Calculated SOH (shadow SOH gate)

**Service:** `hv-soh-gate-assessment.service.ts` + `hv-soh-gate.policy.ts`

**Requires:** VERIFIED `VehicleBatteryReferenceCapacity` + compatible `capacityType`.

**Formula:** `estimatedSohPct = (estimatedCapacityKwh / referenceCapacityKwh) * 100` (with gate policies).

**Publication:** `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` (default OFF). Assessments carry `publicationEligible: false`.

## No fabricated HV SOH invariant

**CONFIRMED** in code:

- `hv-battery-health.service.ts`: "No age/km fallback model… never fabricate a percentage"
- `canonical-battery-health.service.ts`: HV SOH only from real data basis
- `soh-publication.ts`: legacy `degradation_model` values must not publish HV SOH

**Differentiate:**

| State | User-facing behavior |
|-------|---------------------|
| NO DATA | `unavailable` / unknown — not 0% |
| INSUFFICIENT DATA | Quality slice reflects partial evidence |
| STALE DATA | Stale freshness; not promoted |
| UNSUPPORTED METHOD | Profile/method not eligible |

## Provider SOH vs calculated estimate

When fresh provider SOH exists, it **authoritative_over** calculated shadow SOH in canonical read model.

## Gaps

- Fleet-wide provider SOH signal availability — often `NOT_LISTED`
- PHEV-specific provider SOH behavior — **UNKNOWN**
- Whether gross capacity still required when provider SOH present — reference used for shadow gate; provider SOH can satisfy canonical read without shadow
