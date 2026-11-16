# Platform product catalog (Alpha central platform)

**Registry coverage status:** `AUDIT_IN_PROGRESS`  
**Last updated:** 2026-11-16 (P2-PR1)

## Owner architecture decision (2026-11-16)

**SUPERSEDES (for routing only):** Independent SYNQDRIVE-CORE extraction as the primary platform trajectory — see `architecture/core-extraction/SYNQDRIVE_CORE_EXTRACTION_MASTER_PLAN.md` (**PAUSED**, not deleted).

**Current binding direction:**

- **SYNQDRIVE-alpha** is the permanent central platform: Master Admin, intelligence engine, and Rental in one deployable system.
- **VYMOD**, Fleet, and further products are separate repositories that will consume secured, versioned APIs from Alpha (later phases).
- **SYNQDRIVE-CORE** remains a reference fork for selective ports; no automatic merge into Alpha.

## P2-PR1 scope (this workstream)

| Item | Behavior |
|------|----------|
| `ProductSlug.VYMOD` | Enum extension only; RENTAL/FLEET/TAXI unchanged |
| `ProductCatalogStatus` | `ACTIVE` \| `DISABLED` on `Product`; existing rows default `ACTIVE` |
| VYMOD catalog row | Idempotent SQL migration (`20261116153100_*`) — **no** org assignment |
| `ProductLicenseGuard` | **Unchanged** in P2-PR1 |
| M2M / vehicle grants | Out of scope (later slices) |
| Entitlements read API v1 | P2-PR2 — JWT + `OrgScopingGuard` only; `m2mProductionReady=false` until P3 |
| Vehicle product access | P2-PR3 — schema + internal `ProductVehicleAccessService`; grants empty until P2-PR4 |
| Master Admin grants / mode | P2-PR4A — backend APIs + MFA + audit; UI in P2-PR4B |

## `ProductCatalogStatus.DISABLED` (P2-PR1)

`DISABLED` is **catalog metadata only** for Master Admin / platform inventory. It does **not**:

- Revoke or block existing `OrganizationProduct` entitlements
- Change `ProductLicenseGuard` (still `OrganizationProduct.status === ACTIVE` only)
- Prevent `assignProduct` for a disabled catalog product until a future slice explicitly wires enforcement

Treat `catalogStatus` as lifecycle visibility in the product catalog, separate from org licensing state.

## Backward compatibility

- Existing `products` rows receive `catalog_status = ACTIVE` via migration default.
- Existing `OrganizationProduct` assignments are untouched.
- Admin API responses add optional `catalogStatus` field; no fields removed.

## Evidence

- Migrations: `backend/prisma/migrations/20261116153000_p2_pr1_*` through `20261116160000_p2_pr1_*`
- VYMOD row: migration `20261116153100_p2_pr1_product_catalog_vymod_row` (canonical SQL; no runtime overwrite helper in P2-PR1)