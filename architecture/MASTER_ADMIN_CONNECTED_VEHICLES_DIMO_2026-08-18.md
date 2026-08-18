# Master Admin — Connected Vehicles / DIMO (UI-7.3)

**Date:** 2026-08-18

## Hub

- Sidebar: **Verbundene Fahrzeuge** (`view=vehicles`)
- Sections: `cvSection=overview|vehicles|import`
- Legacy `fleet-connection` → redirect to vehicles overview

## Backend APIs

| Route | Purpose |
|-------|---------|
| `GET /admin/vehicles/operational` | Paginated list |
| `GET /admin/vehicles/operational/overview` | KPIs + attention queue |
| `GET /admin/vehicles/operational/attention-queue` | Top attention items |
| `GET /admin/vehicles/:vehicleId/operational` | Registered detail |
| `GET /admin/vehicles/unregistered/:dimoVehicleId/operational` | Unregistered DIMO detail |
| `GET /admin/vehicles/import-preflight` | Import conflict check |
| `GET /admin/vehicles/:vehicleId/operational/diagnostics` | Lazy fleet connectivity detail |

## Source of Truth

- **Telemetry:** `telemetry-freshness.resolver` → `telemetryFreshness` on every row
- **DIMO integration:** `deriveIntegrationConnectivity()` in `vehicle-attention.util.ts`
- **Attention:** `buildVehicleAttention()` — platform DIMO degraded suppresses per-vehicle ingestion errors
- **Identity display:** `computeDisplayTitle()`

## Frontend

- `frontend/src/master/connected-vehicles/*`
- No `listAll(200)` on App boot
- `PlatformVehiclesView` retained but not routed

## Follow-ups

- Organization reassignment (no backend endpoint)
- Enriched filter scale (500-row cap before in-memory filter)
