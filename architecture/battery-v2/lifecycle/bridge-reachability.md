# Battery V2 — Bridge Fallback Reachability (Phase 3)

**Gap:** `BAT-V2-GAP-BRIDGE-FALLBACK-001` (refined)  
**Epistemic:** CONFIRMED invocation path; INFERRED anchor authority semantics

## Who invokes the bridge?

```
DIMO snapshot → BATTERY_OBSERVATION_CLASSIFY
  → BatteryV2SnapshotIngestionService.ingestObservationClassify
  → LvLiveVoltageIngestionService.persistFromObservationClassify
  → LvRestWindowIngestionBridgeService.processObservationCycle
```

**Gate:** `isBatteryV2RestShadowEnabled()` — no-op when REST shadow off.

**Failure isolation:** Bridge errors logged; classify pipeline continues.

## Parallel canonical path (not the bridge)

| Entry | Service |
|-------|---------|
| Trip finalization | `LvRestWindowSessionArmingService.ensureLvRestWindowForFinalizedTrip` |
| Reconciliation | Same arming when session missing |
| Bridge with matching trip | Delegates to arming (`lv-rest-window-ingestion-bridge.service.ts`) |

## ±120 s trip resolution

`TRIP_END_ANCHOR_TOLERANCE_MS = 120_000` — finds COMPLETED trip near REST anchor; tie-break closest `endTime`.

## Legacy fallback (`tripId: null`)

When no finalized trip in ±120s window, bridge emits `TRIP_ENDED` with `tripId: null` directly to FSM.

**REACHABLE** in current code. Sessions can exist without authoritative trip binding.

## Duplicate prevention

| Layer | Mechanism |
|-------|-----------|
| FSM | `duplicate_trip_end_event` for same `windowId` |
| Session | `lv-rest:{vehicleId}:{anchorMs}` idempotent create |
| REST targets | `isLvRestTargetAlreadyScheduled` |
| Bridge vs arming | Finalized trip found → arming only, no parallel `TRIP_ENDED` |

## Reachability today

| Question | Answer |
|----------|--------|
| Can bridge run in production? | **Yes** when REST shadow enabled |
| Can `tripId: null` sessions be created? | **Yes** (legacy fallback path) |
| Can reconciliation repair later? | Partial — arming on finalized trip; binding repair limited |
| Is fallback necessary today? | **UNKNOWN** product intent; code path **REACHABLE** |
| Duplicate session from bridge + trip finalize? | Mitigated by FSM + idempotent session keys |

## Non-effects

Phase 3 does not remove or fix bridge fallback behavior.
