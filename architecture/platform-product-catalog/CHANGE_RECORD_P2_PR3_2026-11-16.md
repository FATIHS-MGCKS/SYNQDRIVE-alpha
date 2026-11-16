# CHANGE_RECORD — P2-PR3 Vehicle product access foundation

**Date:** 2026-11-16  
**Operation:** `SYNQDRIVE_ALPHA_P2_PR3_VEHICLE_PRODUCT_ACCESS_FOUNDATION`

## CHANGE

- `OrganizationProduct.vehicleAccessMode`: `ORGANIZATION_WIDE` | `SELECTED_VEHICLES`
- `VehicleProductGrant` + `VehicleProductGrantStatus` (`ACTIVE`, `REVOKED`)
- Internal `ProductVehicleAccessService` (no public HTTP API in this PR)
- `assignProduct`: new rows — Rental-family `ORGANIZATION_WIDE`, **VYMOD `SELECTED_VEHICLES`**; updates do not change mode

## Legacy

- Migration backfill: existing `organization_products` → `ORGANIZATION_WIDE`
- No automatic vehicle grants; grants table empty at deploy

## Effective access (ACTIVE license only)

| Mode | Rule |
|------|------|
| ORGANIZATION_WIDE | Org vehicles with `registryLifecycle=ACTIVE` |
| SELECTED_VEHICLES | Same + ACTIVE `VehicleProductGrant` for product slug |

TRIAL / SUSPENDED / CANCELLED / unassigned: denied by resolver (ACTIVE-only license check).

## Deferred

- P2-PR4: Master Admin grant/revoke APIs (MFA + audit)
- P3: M2M product access
- Catalog `DISABLED`: metadata only (unchanged)

## NON-EFFECTS

- Rental route guards unchanged
- No public grant write endpoints
- No M2M modules