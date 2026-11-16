# CHANGE_RECORD — P2-PR4A Master Admin vehicle grant admin API

**Date:** 2026-11-16  
**Operation:** `SYNQDRIVE_ALPHA_P2_PR4A_PRODUCT_VEHICLE_GRANT_ADMIN_API`

## CHANGE

- `VehicleProductGrantAdminController` — list/grant/revoke under `/api/v1/admin/organizations/:orgId/...`
- `VehicleProductGrantService` — concurrency-safe grant/revoke/re-grant + audit
- `ProductsController` — MFA-guarded assign/remove + `PATCH .../vehicle-access-mode` (optimistic `ifCurrentVehicleAccessMode`)
- Legacy `assignProduct(orgId, slug, plan)` unchanged for non-audit callers

## Auth

- `RolesGuard` + `MASTER_ADMIN` + `MasterAdminMfaGuard` + `STEP_UP_ACTION.MASTER_ORGANIZATION`
- **MFA enforcement:** active only when `IAM_MFA_MASTER_ADMIN_ENABLED` and step-up flags are on (default **off** in dev/CI)

## Audit

- Explicit `MasterAdminAuditService.record` on grant/revoke/mode/assign/remove mutations
- **Failure semantics:** DB mutation commits first; audit `record` is best-effort after commit (audit failure does not roll back grant/mode)

## Deferred

- P2-PR4B Master Admin UI
- P5 full Master Admin audit
- M2M product access

## NON-EFFECTS

- No schema migration
- ProductLicenseGuard unchanged
- Entitlements read API unchanged
- Rental routes unchanged