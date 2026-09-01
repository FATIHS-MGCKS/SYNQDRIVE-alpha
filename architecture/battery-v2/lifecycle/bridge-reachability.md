# Battery V2 — Bridge Fallback Reachability (Phase 3)

**Gap:** `BAT-V2-GAP-BRIDGE-FALLBACK-001` (refined)  
**Evidence:** `BAT-V2-EVID-CODE-BRIDGE-REACHABILITY-001`  
**Epistemic:** CONFIRMED invocation path; CODE-CONDITIONAL identity divergence

## Who invokes the bridge?

```
DIMO snapshot → BATTERY_OBSERVATION_CLASSIFY
  → BatteryV2SnapshotIngestionService.ingestObservationClassify
  → LvLiveVoltageIngestionService.persistFromObservationClassify
  → LvRestWindowIngestionBridgeService.processObservationCycle
```

**Gate:** `isBatteryV2RestShadowEnabled()` — no-op when REST shadow off.

## Parallel canonical path (not the bridge)

| Entry | Service |
|-------|---------|
| Trip finalization | `LvRestWindowSessionArmingService.ensureLvRestWindowForFinalizedTrip` |
| Reconciliation | Same arming when session missing |
| Bridge with matching trip | Delegates to arming |

## ±120 s trip resolution

`TRIP_END_ANCHOR_TOLERANCE_MS = 120_000` — finds COMPLETED trip near REST anchor.

## Legacy fallback (`tripId: null`)

When no finalized trip in ±120s window:

- Anchor: `detState.lastActivityAt`
- Session identity: `lv-rest:{vehicleId}:{lastActivityAtMs}`
- Emits `TRIP_ENDED` with `tripId: null`

**REACHABLE** in current code.

## Canonical arming identity (differs from bridge fallback)

When finalized trip found (or later arming):

- Anchor: authoritative `trip.endTime`
- Session identity: `lv-rest:{vehicleId}:{trip.endTimeMs}`

## Identity / repair boundary (CODE-CONDITIONAL)

| Question | Answer |
|----------|--------|
| Does idempotency collapse bridge + canonical sessions? | **No** when `trip.endTime ≠ prior lastActivityAt` — different keys |
| Can both sessions exist? | **CODE-CONDITIONAL** — fallback session + later canonical session possible |
| Does repair auto-supersede fallback? | Repair/rebind only when canonical idempotency key matches |
| Production frequency | **UNKNOWN** |

Do **not** claim duplicate sessions occur in production without evidence.

## Non-effects

Phase 3 does not remove or fix bridge fallback behavior.
