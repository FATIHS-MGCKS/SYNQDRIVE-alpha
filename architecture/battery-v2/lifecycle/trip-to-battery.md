# Trip → Battery Lifecycle

**Epistemic status:** CONFIRMED (primary path); bridge fallback UNKNOWN

## Canonical path (authoritative finalized trip)

```
vehicle_trips (COMPLETED, endTime set)
    │
    ├─► TripDetectionOrchestrationService finalization
    │       └─► enqueue BATTERY_LV_REST_SESSION_OPEN (try/catch — no trip rollback)
    │
    ├─► BatteryV2ReconciliationService.reconcileMissingLvRestSessions()
    │       └─► ensureLvRestWindowForFinalizedTrip() first
    │
    └─► LvRestWindowIngestionBridgeService (when finalized trip matches det-state anchor)
            └─► ensureLvRestWindowForFinalizedTrip()
```

## Trip lifecycle isolation

Trip finalization persists **before** battery enqueue. Enqueue failure logs warning only.

**Graph:** `BAT-V2-INV-TRIP-LIFECYCLE-ISO-001`  
**Evidence:** `trip-detection-orchestration.service.ts` (~L2503–2522)

## Session identity (when authoritative trip known)

| Field | Expected |
|-------|----------|
| `startedAt` / anchor | `trip.endTime` |
| `trip_id` | finalized `trip.id` |
| `idempotencyKey` | `lv-rest:{vehicleId}:{trip.endTime ms}` |

**Graph:** `BAT-V2-INV-TRIP-BIND-001` (conditional invariant)

## Bridge-only path

When no authoritative finalized trip is supplied, bridge may resolve trip from anchor (exact `endTime` preferred, ±120s fallback documented in #1445 architecture memo).

**Not fully reconstructed** — `BAT-V2-GAP-BRIDGE-FALLBACK-001`
