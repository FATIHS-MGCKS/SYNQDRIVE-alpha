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

## M3.3 generalized rest chain vs trip end (B1.2W)

**Trip `endTime` is not ENGINE_OFF evidence.** M3.3A opens **`BatteryRestSession`** only on **`ENGINE_OFF_TRANSITION`** from trustworthy provider observations — not on trip finalization alone.

Provider measurement freeze after near-park running states must become explicit **`PROVIDER_OBSERVABILITY_GAP`** (future implementation) rather than a silent processing stall. Normative spec: [`research/M3_3_B1_2W_PROVIDER_GAP_STATE_MACHINE_2026-09-21.md`](../research/M3_3_B1_2W_PROVIDER_GAP_STATE_MACHINE_2026-09-21.md).

Legacy LV REST window path above may still anchor on `trip.endTime` for **REST_60M/REST_6H opportunistic targets** — distinct from M3.3A physical-shutdown rest sessions.
