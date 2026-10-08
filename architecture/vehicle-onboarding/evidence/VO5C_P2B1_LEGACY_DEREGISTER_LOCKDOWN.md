# VO5C-P2B1 — Legacy Master Admin deregister lockdown

| Field | Value |
|-------|-------|
| **Slice** | VO5C-P2B1 |
| **Status** | IMPLEMENTED (draft PR) |
| **Depends on** | VO5C-P2A merged (`8deebf19c…`), VO5C-P1 canonical offboard HTTP |
| **Last updated** | 2026-10-08 |

## Previous behavior (retired)

`POST /admin/vehicles/:vehicleId/deregister` invoked `VehiclesService.deregister()`:

- Optional `billingQuantity.onVehicleRemoved` hook
- `prisma.vehicle.delete` (physical delete + broad CASCADE)
- `DimoVehicle` FK `onDelete: SetNull` (mirror retained)
- **No** `MASTER_ADMIN` role decorator on route (P2B0 critical gap)
- **No** `MASTER_INTEGRATIONS` MFA step-up

## New behavior (fail-closed)

Authorized callers (`MASTER_ADMIN` + MFA policy) receive:

- **HTTP 409 CONFLICT**
- `code`: `LEGACY_VEHICLE_DESTRUCTION_DISABLED`
- `action`: `USE_CANONICAL_OFFBOARD`
- `canonicalRoute`: `POST /admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard`
- `requiredFields`: `reason`, `idempotencyKey`

No vehicle lookup, no VIN/org disclosure, identical body for existing / missing / foreign `vehicleId`.

`VehiclesService.deregister()` throws the same contract (defense in depth). No Prisma, billing, outbox, or provider mutation.

## Canonical offboard (unchanged)

`VehicleOnboardingOffboardController` — MFA, org scope, preflight, idempotency, `ACTIVE`→`OFFBOARDED`, `VEHICLE_OFFBOARDED` outbox, VO5B billing deprovision.

## Intentional breaking change

Legacy HTTP clients expecting `200` + `deregisteredVehicle` now receive **409**. No auto-proxy to canonical offboard. External integrators must adopt the canonical contract.

## Remaining risks (not P2B1)

- `DELETE /organizations/:orgId/vehicles/:vehicleId` (fleet manage)
- `DELETE /vehicles/:vehicleId` (VehicleOwnershipGuard)
- `POST /admin/prune` (BREAK_GLASS)

## Production release

- `PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED=NO` until independent runtime proof
- `VITE_MASTER_VEHICLE_OFFBOARD_UI` must remain OFF until P1 verified
- Deploy P2B1 before enabling UI in production
- Rollback of P2B1 would restore destructive deregister — treat as security regression

## Validation

```bash
cd backend && npm test -- vehicles-legacy-deregister-lockdown
cd backend && npm test -- vehicle-onboarding-offboard.controller
```
