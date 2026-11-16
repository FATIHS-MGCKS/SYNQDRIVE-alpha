# P2-PR4B — Master Admin product management UI

**Date:** 2026-11-17  
**Owner decision:** TAXI is not a future SYNQDRIVE product (business retirement); technical enum/data removal is a follow-up workstream.

## CHANGE

- Master Admin organization detail gains **Produkte** tab integrating existing admin APIs (P2-PR1–PR4A).
- Dedicated **Produktmanagement** sidebar view (`view=product-management`) with roadmap overview, org search, and deep-link into org **Produkte** tab (reuses `OrganizationProductsTab` without duplicating mutations).
- Business launch labels (RENTAL existing, FLEET/VYMOD preparation) are **UI presentation only** — not a new DB status model.
- TAXI excluded from assignable catalog; historical `OrganizationProduct` rows remain visible read-only in UI.

## NON-CHANGES

- No backend API additions, schema migrations, M2M, Rental routes, or production mutations.
- `ProductSlug.TAXI` enum and seed row unchanged in PR4B.

## TAXI — smallest safe follow-up (next cleanup)

1. Inventory active `OrganizationProduct` and billing backfill paths still referencing `ProductSlug.TAXI`.
2. Migration to reassign or archive historical TAXI org products (data validation required).
3. Remove catalog seed + enum only after zero production assignments and billing mapper updates.
4. Keep `BusinessType.TAXI` and legal-document product scope separate from **product slug** retirement.

## Validation

- Frontend typecheck, ESLint, vitest policy/tab tests, production build.
- Backend existing products/grants regression suites (unchanged APIs).