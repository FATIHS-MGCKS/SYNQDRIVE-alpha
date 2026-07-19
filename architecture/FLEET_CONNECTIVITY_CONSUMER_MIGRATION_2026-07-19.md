# Fleet Connectivity Consumer Migration (2026-07-19)

## Summary

Migrated productive connectivity consumers to canonical `VehicleConnectivityRuntimeState`
via batch projection on fleet-connectivity and fleet-map APIs.

## Backend

- `vehicle-connectivity-runtime-state.dto.ts` — API serializer
- `vehicle-connectivity-runtime-legacy.projection.ts` — transitional legacy field projection
- `vehicle-connectivity-runtime-batch.assembler.ts` — batch evidence assembly
- `VehicleConnectivityRuntimeProjectionService.projectForVehicles()` — fleet list batch read
- `VehiclesService.getFleetConnectivity()` / `getFleetMapData()` / `getDeviceConnection()` embed `connectivityRuntime`
- `connectivity-consumer-migration.spec.ts` — cross-surface + incident regressions

## Frontend

- `VehicleConnectivityRuntimeState` type on `FleetConnectivityVehicle`, `FleetMapVehicleResponse`, `DeviceConnectionSummary`
- `ConnectivityRuntimeChip` replaces split `ObdRowChip` + `DeviceConnectionWebhookChip` on fleet connectivity tab
- `connectivity-cross-surface-regression.test.ts` — runtime incident/standby/soft-offline/coverage/unknown cases

## Audit

Updated `docs/audits/data/fleet-connectivity-consumer-wiring-2026-07.csv` classifications.
