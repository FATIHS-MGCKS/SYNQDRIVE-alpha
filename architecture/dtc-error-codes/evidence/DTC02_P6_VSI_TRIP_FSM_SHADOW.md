# DTC-02 P6 — VSI × Trip FSM adaptive polling shadow wiring

**Date:** 2026-10-22  
**Epistemic:** `CONFIRMED` for pure planner overlay + read-only shadow batch wiring under unit tests; `NOT_DEPLOYED`; no additional DIMO DTC requests; legacy 3h scheduler unchanged.

## Phase A — gap matrix

| Component | Status | Notes |
|-----------|--------|-------|
| P3 adaptive pure planner | **EXISTS** | `dtc-02-adaptive-planner.ts` |
| Shadow fan-out hook | **EXISTS** | `runDtc02AdaptiveSchedulerShadowBatch` in `dimo-dtc.processor.ts` |
| VSI `diagnostic_trouble_code` / `obdDTCList` timestamp | **EXISTS** | `VehicleSignalCapabilityProfile.signalsSnapshot` |
| VSI freshness classifier | **EXISTS** | `computeSignalFreshnessAtEvaluation` |
| Trip interval authority (`vehicle_trips`) | **EXISTS** | `isVehicleInActiveTripAtMs` pattern reused in shadow loader |
| Trip FSM state (`vehicle_trip_detection_state`) | **EXISTS** | `TripDetectionState` + APDS shadow trip authority helpers |
| P6 Trip×VSI planner overlay | **NEEDS_WIRING → DONE** | `applyDtc02P6TripVsiShadowOverlay` |
| Shadow batch load Trip+VSI | **NEEDS_WIRING → DONE** | extended `loadDtc02AdaptiveShadowVehicleRows` |
| Adaptive enqueue / 3h scheduler change | **MISSING (intentional)** | P6 shadow-only |
| New DB tables / event bus | **MISSING (intentional)** | not required |

## Phase B — implementation summary

- **VSI:** latest per-vehicle `VehicleSignalCapabilityProfile` → `diagnostic_trouble_code.lastSourceTimestamp` → freshness at evaluation.
- **Trip:** `vehicle_trips` interval at tick + `VehicleTripDetectionState` for START/ACTIVE/END/STANDBY phase; stale FSM boundaries ignored; ACTIVE_TRIP without interval fails closed.
- **Planner:** P3 baseline unchanged; optional `tripVsiContext` triggers P6 overlay (`hypotheticalNextCheckAtMs` may reach 24h standby policy for shadow metrics; `proposedNextCheckAtMs` still ≤ legacy 3h).
- **Min poll spacing:** `DTC02_MIN_SHADOW_INTERVAL_MS` = **15 minutes**.

## Phase C — shadow policy

- No provider DTC poll enqueue.
- No episode / source-head / webhook config mutations.
- Flags default **OFF** (`DTC_02_ADAPTIVE_SCHEDULER_SHADOW_*`).
- Compare legacy 3h ticks vs `proposedNextCheckAtMs` and `hypotheticalNextCheckAtMs` via existing DTC-02 adaptive metrics (projected counters only).

## Validation

```bash
cd backend && npm test -- --testPathPatterns='dtc-02-adaptive|dtc02-'
```
