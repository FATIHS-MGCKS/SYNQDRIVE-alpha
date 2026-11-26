# Product catalog admission entrypoint matrix (P2A)

**Last updated:** 2026-11-25  
**Authority:** `backend/src/modules/products/product-catalog-admission.authority.ts`  
**P2B status toggle:** uses the same `products` row `FOR UPDATE` lock — `STATUS_TRANSITION_MATRIX_P2B.md`.

## Catalog semantics (enforcement)

| `ProductCatalogStatus` | Admission (new / reactivate / expand) | Existing `OrganizationProduct` | `ProductLicenseGuard` | Billing / subscriptions |
|------------------------|---------------------------------------|--------------------------------|-----------------------|-------------------------|
| `ACTIVE` | Allowed (subject to existing guards) | Unchanged | Unchanged | Unchanged |
| `DISABLED` | **Denied** (`403 PRODUCT_CATALOG_ADMISSION_DENIED`) | **Preserved** | Unchanged | Unchanged |

`DISABLED` is **not** automatic revocation. Business launch readiness remains outside `catalogStatus`.

## Writer / entrypoint matrix

| Entrypoint | Operation class | P2A enforced | Notes |
|------------|-----------------|--------------|-------|
| `ProductsService.assignProduct` (legacy) | New org product / reactivation to `ACTIVE` | **Yes** | In-service; no separate HTTP controller today |
| `ProductsService.assignProductForMasterAdmin` | New / reactivation | **Yes** | `POST /api/v1/admin/products/assign` |
| `ProductsService.updateVehicleAccessMode` | Scope **broaden** (`SELECTED_VEHICLES` → `ORGANIZATION_WIDE`) | **Yes** | Narrowing unchanged; TAXI retired rules preserved |
| `ProductsService.removeProduct` | Removal | No | Not admission |
| `ProductsService.updateProductMetadataForMasterAdmin` | Catalog metadata | No | Explicitly preserved when `DISABLED` (except retired slugs) |
| `VehicleProductGrantService.grantExplicit` | New grant / re-grant from `REVOKED` | **Yes** | Idempotent active grant skips admission |
| `VehicleProductGrantService.revokeGrant` | Revocation | No | Not admission |
| `core.entitlements.v1` read APIs | Read | No | Unchanged |
| `ProductLicenseGuard` | Runtime route guard | No | Still `OrganizationProduct.status === ACTIVE` only |
| Vehicle activation / onboarding entitlement checks | Consumption | No | Uses existing org product row |
| Billing subscription lifecycle | Commercial | No | No `OrganizationProduct` writers found in billing modules |
| Test harness `ensureOrganizationProductEntitlement` | Test-only | No | Direct Prisma; not production path |
| Prisma seeds / SQL fixtures | Bootstrap | No | Operational concern; not customer admission |

## Owner decisions (deferred)

| Scenario | Status |
|----------|--------|
| Plan upgrade/downgrade on **already ACTIVE** org product while catalog `DISABLED` | **Allowed** (commercial mutation on existing entitlement; not new admission) |
| `TRIAL` → `ACTIVE` via assign | Treated as **reactivation admission** (denied when `DISABLED`) |
| Catalog status toggle API (Master Admin) | **P2B** — not in P2A |

## Concurrency (P2B-ready)

Admission mutations acquire `SELECT … FOR UPDATE` on the `products` row (`lockProductCatalogRowBySlug`) inside the same transaction as the org-product or grant write. P2B catalog status transitions must use the same lock on `products` before updating `catalog_status`.

## Rollback

Revert P2A application commit; `catalog_status` values are unchanged. No migration required.