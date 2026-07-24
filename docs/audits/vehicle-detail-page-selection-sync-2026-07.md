# Vehicle Detail Page — Selection & Query Sync (2026-07)

## Scope

Prompt 24/36: synchronize vehicle detail selection with the fleet-map query so metadata never goes stale when only status/cleaning fields change.

## Problem

`App.tsx` kept a copied `selectedVehicle` object. A narrow merge effect only refreshed when `status` or `cleaningStatus` changed, leaving plate, station, odometer, fuel, telemetry, and booking context stale after the 30s fleet-map poll.

## Architecture

| Concern | Source of truth |
|---------|-----------------|
| Vehicle identity | `selectedVehicleId` (stable id) |
| Visible metadata | Latest `fleetVehicles` row via `deriveSelectedVehicleFromFleet()` |
| Header draft (status/cleaning/station) | Derived from fleet row; skipped while mutation busy flags are set |
| Live telemetry | `useVehicleLiveMapStore` (id-bound, unchanged) |
| URL | `vehicleId` + `vdTab` (Prompt 23) |

No second stale object copy. Fleet map store `selectedVehicleId` stays in sync for list/map highlighting.

## Behavior

- Fleet poll / refetch → detail header and tabs see updated metadata automatically
- Status / cleaning PATCH → invalidate + `refreshFleetVehicles()`; derived row updates header when busy clears
- Vehicle switch → id changes; previous vehicle data cannot bleed
- Deleted / inaccessible vehicle → toast, clear selection + URL, return to fleet
- Org change → clear `selectedVehicleId` (defensive; full reload also applies)
- Browser back closes detail → clear selection

## Files

- `frontend/src/rental/lib/vehicle-detail-selection-sync.ts`
- `frontend/src/rental/App.tsx` — id-based selection, header sync, unavailable handler
- `frontend/src/rental/lib/vehicle-detail-selection-sync.test.ts`

## Tests

```bash
cd frontend && npm test -- vehicle-detail-selection-sync
```

Covers: plate/station/status/cleaning/metadata change, vehicle switch, deleted vehicle, query refetch, org change, header busy gating.
