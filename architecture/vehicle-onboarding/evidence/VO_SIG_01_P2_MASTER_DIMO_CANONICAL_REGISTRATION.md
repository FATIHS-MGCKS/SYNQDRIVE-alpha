# VO-SIG-01 P2 — Master Admin DIMO canonical registration

**Status:** **PRODUCTION** (`DEPLOYED_TECHNICALLY_VERIFIED` / `NATURAL_E2E_PENDING`)  
**Production SHA:** `f5bb7bb0b35ca2ca1ccd69a24e73038d968761fb`  
**Date:** 2026-10-14 (implementation) · 2026-10-15 (production closure record)

## Decision

Route `POST /organizations/:orgId/vehicles/register-from-dimo` (Master Admin Connected Vehicles) through the **existing** VO3/VO4/VO5B onboarding stack:

1. Platform-trusted DIMO source adoption (`VehicleOnboardingSourceAdoptionService.adoptProviderSource`)
2. Admin + technical baseline capture (`VehicleOnboardingCaptureService`)
3. Production fail-closed readiness seal (`VehicleOnboardingReadinessService.evaluateAndSealReadiness`, org **RENTAL** or **FLEET** entitlement — first match in priority order)
4. Atomic activation with connection identity + registry outbox (`VehicleOnboardingActivationService.activateVehicle`), including **master registration finalize** (mandatory scalars, LV battery spec, enrichment job) **inside the activation transaction**

Legacy inline `VehiclesService.registerFromDimo` vehicle create + fire-and-forget billing hook is **removed** from the HTTP path.

## Adapter

`MasterDimoCanonicalRegistrationService` maps Master form payloads:

| Master field | Canonical target |
|--------------|------------------|
| `stationId`, `extraData.vehicleName/licensePlate/notes` | `draftAdminBaselineJson` |
| `manualSpecs.brakes/tires` | `draftTechnicalBaselineJson` v2 |
| `extraData.fuelType` | identity draft fuel override (when provided) |
| Remaining `extraData` scalars | activation TX SQL patch via `masterRegistrationFinalize` (mileage, hardware type, drive type, curb weight, service/oil intervals, …) |
| 12V `manualSpecs.battery` | `vehicle_battery_specs` inside activation TX (idempotent) |
| Tire tread / DOT follow-ups | `VehiclesService` tire lifecycle enrichment when tread fields present |

**No synthetic `preActivationProviderSourceRefId`.** Connection identity v1 is persisted only via activation on real case source refs.

## Guards

- Unverified DIMO modality → readiness `VO-RDY-CONN-001` FAIL (no vehicle row)
- Parallel Master registrations serialize via **source-claim transaction locks** (`VehicleOnboardingSourceAdoptionService`) plus resume checkpoints; completed case + matching payload fingerprint → **idempotent retry** (no vehicle mutation)
- Payload fingerprint stored on case `readinessSnapshotJson.masterDimoPayloadFingerprintV1`; mismatched retry → `MASTER_DIMO_REGISTRATION_PAYLOAD_MISMATCH`
- `SOURCE_ALREADY_REGISTERED` for cross-org binding, incomplete prior attempt, **OFFBOARDED** / **ARCHIVED** rediscovery (explicit re-onboard required)
- HTTP maps `SOURCE_ALREADY_REGISTERED` → `DIMO_VEHICLE_ALREADY_REGISTERED` for Master UI compatibility

## Validation

- Unit: `master-dimo-registration.mapper.unit.spec.ts`, `vehicles.service.register-from-dimo.spec.ts`
- PostgreSQL: `vo-sig-p2-master-dimo-registration.postgres.integration.spec.ts` (14 cases: stale mirror, parallel register, idempotent retry, activation rollback with finalize, field parity, full Prisma vehicle response, consent/outbox idempotency, ARCHIVED block, FLEET readiness; `VO_SIG_P2_MASTER_DIMO_PG=1`, wired in `vo2-vehicle-onboarding-postgres-ci.sh`)
- Field parity matrix: [VO_SIG_01_P2_MASTER_DIMO_FIELD_PARITY.md](./VO_SIG_01_P2_MASTER_DIMO_FIELD_PARITY.md)
- Schema bridge migration `20261014183000_vo_sig_p2_vehicles_registration_scalar_bridge` aligns Prisma `Vehicle` registration scalars for CI/response contract
- Frontend: `master-vehicle-registration.test.ts` (payload builders unchanged)

## Production closure

See [VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md](./VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md). Natural E2E on production remains **pending** (owner has no spare vehicle; **do not** create synthetic prod registrations).

## Non-goals (unchanged after deploy)

- No legacy `onVehicleProvisioned` billing hook on this path (registry `VEHICLE_ACTIVATED` outbox only)
- HM-only / manual create paths unchanged (next-phase audit: [VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md](../research/VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md))
