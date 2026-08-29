# P1.2 FINAL-3 — Canonical Partial-Trip Boundary Repair

**Date:** 2026-08-29  
**PR:** #1409  
**Prior gates:** FINAL-1 (trip loss), FINAL-2 (partial suffix / delayed start)  
**Verdict:** **DO NOT MERGE** — awaiting human review and **P1.2 FINAL-4 scale closeout**

---

## A. VehicleTrip dependency trace (pre-mutation)

| Data | Keyed by tripId? | Time-window derived? | Recompute after boundary extension? | Idempotent? |
|------|------------------|----------------------|-------------------------------------|-------------|
| `VehicleTrip` boundaries | yes (row) | yes | **yes — in-place extension** | yes (same boundaries → no-op) |
| `VehicleTripWaypoint` | yes | yes (recordedAt) | route refresh via `TripsService.enrichTrip` | replace per trip |
| `TripBehaviorEvent` | yes | yes | `deleteMany({ tripId })` then re-insert | **replace-by-trip** |
| `DrivingEvent` (speeding) | yes (nullable) | yes | route/safety enrichment | scoped to trip |
| `TripDrivingImpact` | yes (unique per trip) | yes | `upsert` in `DrivingImpactService.computeForTrip` | **upsert-by-trip** |
| `VehicleDrivingImpactCurrent` | vehicle-level | rolling window | recomputed from trip impacts | upsert |
| Driver/customer/rental assignment | on `VehicleTrip` row | no | **preserved** (same tripId) | n/a |
| Event-trip association | `tripId` FK | time overlap | unchanged FK (same tripId) | n/a |
| Energy/fuel summaries | on trip row | window | reset + post-finalize pipeline | replace |
| Driver Score inputs | via trip impacts | per trip | one impact row per tripId after recompute | upsert |

**Conclusion:** Boundary extension MUST preserve `tripId`. Enrichment refresh uses `force=true` behavior enqueue; behavior events are replace-by-trip; driving impact is upsert-by-trip.

---

## B. New repair type

`REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION`

## C. TripDecisionEngine API

```typescript
repairTripBoundaries(params: RepairTripBoundariesParams): Promise<{ trip: VehicleTrip; applied: boolean }>
```

Auditable payload in `rawDetectionMeta.boundaryRepair` + `boundaryRepairHistory[]`.

## D. Classification (before generic missing-trip path)

`classifyPartialBoundaryRepair()` in `partial-boundary-classification.util.ts`:

1. **EXACT_MATCH** → audit SUPPRESSED, no mutation  
2. **PARTIAL_EXTENSION** (single contained trip) → `repairTripBoundaries`  
3. **MISSING_TRIP** → fall through to existing missing-trip repair  
4. **AMBIGUOUS** (multi-fragment, energy segment, ongoing provider, extension conflict) → audit only, no destructive mutation  

## E. Downstream recompute

`TripEnrichmentOrchestratorService.refreshEnrichmentAfterBoundaryRepair()`:

- Resets enrichment statuses on the same tripId  
- `enqueueBehaviorEnrichment({ force: true })` — replaces behavior events for full corrected window  
- Driving impact re-enqueued after behavior completes (existing chain)  
- Post-finalize analysis via `REPAIR_FINALIZE` source  

## F. Live start boundary (G/H)

- `start-boundary-window.util.ts` is now the **canonical** implementation  
- `TripDetectionOrchestrationService` calls `computeStartBoundaryWindowFrom`, `computePossibleStartCoreFetchFrom`, `selectConfirmedStartSegment` from util  
- `WORKER_TRIP_START_BOUNDARY_MAX_LOOKBACK_MS` default = max(poll tier) + confirmation + 2min buffer (~35min)  

### DIMO ongoing-segment findings (MCP unavailable; code + FINAL-2 evidence)

| Question | Finding |
|----------|---------|
| Ongoing segments before stop? | `DimoTripSegment.isOngoing` exists; reconciliation uses completed segments only |
| `start.timestamp` on ongoing? | yes when segment returned |
| `startedBeforeRange` meaning | segment physical start precedes query `from` |
| Query `from` before physical start | `startedBeforeRange` becomes false when window includes true start |
| Driving mechanisms | `changePointDetection`, `frequencyAnalysis`, `ignitionDetection`, `idling` |

Live path still cannot always recover when `startedBeforeRange=true`; **canonical boundary repair after provider completion** is the authoritative fix.

## G. Rollback flags

| Flag | Effect |
|------|--------|
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false` | Disables boundary extension only; other reconciliation continues |
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` | Unchanged — legacy snapshot cadence |
| `TRIP_REPAIR_COVERAGE_MODE` | Unchanged globally (not set to enforce in this slice) |

## H. P1.2 FINAL-4 SCALE CLOSEOUT REQUIRED BEFORE FINAL MERGE

Not addressed in FINAL-3:

- Fast reconciliation cohort semantics too broad  
- Snapshot worker concurrency vs N=1000 load  
- Provider HTTP fan-out measurement  

---

## Test matrix (I1–I15)

| Case | Status |
|------|--------|
| I1 suffix partial → ONE trip | PASS |
| I2 prefix partial → ONE trip | PASS |
| I3 idempotent ×10 | PASS |
| I4 exact → no mutation | PASS |
| I5 multi-fragment → ambiguous | PASS |
| I6 extension conflict → ambiguous | PASS |
| I7 RESTING delayed → canonical repair path | covered by reconciliation |
| I8 LONG_IDLE delayed → canonical repair | covered by reconciliation |
| I9–I13 enrichment/impact | semantics documented + force refresh |
| I14 assignment survives | PASS |
| I15 event associations | preserved via same tripId |

**FINAL-3 test count (this slice):** 32 tests in 4 suites (partial-boundary + final3 + updated FINAL-2 gates).
