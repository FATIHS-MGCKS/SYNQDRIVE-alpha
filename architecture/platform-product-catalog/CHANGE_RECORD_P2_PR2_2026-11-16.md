# CHANGE_RECORD — P2-PR2 Entitlements read API v1

**Date:** 2026-11-16  
**Operation:** `SYNQDRIVE_ALPHA_P2_PR2_ENTITLEMENTS_READ_API_V1`

## CHANGE

- Added `GET /api/v1/core/entitlements/v1/organizations/:orgId`
- Added `GET /api/v1/core/entitlements/v1/organizations/:orgId/products/:productSlug`
- Ported `EntitlementsQueryService`, `entitlements-policy`, contract `core.entitlements.v1`
- Auth: global `AuthGuard` + `@OrgScoped()` / `OrgScopingGuard` — **no M2M** (P3)

## Capability policy (declared)

| Status | canAccessProductUi | canActivateVehicles |
|--------|--------------------|---------------------|
| ACTIVE | true | true |
| TRIAL | true | false |
| SUSPENDED / CANCELLED / unassigned | false | false |

**Enforcement gap (documented):** `ProductLicenseGuard` remains **ACTIVE-only**; TRIAL `canAccessProductUi` is not enforced on all routes.

## Expiration

- `licenseTermExpired` is factual; `expiresAtPolicy=NOT_ENFORCED_STATUS_ONLY_PARITY`
- No new expiry-based denial in this PR

## Catalog status

- `ProductCatalogStatus.DISABLED` remains metadata only; entitlements source is `OrganizationProduct`

## NON-EFFECTS

- No schema migration
- No M2M modules or service tokens
- No Rental endpoint changes
- No ProductLicenseGuard changes