# VO-SIG-01 P2 — Master Admin DIMO canonical registration

**Status:** IMPLEMENTED (draft PR; no production cutover in this slice)  
**Date:** 2026-10-14

## Decision

Route `POST /organizations/:orgId/vehicles/register-from-dimo` (Master Admin Connected Vehicles) through the **existing** VO3/VO4/VO5B onboarding stack:

1. Platform-trusted DIMO source adoption (`VehicleOnboardingSourceAdoptionService.adoptProviderSource`)
2. Admin + technical baseline capture (`VehicleOnboardingCaptureService`)
3. Production fail-closed readiness seal (`VehicleOnboardingReadinessService.evaluateAndSealReadiness`, `RENTAL`)
4. Atomic activation with connection identity + registry outbox (`VehicleOnboardingActivationService.activateVehicle`)

Legacy inline `VehiclesService.registerFromDimo` vehicle create + fire-and-forget billing hook is **removed** from the HTTP path.

## Adapter

`MasterDimoCanonicalRegistrationService` maps Master form payloads:

| Master field | Canonical target |
|--------------|------------------|
| `stationId`, `extraData.vehicleName/licensePlate/notes` | `draftAdminBaselineJson` |
| `manualSpecs.brakes/tires` | `draftTechnicalBaselineJson` v2 |
| `extraData.fuelType` | identity draft fuel override (when provided) |
| Remaining `extraData` scalars | post-activation SQL patch (mileage, hardware type, curb weight, …) |
| 12V `manualSpecs.battery` | `vehicle_battery_specs` after activation (unchanged semantics) |
| Tire tread / DOT follow-ups | `VehiclesService` tire lifecycle enrichment when tread fields present |

**No synthetic `preActivationProviderSourceRefId`.** Connection identity v1 is persisted only via activation on real case source refs.

## Guards

- Unverified DIMO modality → readiness `VO-RDY-CONN-001` FAIL (no vehicle row)
- `SOURCE_ALREADY_REGISTERED` for active duplicate and **OFFBOARDED** dimo binding (explicit re-onboard required)
- HTTP maps `SOURCE_ALREADY_REGISTERED` → `DIMO_VEHICLE_ALREADY_REGISTERED` for Master UI compatibility

## Validation

- Unit: `master-dimo-registration.mapper.unit.spec.ts`, `vehicles.service.register-from-dimo.spec.ts`
- PostgreSQL: `vo-sig-p2-master-dimo-registration.postgres.integration.spec.ts` (`VO_SIG_P2_MASTER_DIMO_PG=1`, wired in `vo2-vehicle-onboarding-postgres-ci.sh`)
- Frontend: `master-vehicle-registration.test.ts` (payload builders unchanged)

## Non-goals (this PR)

- No production deploy, no new prod vehicle registrations
- No legacy `onVehicleProvisioned` billing hook on this path (registry `VEHICLE_ACTIVATED` outbox only)
- HM-only / manual create paths unchanged
