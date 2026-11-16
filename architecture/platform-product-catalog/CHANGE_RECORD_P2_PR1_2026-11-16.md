# CHANGE_RECORD — P2-PR1 Product catalog foundation

**Date:** 2026-11-16  
**Operation:** `SYNQDRIVE_ALPHA_P2_PR1_PRODUCT_CATALOG_FOUNDATION`

## BEFORE

- `ProductSlug`: RENTAL, FLEET, TAXI
- `Product` had no catalog lifecycle field
- No VYMOD catalog row

## WHY

Owner 2026-11-16: Alpha is the central platform; future apps need a governed product catalog before entitlements/M2M slices.

## CHANGE

- Add `VYMOD` to `ProductSlug`
- Add `ProductCatalogStatus` + `Product.catalogStatus` (default ACTIVE)
- Idempotent VYMOD row migration (SQL only — no runtime catalog overwrite helper)
- Additive `catalogStatus` on `ProductsService` list/stats responses

## NON-EFFECTS

- No Rental endpoint changes
- No M2M, vehicle grants, or entitlements read API
- No `ProductLicenseGuard` semantic change
- No production deploy in this workstream

## VALIDATION

- `npx prisma validate`
- Jest: `products.service.spec.ts`
- Optional: `PRODUCT_CATALOG_FOUNDATION_POSTGRES_INTEGRATION=1` postgres gate

## Review remediation (2026-11-16)

- Removed `catalogStatus ?? ACTIVE` fallback in `ProductsService` (schema-required field).
- Removed unused `ensureVymodCatalogProduct()` helper (canonical SQL migration is sole writer).
- Documented `DISABLED` as catalog metadata only; no `ProductLicenseGuard` coupling in P2-PR1.
- Postgres gate: disposable DB at `127.0.0.1:5433`, `prisma migrate deploy` for 3 migrations, replay no-op.