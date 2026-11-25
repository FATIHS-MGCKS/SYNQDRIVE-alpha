# CHANGE RECORD — P2A catalog admission enforcement (2026-11-25)

## Scope

- Enforce `ProductCatalogStatus` at server-side **admission** entrypoints only.
- **No** catalog status mutation API (P2B).
- **No** changes to `ProductLicenseGuard`, billing, or automatic entitlement revocation.

## Implementation

- Canonical module: `product-catalog-admission.authority.ts`
- Wired into `ProductsService` (legacy + Master Admin assign, vehicle access broaden) and `VehicleProductGrantService.grantExplicit`
- Typed denial: HTTP 403 `PRODUCT_CATALOG_ADMISSION_DENIED`, reason `CATALOG_DISABLED`
- Concurrency: `products` row `FOR UPDATE` in admission transactions

## Evidence

- Unit: `product-catalog-admission.authority.spec.ts`, `products.service.catalog-admission.spec.ts`, updated product/grant service specs
- Postgres (opt-in): `product-catalog-admission.postgres.integration.spec.ts` (`PRODUCT_CATALOG_P2A_POSTGRES_INTEGRATION=1`) — includes dual-connection concurrency seal (10 cases with P1 metadata gate script)
- Matrix: `ADMISSION_ENTRYPOINT_MATRIX_P2A.md`

## P2B prerequisites

- Master Admin catalog status PATCH/toggle must call the same `lockProductCatalogRowBySlug` before `catalog_status` update.
- Audit + MFA envelope for catalog lifecycle mutations (separate workstream).