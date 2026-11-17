# P3-PR4 — Versioned Core vehicle read APIs (M2M)

**Date:** 2026-11-17
**Contract:** `core.read.vehicles.v1` / `core.read.vehicle.v1`

## Endpoints

- `GET /api/v1/core/read/v1/organizations/:orgId/vehicles`
- `GET /api/v1/core/read/v1/organizations/:orgId/vehicles/:vehicleId`

## Authorization

- `CoreAppM2mJwtAuthGuard` — independent service JWT verification (not user `AuthGuard`)
- Global user `AuthGuard` skips `/api/v1/core/read/v1/*` prefix; service guard fail-closed
- Scope: `core:app:vehicle:read`
- Revalidates registry binding, ACTIVE org product, versioned grant/credential, `ProductVehicleAccessService` visibility

## Non-effects

- Rental / user JWT routes unchanged
- `CORE_APP_M2M_*` defaults remain OFF
- No writes, no production activation claim

## Evidence

- `backend/src/modules/core-app-m2m/core-read/*`
- HTTP security + unit specs