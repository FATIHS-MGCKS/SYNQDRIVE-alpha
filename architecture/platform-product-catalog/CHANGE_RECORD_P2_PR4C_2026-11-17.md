# P2-PR4C — TAXI platform product retirement (backend gate)

**Date:** 2026-11-17
**Owner decision:** TAXI is **not** a SYNQDRIVE software product. Valid platform slugs: RENTAL (operational), FLEET and VYMOD (preparation).
**BusinessType.TAXI**, legal-document product scope `TAXI`, and taxi-business UX remain separate from **ProductSlug** retirement.

## TAXI reference audit (Phase 1)

| Area | Path / symbol | Class | Action in PR4C |
|------|----------------|-------|----------------|
| Prisma enum | `ProductSlug.TAXI` in `schema.prisma` | A | **Deferred** — enum removal blocked (Phase 5) |
| Init migration | `20260311224040_init` `ProductSlug` enum | D | Preserved |
| Seed catalog | `backend/prisma/seed.ts` TAXI row | A | **Removed** from future seed |
| VYMOD migration row | `20261116153100_*` | — | Unchanged (VYMOD only) |
| Assign APIs | `ProductsService.assignProduct*`, `POST admin/products/assign` | A | **Blocked** via `assertPlatformProductAssignable` |
| Master Admin UI | `product-management.policy.ts`, tabs | A | UI already excluded (PR4B); backend gate added here |
| Vehicle access defaults | `organization-product-vehicle-access-defaults.ts` | A/D | Unchanged — historical rows / migrations |
| Grants parse | `parse-product-slug.ts` accepts TAXI | A/D | Unchanged — revoke/read legacy grants |
| Entitlements read | `entitlements-query.service` | — | Unchanged — reads existing rows |
| ProductLicenseGuard | `product-license.guard.ts` | — | Unchanged — ACTIVE rows only |
| Billing legacy backfill | `billing-legacy-backfill.*`, mappers | D | Preserved — maps TAXI → RENTAL base plan, not entitlement conversion |
| Vehicle onboarding readiness | rejects `ProductSlug.TAXI` profile | A | Unchanged — already throws |
| Business type org create | `BusinessType.TAXI`, wizard | B | **Preserved** |
| Master App business map | `App.tsx` Taxi → TAXI business type | B | **Preserved** |
| Legal doc scope | `LEGAL_PRODUCT_SCOPES`, rental wizard | C | **Preserved** |
| Architecture docs | billing-target-domain, README | E/D | Updated via this record |

## Phase 2 — historical data status

| Evidence | Result |
|----------|--------|
| Production DB read | **Not performed** (constraint: no production writes; no production snapshot in agent) |
| Disposable Postgres inventory query | **Not run** — no authoritative row counts in this PR |
| Repository schema FK surface | `OrganizationProduct` → `Product.slug`; `OrganizationProductVehicleGrant.productSlug`; billing backfill reads org product slugs |
| Assumption policy | **Did not assume zero TAXI assignments** |

**Owner/data follow-up before enum/catalog row deletion:** inventory `products` / `organization_products` / grants where slug = TAXI (status distribution); decide archival vs manual reassignment per org (no silent TAXI→RENTAL entitlement conversion).

## Phase 3 — backend retirement (this PR)

- `retired-platform-product-slugs.ts`: `RETIRED_PLATFORM_PRODUCT_SLUGS = { TAXI }`
- Called at entry of `assignProduct` and `assignProductForMasterAdmin` **before** any Prisma mutation
- `removeProduct`, `updateVehicleAccessMode`, entitlements **read**, and grant **revoke** paths unchanged for legacy rows

## Phase 4 — seed

- `seed.ts` no longer creates a TAXI catalog row on fresh seed runs
- Historical migrations and existing DB rows not deleted

## Phase 5 — physical enum removal

**STOPPED in this PR.**

Blockers:

1. Missing production/disposable DB evidence for active/historical `OrganizationProduct` and grant rows
2. PostgreSQL enum value removal requires no dependent rows and safe migration design
3. Billing legacy mapper still references `ProductSlug.TAXI` for historical compatibility
4. No owner decision on manual reassignment for orgs with legacy TAXI assignments

Target end state remains `ProductSlug = RENTAL | FLEET | VYMOD` after data + migration gate.

## Validation

- Unit: `retired-platform-product-slugs.spec.ts`, `products.service*.spec.ts`
- Regression: existing products/grants/entitlements suites
- `prisma validate`, registry validator, DSRG validator, `git diff --check`

## REGISTRY_REVIEWED

- **platform-product-catalog:** `AUDIT_IN_PROGRESS` → **UNCHANGED** (documentation + behavioral gate; promotion deferred)