# VO5C-P2B3 — Tenant and direct vehicle DELETE lockdown

| Field | Value |
|-------|-------|
| **Slice** | VO5C-P2B3 |
| **Status** | IMPLEMENTED (draft PR) |
| **Depends on** | P2B1 merged (#1927), P2B2 merged (#1933) |
| **Last updated** | 2026-10-08 |

## Retired HTTP routes (fail-closed)

| Route | Guards preserved | Authorized response |
|-------|------------------|---------------------|
| `DELETE /organizations/:orgId/vehicles/:vehicleId` | `OrgScopingGuard`, `PermissionsGuard`, `fleet.manage` | **409** `LEGACY_VEHICLE_DESTRUCTION_DISABLED`, action `CONTACT_MASTER_ADMIN_FOR_OFFBOARD` |
| `DELETE /vehicles/:vehicleId` | `VehicleOwnershipGuard` (+ class `RolesGuard`) | **409** same code; tenant foreign/missing → **404** via ownership guard |

## Service defense

`VehiclesService.delete()` throws the same retirement contract with **no** Prisma/billing/outbox/provider/canonical offboard invocation.

## Canonical offboard (unchanged)

`POST /admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard` — **MASTER_ADMIN** + **MASTER_INTEGRATIONS** MFA only. Tenant `fleet.manage` does **not** authorize canonical offboard.

## Intentional breaking change

External or legacy clients expecting `200`/deleted vehicle body on DELETE now receive **409** after passing authorization guards.

## Frontend

`api.vehicles.delete(orgId, id)` wrapper **retained** (P2B2); no runtime callers located. Receives 409 if invoked post-deploy.

## Remaining risks

- `POST /admin/prune` — superseded by **VO5C-P2B4-0** emergency containment (`PLATFORM_PRUNE_DISABLED`)
- P2B1 legacy deregister 409 contract — **unchanged**

## Rollback risk

Reverting P2B3 restores destructive tenant/direct DELETE — **security regression**.

## Production

- `PRODUCTION_OFFBOARD_UI_ENABLED=NO`
- `PRODUCTION_P1_ROUTE_VERIFIED=NO`
