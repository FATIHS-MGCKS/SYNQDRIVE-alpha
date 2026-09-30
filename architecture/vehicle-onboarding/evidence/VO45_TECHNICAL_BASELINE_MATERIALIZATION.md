# VO-4.5 — Technical baseline contract and safe activation materialization

**Status:** Evidence (module remains `AUDIT_IN_PROGRESS`)  
**Anchor main:** `7744e3983b796885b0e802bb30b95499663cd78c` (VO-4 merged)

## Authority map (classification)

| Model / surface | Classification |
|-----------------|----------------|
| `VehicleTireSetup` | INSTALLED_CONFIG (+ implicit HEALTH via `healthStatus` default EXCELLENT) |
| `VehicleTireSetupMountPeriod` | INSTALLED_CONFIG |
| `VehicleTireTreadMeasurement` | MEASUREMENT |
| `TireHealthSnapshot` | HEALTH_CONCLUSION |
| `VehicleBrakeReferenceSpec` | REFERENCE_SPEC |
| `BrakeComponentInstallation` | INSTALLED_CONFIG |
| Brake health snapshots / current | HEALTH_CONCLUSION |
| `VehicleBatteryReferenceCapacity` | REFERENCE_SPEC (Battery V2) |
| `VehicleBatterySpec` | Mixed vehicle master / legacy projection — not onboarding HV reference authority |
| `Vehicle.hvBatteryCapacityKwh` | Legacy/projection input for drive profile & HV health — **not written by onboarding in VO-4.5** |
| Hv battery health snapshots / assessments | HEALTH_CONCLUSION |

## Technical baseline draft

- **V1:** `referenceInputs` opaque map — retained for historical cases only.
- **V2:** `VehicleTechnicalBaselineDraftV2` (`version: 2`) in existing `draftTechnicalBaselineJson` / `draftTechnicalBaselineVersion` (no Prisma migration).

Sections:

- `tireReferenceSpec` — reference-only dimensions/pressure (readiness may PASS; **no row materialization** in VO-4.5).
- `tireInstalledConfig` — requires `evidenceInstalled: true` (materialization **blocked** — see tire gap).
- `brakeReference` — maps to `VehicleBrakeReferenceSpec` via `brake-reference-spec.domain` normalizer.
- `hvBatteryReference` — maps to `VehicleBatteryReferenceCapacity` via Battery V2 policy (`UNVERIFIED` initial status).

## V1 compatibility

- V1 opaque IDs (`tireReferenceId`, `brakeReferenceSpecId`, `hvBatteryReferenceId`) do **not** resolve to pre-activation governed entities.
- **REQUIRED** baseline + V1 opaque only → `NOT_READY` / `CONTRACT_UPGRADE_REQUIRED`.
- **DEFERRED_ALLOWED** + V1 opaque → treated as non-materializable deferred, not PASS.

## Tire reference gap

`VEHICLE_TIRE_SETUP_SAFE_FOR_REFERENCE_ONLY=NO` — defaults (`status=ACTIVE`, `healthStatus=EXCELLENT`) imply installed healthy tires.

`TIRE_REFERENCE_MATERIALIZATION_BLOCKED_BY_SCHEMA=YES`  
`TIRE_REFERENCE_SCHEMA_CHANGE_REQUIRED=NO` (deferred; future `VehicleTireReferenceSpec` candidate documented only).

## Activation materialization

Inside `VehicleOnboardingActivationService` transaction, after vehicle insert:

1. Parse sealed technical baseline V2
2. Materialize brake reference spec when present and valid
3. Materialize HV reference capacity when present and valid (no auto-verify)
4. Assert `VO-INV-BASELINE-MATERIALIZATION-001` for REQUIRED HV on BEV rental
5. Continue org assignment / provider links / outbox

**Non-authority:** onboarding does not create health conclusions, measurements, or synthetic service events.

## Tests

- Unit: `technical-baseline-draft.validation.unit.spec.ts`
- Postgres: `vo45-baseline.postgres.integration.spec.ts` (also runs when `VO4_READINESS_PG=1`)
