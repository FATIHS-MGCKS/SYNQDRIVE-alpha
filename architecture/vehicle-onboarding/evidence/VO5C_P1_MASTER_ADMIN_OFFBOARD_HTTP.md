# VO-5C-P1 — Master Admin safe offboard HTTP authority

| Field | Value |
|-------|-------|
| **Slice** | VO5C-P1 (backend HTTP only; **no** frontend cutover) |
| **Status** | IMPLEMENTED (module authority remains `AUDIT_IN_PROGRESS`) |
| **Last updated** | 2026-10-07 |

## HTTP surface

| Item | Value |
|------|-------|
| Method | `POST` |
| Route | `/admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard` |
| Controller | `VehicleOnboardingOffboardController` |
| Orchestration | `VehicleOnboardingOffboardService` → `VehicleOffboardingService.offboardVehicle` |
| Legacy deregister | **UNCHANGED** — `POST admin/vehicles/:vehicleId/deregister` |

## Authorization

- `RolesGuard` + `MASTER_ADMIN`
- `MasterAdminMfaGuard` + `RequireMasterAdminMfa(MASTER_INTEGRATIONS)` (same as VO-4.9 source adoption)
- Route `organizationId` + `vehicleId` validated against authoritative `Vehicle` ownership (`CASE_NOT_FOUND` / fail-closed on cross-tenant path mismatch)

## Request / idempotency

- Required: `reason` (`OFFBOARD_SOLD` \| `REMOVE_FROM_PRODUCT` \| `ADMINISTRATIVE_OFFBOARD`), `idempotencyKey` (1–128 chars)
- Optional: `note`
- Rejected: `destinationOrganizationId`, client `actorUserId`, lifecycle overrides
- Outbox idempotency authority: `vehicle-onboarding:VEHICLE_OFFBOARDED:v1:{clientKey}`

## Operational preflight (VO-5C policy)

| Signal | Policy |
|--------|--------|
| Active rental (`Booking.status=ACTIVE` or `Vehicle.status=RENTED`) | **BLOCK** `ACTIVE_RENTAL` |
| Committed future booking (`PENDING`/`CONFIRMED`, `endDate >= now`) | **BLOCK** `ACTIVE_BOOKING` |
| `VehicleTrip.tripStatus=ONGOING` | **BLOCK** `ONGOING_TRIP` |
| `BookingHandoverDraft` or pickup handover pending on committed booking | **BLOCK** `OPEN_HANDOVER` |
| Exclusive fleet operational lock | **No single authoritative predicate** — not modeled in P1 |
| Open damage / service case / unpaid invoice / open org task | **ALLOW** with warnings |

Preflight runs before mutation; **recheck** of blocking conditions runs inside the offboard transaction after `FOR UPDATE` row lock.

**Race note:** Booking/trip admission does not yet universally gate on `registryLifecycle=OFFBOARDED`; post-offboard admission closure is documented as residual risk for P2 hardening.

## Billing / provider boundaries

| Check | P1 |
|-------|-----|
| `NEW_OFFBOARD_DIRECT_LEGACY_BILLING_HOOK_USED` | **NO** — HTTP path does not call `onVehicleRemoved` |
| `DOUBLE_DEPROVISION_PATH_PRESENT` | **NO** — single `VEHICLE_OFFBOARDED` outbox → registry processor |
| Provider network disconnect in offboard transaction | **NO** |
| Local source link deactivation + consent revoke | **Preserved** (VO-5A) |

## Source adoption guard

`assertSourceNotCanonicallyRegistered` continues to block OFFBOARDED vehicles that retain `dimoVehicleId`; P1 adds explicit OFFBOARDED messaging in error details (`requiresReOnboard`).

## Legacy destructive endpoints (observe only)

| Path | P1 |
|------|-----|
| `POST admin/vehicles/:vehicleId/deregister` | Unchanged; weaker auth than onboarding admin |
| Tenant/org `DELETE` vehicle routes | Unchanged |
| `LEGACY_DEREGISTER_SECURITY_GAP` | **OPEN** (P2 cutover blocker) |

## Master Admin visibility (P2 prep)

`VehicleOperationalRowDto.registryLifecycle` exposed additively on registered operational rows (default list filtering unchanged).

## Validation

```bash
cd backend && npm run test:vehicle-onboarding:vo3 -- --testPathPattern='offboard'
VO5C_P1_OFFBOARD_PG=1 npm run test:vehicle-onboarding:vo5c-p1:postgres
```
