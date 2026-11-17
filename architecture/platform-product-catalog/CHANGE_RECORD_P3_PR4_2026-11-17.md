# P3-PR4 — Versioned Core vehicle read APIs (M2M)

**Date:** 2026-11-17
**Contract:** `core.read.vehicles.v1` / `core.read.vehicle.v1`

## Endpoints

- `GET /api/v1/core/read/v1/organizations/:orgId/vehicles`
- `GET /api/v1/core/read/v1/organizations/:orgId/vehicles/:vehicleId`

## Authorization

- `CoreAppM2mJwtAuthGuard` — independent service JWT verification (not user `AuthGuard`)
- Global user `AuthGuard` skips user JWT only on `@CoreAppM2mSkipUserJwt()` routes (not broad path prefix)
- Scope: `core:app:vehicle:read`
- Revalidates registry binding, ACTIVE org product, versioned grant/credential, `ProductVehicleAccessService` visibility

## Non-effects

- Rental / user JWT routes unchanged
- `CORE_APP_M2M_*` defaults remain OFF
- No writes, no production activation claim

## Independent security remediation (2026-11-17)

| Finding | Remediation |
|---------|-------------|
| F1 | `@CoreAppM2mSkipUserJwt()` metadata + `Reflector` in `AuthGuard`; prefix bypass removed |
| F2 | Explicit numeric `exp` required on service JWT verification |
| F3 | `isCoreAppM2mResourceJwtVerificationAllowed()` mirrors token issuance production gate |
| F4 | Revalidate every JWT scope ⊆ current `allowedScopes` after binding resolution |
| F5 | `parseCoreReadPagination()` — strict query ints, max pageSize 100, safe `skip` |

## Evidence

- `backend/src/modules/core-app-m2m/core-read/*`
- HTTP security + unit specs