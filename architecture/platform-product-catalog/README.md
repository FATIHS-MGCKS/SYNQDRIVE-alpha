# Platform product catalog (Alpha central platform)

**Registry coverage status:** `AUDIT_IN_PROGRESS`  
**Last updated:** 2026-11-17 (P3 complete on `main`; integration certification evidence)

## Owner architecture decision (2026-11-16)

**SUPERSEDES (for routing only):** Prior Core-extraction trajectory (Alpha copied into SYNQDRIVE-CORE; Core and Rental intended as separate deployables over M2M) — **PAUSED** 2026-11-16; CORE is a **reference fork** only (no automated merge-back). Details: Master Plan § Historical trajectory.

**Binding plan:** [`architecture/platform-reorientation/SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../platform-reorientation/SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) · **Progress:** [`PROGRESS_LEDGER.md`](../platform-reorientation/PROGRESS_LEDGER.md)

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

## `ProductCatalogStatus.DISABLED` (P2-PR1 + P2A)

**P2A (2026-11-25):** `DISABLED` **blocks new admission** (org product assign/reactivate, vehicle grant/re-grant, vehicle access broaden) via `product-catalog-admission.authority.ts`. See `CHANGE_RECORD_P2A_ADMISSION_2026-11-25.md` and `ADMISSION_ENTRYPOINT_MATRIX_P2A.md`.

`DISABLED` still does **not**:

- Revoke or delete existing `OrganizationProduct` rows
- Change `ProductLicenseGuard` (still `OrganizationProduct.status === ACTIVE` only)
- Alter billing, subscriptions, or `core.entitlements.v1` read semantics for existing entitlements

**P2B (2026-11-25):** Master Admin catalog status toggle (`ACTIVE` ↔ `DISABLED`) — dedicated API + impact preview + UI. See `STATUS_TRANSITION_MATRIX_P2B.md` and `CHANGE_RECORD_P2B_STATUS_2026-11-25.md`. P2A admission lock ordering preserved.

## External applications — service client registry (P3-PR1)

- Tables: `core_app_service_clients`, `core_app_service_org_grants`
- **RENTAL** is a first-class platform product; co-located Rental uses internal JWT/guards, not M2M
- M2M foundation is for **separate** application backends (Fleet, VYMOD) consuming versioned Alpha APIs
- Master Admin control surface and token exchange **not** in PR1
- Runtime **OFF** unless `CORE_APP_M2M_ENABLED=true` (still not production-ready without `CORE_APP_M2M_PRODUCTION_READY`)

See `CHANGE_RECORD_P3_PR1_2026-11-17.md`.

## Entitlement policy (P2-PR5)

P6C commercial vs runtime record: [`../platform-reorientation/evidence/P6C_PRODUCT_ENTITLEMENT_COMMERCIAL_POLICY_RECORD_2026-11-22.md`](../platform-reorientation/evidence/P6C_PRODUCT_ENTITLEMENT_COMMERCIAL_POLICY_RECORD_2026-11-22.md)

Canonical status capabilities: `backend/src/modules/products/entitlements/entitlements-policy.ts`

- **Operational / route guards:** `ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES` (ACTIVE only)
- **Declared API:** `core.entitlements.v1` — TRIAL grants UI capability only; activation fail-closed
- **`expiresAt`:** reported factually; **not** enforced at runtime (`NOT_ENFORCED_STATUS_ONLY_PARITY`)

See `CHANGE_RECORD_P2_PR5_2026-11-17.md`.

## P6-PR3 — Rental operational API product license (2026-11-19)

- **Guard:** existing `ProductLicenseGuard` + `@RequireProduct(ProductSlug.RENTAL)` on org-scoped Rental HTTP controllers (bookings, customers, pricing, stations, rental payments, rental rules/health/RDA).
- **Policy:** `OrganizationProduct.status === ACTIVE` only (TRIAL / suspended / cancelled → HTTP 403); `expiresAt` not enforced (unchanged).
- **Excluded:** Core entitlements read, vehicle intelligence, M2M resource APIs, Master Admin product administration, Stripe/webhook callbacks (`webhooks/stripe-connect`, platform billing webhooks).

## TAXI platform product retirement (P2-PR4C)

- **Owner:** TAXI is not a future SYNQDRIVE **ProductSlug**; `BusinessType.TAXI` and legal scope `TAXI` remain.
- **Backend:** `assertPlatformProductAssignable` rejects TAXI on `assignProduct` / `assignProductForMasterAdmin` before DB writes.
- **Seed:** TAXI catalog row omitted from `prisma/seed.ts` for new environments.
- **Enum / row deletion:** deferred until data inventory + migration design (see `CHANGE_RECORD_P2_PR4C_2026-11-17.md`).

## Backward compatibility

- Existing `products` rows receive `catalog_status = ACTIVE` via migration default.
- Existing `OrganizationProduct` assignments are untouched.
- Admin API responses add optional `catalogStatus` field; no fields removed.

## P3-PR2 — M2M token exchange (client credentials)

- **Endpoint:** `POST /api/v1/auth/core-app/token` (`core.app.token.v1`)
- **Runtime:** `CORE_APP_M2M_ENABLED=false` and `CORE_APP_M2M_PRODUCTION_READY=false` by default; isolated `CORE_APP_M2M_JWT_SECRET` required when enabled
- **Rental:** co-located routes remain user-JWT; service tokens are not accepted on existing Rental/core user routes
- **Deferred:** versioned resource APIs (P3-PR4), MA client UI (P3-PR5)

See `CHANGE_RECORD_P3_PR2_2026-11-17.md`.

## P3-PR3 — M2M Redis rate limits

- **Enforcement:** only when `CORE_APP_M2M_ENABLED=true`; Redis required (fail-closed)
- **Limits:** per-IP and per-client fixed windows; conservative env defaults
- **Not production-activated:** runtime M2M remains default OFF

See `CHANGE_RECORD_P3_PR3_2026-11-17.md`.

## P3-PR4 — Core vehicle read APIs (M2M)

- `GET /api/v1/core/read/v1/organizations/:orgId/vehicles`
- `GET /api/v1/core/read/v1/organizations/:orgId/vehicles/:vehicleId`
- Service JWT + `core:app:vehicle:read`; reuses `ProductVehicleAccessService`

See `CHANGE_RECORD_P3_PR4_2026-11-17.md`.

## P3-PR5 — Master Admin service client management

- Admin API: `/api/v1/admin/core-app-service-clients` (+ org grants, credential rotation)
- MFA: `MASTER_API_KEYS`; audit on privileged mutations
- UI: Master `service-client-management` view; one-time secret display
- **Does not** enable M2M runtime or assign org products automatically

See `CHANGE_RECORD_P3_PR5_2026-11-17.md`.

## P3 integration certification (post–#2421)

Evidence record: [`evidence/P3_FINAL_INTEGRATION_CERTIFICATION_2026-11-17.md`](evidence/P3_FINAL_INTEGRATION_CERTIFICATION_2026-11-17.md) — **PASS_WITH_BLOCKERS** (fresh-DB migration pre-existing blocker; M2M not production-activated).

## Evidence

- Migrations: `backend/prisma/migrations/20261116153000_p2_pr1_*` through `20261116160000_p2_pr1_*`
- VYMOD row: migration `20261116153100_p2_pr1_product_catalog_vymod_row` (canonical SQL; no runtime overwrite helper in P2-PR1)
- P3-PR1 registry: `20261117133000_p3_pr1_core_app_service_client_registry`