# Live GPS Enforcement (Prompt 16)

Hardened Live GPS access: every coordinate return path runs a full `AuthorizationDecisionService` check via `LiveGpsEnforcementService` before data leaves the server.

## Protected HTTP endpoints

| Endpoint | Purpose | Service identity | Deny behavior |
|----------|---------|------------------|---------------|
| `GET .../vehicles/:id/live-gps` | `LIVE_MAP` | `synqdrive-vehicles-live-gps` | `403 GPS_ACCESS_DENIED` |
| `GET .../vehicles/:id/telemetry` | `LIVE_MAP` | `synqdrive-vehicles-telemetry` | Coordinates redacted |
| `GET .../fleet-map` | `LIVE_MAP` | `synqdrive-fleet-map` | Per-vehicle coord redaction |
| `GET .../vehicles` | `LIVE_MAP` | `synqdrive-vehicles-list` | Per-vehicle `lat`/`lng` redaction |
| `GET .../vehicles/:id` | `LIVE_MAP` | `synqdrive-vehicle-detail` | `lat`/`lng` redaction |
| `GET .../fleet-connectivity` | `TECHNICAL_OVERVIEW` | `synqdrive-fleet-connectivity` | Per-vehicle coord redaction |
| `GET .../fleet-connectivity/:vehicleId` | `TECHNICAL_OVERVIEW` | `synqdrive-fleet-connectivity` | Coord redaction |
| `GET .../vehicles/:id/trips/:tripId/route` | `TRIPS` | `synqdrive-trips-route` | `403 GPS_ACCESS_DENIED` |
| Trip detail (waypoints/events) | `TRIPS` | `synqdrive-trips-detail` | Waypoints/events coords redacted |
| `GET /api/v1/admin/dimo/fleet-connectivity` | `TECHNICAL_OVERVIEW` | `synqdrive-master-admin-support` | Per-vehicle coord redaction + `supportAccess` flag |

Internal: `WhatsApp getVehicleLocationSummary` → `getLiveGps` (inherits gate).

## Protected internal service methods

- `VehiclesService.getLiveGps`
- `VehiclesService.getVehicleWithTelemetry`
- `VehiclesService.getFleetMapData` (gate on cache hit **and** miss)
- `VehiclesService.findByOrganization` / `findOne`
- `VehiclesService.getFleetConnectivity` / `getFleetConnectivityDetail`
- `TripsService.getRouteForTrip`
- `TripsService.findById` (location fields)
- `DimoController.getAdminFleetConnectivity`

## Decision contract (every gate)

| Field | Value |
|-------|-------|
| `dataCategory` | `GPS_LOCATION` |
| `action` | `READ` |
| `purpose` | Path-specific (`LIVE_MAP`, `TRIPS`, `TECHNICAL_OVERVIEW`) |
| `processorId` / service identity | Path-specific stable string |
| `vehicleId` | Required concrete ID |
| `organizationId` | Required; tenant vehicle lookup before decision |

Missing purpose or processor identity → `LiveGpsAccessDeniedException` (`MISSING_PURPOSE` / `MISSING_PROCESSOR_IDENTITY`).

## Cache behavior

| Cache | TTL | Revocation behavior |
|-------|-----|---------------------|
| Redis `fleet-map:{orgId}:v1` | 5s | Deleted on `DataAuthorizationsService.revoke` via `invalidateOrgGpsCaches` |
| `AuthorizationDecisionCache` (in-memory) | 30s | Org-scoped invalidation on revoke |
| Fleet-map read | — | Gate applied on **cache hit and miss** so revoked auth cannot serve stale coords |

`VehiclesService.invalidateFleetMapCache` (operational mutations) clears Redis only; authorization revoke clears Redis **and** decision cache.

## UI / logging

- Deny: `{ code: 'GPS_ACCESS_DENIED', reasonCode, correlationId }` — no coordinates in response
- Logs: `GPS access denied org=… vehicle=… reason=… correlation=…` — no lat/lng in log lines
- DIMO fetch failures: `Live GPS DIMO fetch failed for vehicle=…` (no coords)

## WebSocket / realtime

No GPS WebSocket implementation in codebase. Live map uses HTTP polling (`/live-gps` 5s, `/telemetry` 30s). Revocation takes effect on next poll after cache/decision invalidation.

## Decision reason codes (common)

| Code | Meaning |
|------|---------|
| `POLICY_MATCH` | Allowed |
| `POLICY_UNCLEAR` | No matching active policy |
| `DATA_AUTHORIZATION_DENIED` | Legacy + decision deny |
| `MISSING_PURPOSE` | Gate rejected incomplete context |
| `MISSING_PROCESSOR_IDENTITY` | Gate rejected incomplete context |
| `SUPPORT_IDENTITY_REQUIRED` | Master-admin path without support service identity |

## Tests

```bash
cd backend && npm test -- --testPathPattern="live-gps-enforcement|data-authorizations"
```

| Suite | Coverage |
|-------|----------|
| `live-gps-enforcement.service.spec.ts` | Unit: purpose/processor, tenant, deny mapping, redaction, support identity |
| `live-gps-enforcement.integration.spec.ts` | Decision cache org invalidation, cache key contract |
| `live-gps-enforcement.benchmark.spec.ts` | 100-vehicle fleet-map gate < 5s |

## Module

`backend/src/modules/data-authorizations/live-gps-enforcement/`

Exported as `LiveGpsEnforcementService` from `DataAuthorizationsModule`.
