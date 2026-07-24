# Vehicle Detail Page — Unit Test Suite (Prompt 29/36)

**Date:** 2026-07-24  
**Command:** `cd frontend && npm run test:vehicle-detail`  
**Result:** **20 files, 182 tests — all passed**

## Coverage map (22 required areas)

| # | Area | Test location |
|---|------|---------------|
| 1 | Status normalization | `vehicle-detail-remediation.test.ts`, `vehicle-operational-state.test.ts` |
| 2 | Unknown status | `vehicle-detail-remediation.test.ts`, `vehicle-operational-unknown-display.test.ts` |
| 3 | Rental readiness | `vehicle-detail-remediation.test.ts`, `vehicle-overview-summary.utils.test.ts` |
| 4 | Blocked/Maintenance separation | `vehicle-detail-remediation.test.ts`, `vehicle-operational-selectors.test.ts` |
| 5 | Null value semantics | `vehicle-detail-remediation.test.ts`, `telemetryFreshness.test.ts` |
| 6 | Actual null value | `vehicle-detail-remediation.test.ts` |
| 7 | Provider measurement time | `vehicle-detail-remediation.test.ts`, `telemetryFreshness.test.ts` |
| 8 | Received time | `vehicle-detail-remediation.test.ts`, `telemetryFreshness.test.ts` |
| 9 | Position resolver | `vehicle-detail-remediation.test.ts`, `overview-map-position.test.ts` |
| 10 | Live position | `vehicle-detail-remediation.test.ts`, `overview-map-position.test.ts` |
| 11 | Last known position | `vehicle-detail-remediation.test.ts`, `overview-map-position.test.ts` |
| 12 | No position | `vehicle-detail-remediation.test.ts`, `overview-map-position.test.ts` |
| 13 | Telemetry state | `vehicle-detail-remediation.test.ts`, `telemetryFreshness.test.ts`, `connectivity-cross-surface-regression.test.ts` |
| 14 | 24/48h thresholds | `vehicle-detail-remediation.test.ts`, `telemetryFreshness.test.ts` |
| 15 | Future/invalid timestamps | `vehicle-detail-remediation.test.ts`, `telemetryFreshness.test.ts` |
| 16 | Store merge | `fleet-map-vehicle-store.utils.test.ts` (P1 R-07 optimistic merge) |
| 17 | Out-of-order responses | `useVehicleLiveMapStore.test.ts`, `useLiveVehicleTelemetry.test.ts` |
| 18 | Vehicle/tenant binding | `useVehicleLiveMapStore.test.ts`, `overview-map-position.test.ts` |
| 19 | Polling lifecycle | `useLiveVehicleTelemetry.test.ts` |
| 20 | Retry/backoff decision | `useLiveVehicleTelemetry.test.ts` (GPS silent fail, dashboard error surfaced) |
| 21 | Permission-based UI | `vehicle-detail-permissions.ui.test.tsx` |
| 22 | Map lifecycle helpers | `liveMapUtils.test.ts` |

## New / extended files

- `src/rental/lib/vehicle-detail-remediation.test.ts` — numbered remediation suite (deterministic `now`)
- `src/rental/stores/useVehicleLiveMapStore.test.ts`
- `src/rental/hooks/useLiveVehicleTelemetry.test.ts`
- `src/lib/liveMapUtils.test.ts`
- `src/rental/components/vehicle-detail/vehicle-detail-permissions.ui.test.tsx`
- Extended: `fleet-map-vehicle-store.utils.test.ts`, `telemetryFreshness.test.ts`

## Conventions followed

- Vitest + co-located `*.test.ts` / `*.ui.test.tsx`
- Deterministic time via fixed `now` or `vi.useFakeTimers()` where needed
- No provider/API calls in pure logic tests; hook tests mock `api.vehicles.*`
- No snapshots for business logic
- No production data — synthetic IDs (`org-1`, `veh-1`, `AVL-1`)

## Verify script

```bash
cd frontend && npm run test:vehicle-detail:verify
```
