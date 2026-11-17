# P2-PR5 — Entitlement policy alignment

**Date:** 2026-11-17
**Owner architecture decision:** 2026-11-16 (Alpha central platform; Core extraction paused)

## ENTITLEMENT_AUDIT (Phase 1)

| Consumer | Status check | Class | Aligned in PR5 |
|----------|--------------|-------|----------------|
| `entitlements-policy.ts` | Capability matrix (UI vs activation) | B/C | **Source of truth** |
| `EntitlementsQueryService` | Uses `resolveEntitlementCapabilities` | B | Unchanged |
| `ProductLicenseGuard` | ACTIVE-only operational | B | **Uses `ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES`** |
| `ProductVehicleAccessService` | ACTIVE-only resolve | B/D | **Same constant** |
| `VehicleProductGrantService.grantExplicit` | ACTIVE org product | D | **Same constant** |
| VO-4 `product-entitlement.authority` | ACTIVE activation lock | C | **Imports activation alias** |
| `ProductsService.findAll` stats | ACTIVE+TRIAL counts | E | Unchanged (admin reporting) |
| Master Admin assign paths | Sets ACTIVE on assign | E | Unchanged |
| `BillingEntitlementResolver` | Stripe/subscription contract | F | **Intentionally divergent** (not `OrganizationProduct.status`) |
| Rental route guards | Role + org scoping | B | Unchanged (no broadening) |
| `retired-platform-product-slugs` | TAXI write deny | E | Unchanged (PR4C) |

## STATUS_POLICY_MATRIX (binding)

| Status | UI (`canAccessProductUi`) | Operational (`ProductLicenseGuard`, grants, vehicle access) | Vehicle activation (VO-4) |
|--------|---------------------------|-------------------------------------------------------------|---------------------------|
| ACTIVE | allow | allow | allow |
| TRIAL | allow | **deny** | **deny** |
| SUSPENDED | deny | deny | deny |
| CANCELLED | deny | deny | deny |
| UNASSIGNED | deny | deny | deny |

`canAccessProductUi` does **not** authorize Rental business mutations on routes guarded by `ProductLicenseGuard`.

## Central policy (Phase 3)

- `ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES` = `[ACTIVE]`
- Aliases: vehicle grant + vehicle activation (same array)
- `isOrganizationProductOperationallyEntitled(status)` helper

## Expiration (Phase 4)

`ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY` = `NOT_ENFORCED_STATUS_ONLY_PARITY` — unchanged. Factual `licenseTermExpired` on read API only.

## Catalog + TAXI (Phase 5)

- `ProductCatalogStatus.DISABLED` remains metadata-only
- TAXI retirement write boundaries (PR4C) preserved

## Intentional divergences (remaining)

| Area | Reason |
|------|--------|
| Billing entitlement resolver | Subscription/stripe domain; not unified with org product slug status in P2-PR5 |
| TRIAL UI on Rental routes | Not all surfaces consume `core.entitlements.v1`; operational routes remain ACTIVE-only |
| `expiresAt` enforcement | Owner decision pending — do not infer expiry denial |

## P3 readiness / blockers

- M2M production entitlements consumer (`m2mProductionReady=false`)
- Optional: wire declared TRIAL UI capability to frontend only with explicit UX contract
- Production/data migration for `expiresAt` enforcement (separate decision)
- TAXI enum removal (PR4C follow-up)

## Validation

Matrix unit spec, ProductLicenseGuard spec, HTTP entitlements TRIAL case, existing products/grants regressions.

## REGISTRY_REVIEWED

- **platform-product-catalog:** `AUDIT_IN_PROGRESS` → **UNCHANGED** (policy documentation + runtime constant alignment only)