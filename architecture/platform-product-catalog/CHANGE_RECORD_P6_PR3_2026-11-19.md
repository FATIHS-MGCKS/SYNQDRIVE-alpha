# P6-PR3 — Rental operational API product license enforcement

**Status:** DRAFT (implementation on feature branch)  
**Date:** 2026-11-19  
**Policy:** `ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES` (ACTIVE only); TRIAL does not grant operational Rental HTTP access.

## Change

Wires existing `ProductLicenseGuard` + `@RequireProduct(ProductSlug.RENTAL)` on org-scoped Rental HTTP controllers (see `backend/src/shared/guards/rental-product-license.controllers.ts`).

## Non-goals (unchanged)

- No new expiration enforcement (`expiresAt` remains informational).
- No M2M activation; no schema migration.
- Core intelligence, Master Admin product admin, `core.entitlements.v1`, and Stripe/webhook callbacks remain outside this guard.

## Validation

Focused Jest: guard unit tests, controller metadata registry, HTTP matrix on `CustomersController`, bookings guard stack characterization.