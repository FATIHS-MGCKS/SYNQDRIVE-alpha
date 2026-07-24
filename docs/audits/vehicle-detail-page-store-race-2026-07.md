# Vehicle Detail — Live Map Store Merge Behavior (2026-07)

## Scope

Prompt 25/36: eliminate store race conditions between GPS and dashboard telemetry channels.

## Problem pattern (fixed)

```typescript
// BEFORE — race-prone
const state = get();
if (!bound) return;
set({ ...state, ...patch }); // overwrites concurrent updates
```

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `VehicleTelemetryRequestCoordinator` | Per-channel abort, in-flight guard, `generation` on bind/reset |
| `useVehicleLiveMapStore` | `boundVehicleId` + `boundOrgId` + `boundGeneration`; functional `patchIfBound` |
| `vehicle-live-map-store-merge.ts` | Domain-aware merge rules |

## Binding contract

A patch is applied only when all match:

- `boundVehicleId === binding.vehicleId`
- `boundOrgId === binding.orgId`
- `boundGeneration === binding.generation`

`bindToVehicle(vehicleId, orgId, generation)` resets all telemetry fields and sets `loading: true`.
`generation` is sourced from `VehicleTelemetryRequestCoordinator.bind()`.

## Field domains

### GPS channel (live-gps)

`locationHistory`, `lastConfirmedPosition`, `lastLocationAt`, `gpsSource`, `targetPosition`, `heading`, `isMoving`, `speedKmh` (when from GPS)

GPS coordinates are applied only when `canApplyGpsCoordinates()` accepts the provider `measuredAt` (newer or equal vs current).

### Dashboard channel (telemetry snapshot)

`snapshot`, `isLiveTracking`, `loading`, `error`, `displayState`, `displayIgnition`, `displaySpeed`, `displayCoolant`, `displayEngineLoad`, `tripDetectionState`

### Shared freshness (timestamp-ordered)

`measuredAt`, `receivedAt`, `lastSignal`, `signalAgeMs`, `isFresh`, `telemetryFreshness`, `onlineStatus`

Older provider measurements cannot move freshness backward.

## Merge rules

1. **Functional updates** — `patchIfBound(binding, patch | (state) => patch)` always merges into the latest store row.
2. **Independent domains** — GPS patches never clear dashboard fields; dashboard patches never clear GPS position fields.
3. **Snapshot partial merge** — `mergeLiveTelemetrySnapshot(current, incoming)` keeps existing non-null fields when incoming is `null` (no zero-default snapshot).
4. **Timestamp gate** — `shouldAcceptNewerMeasurement` guards GPS coordinates and freshness fields.
5. **Reset** — vehicle/org switch or unmount calls `bindToVehicle` (new generation) or `unbind()`.

## Request lifecycle

```
bind(org, vehicle) → generation++
  ├─ dashboard.run(binding) ──► patchIfBound (dashboard domain)
  └─ gps.run(binding)       ──► patchIfBound (gps domain)
vehicle/org switch → generation++, store reset
stale response     → coordinator marks stale OR store rejects generation mismatch
abort/unmount      → coordinator.abort + store.unbind
```

## Files

- `frontend/src/rental/lib/vehicle-live-map-store-merge.ts`
- `frontend/src/rental/stores/useVehicleLiveMapStore.ts`
- `frontend/src/rental/hooks/useLiveVehicleTelemetry.ts`
- `frontend/src/rental/lib/vehicle-live-map-store-merge.test.ts`
- `frontend/src/rental/hooks/useLiveVehicleTelemetry.store-race.test.ts`

## Tests

```bash
cd frontend && npm test -- vehicle-live-map-store-merge
cd frontend && npm test -- useLiveVehicleTelemetry.store-race
```
