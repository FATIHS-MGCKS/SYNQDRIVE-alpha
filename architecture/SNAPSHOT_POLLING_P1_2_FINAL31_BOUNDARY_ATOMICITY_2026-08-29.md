# P1.2 FINAL-3.1 — Boundary Repair Atomicity + Downstream Consistency Safety Gate

**Date:** 2026-08-29  
**PR:** #1409  
**Builds on:** FINAL-3 canonical partial-trip boundary repair  
**Verdict:** **DO NOT MERGE** — awaiting human review and **P1.2 FINAL-4 scale closeout**

---

## A. Atomicity model (before → after)

### Before (FINAL-3 bug)

1. `TripRepair` PROPOSED  
2. `TripDecisionEngine.repairTripBoundaries()` — **VehicleTrip already persisted**  
3. `TripRepair` APPLIED  
4. `enqueueBoundaryRepairRefresh()`  
5. On step 3/4 failure → catch marked repair **REJECTED**

**Failure mode:** boundary committed, audit says REJECTED, downstream refresh never retried; next reconciliation tick classifies **EXACT_MATCH** and suppresses forever.

### After (FINAL-3.1)

```
BOUNDARY MUTATION (single PG transaction)
  VehicleTrip boundaries + rawDetectionMeta.boundaryRefresh=PENDING
  TripRepair status=BOUNDARY_APPLIED
        ↓
finalizeBoundaryRepairRefresh() (outside transaction)
  enqueue refresh → boundaryRefresh=ENQUEUED, TripRepair=APPLIED
  on failure → boundaryRefresh=PENDING (never REJECTED after successful mutation)
        ↓
reconciliation retryPendingBoundaryRefreshes() + EXACT_MATCH pending-refresh guard
```

| State | Meaning |
|-------|---------|
| `TripRepair.BOUNDARY_APPLIED` | Boundary mutation committed; refresh may be pending |
| `TripRepair.APPLIED` | Refresh successfully enqueued |
| `TripRepair.REJECTED` | Boundary mutation **never** committed |
| `rawDetectionMeta.boundaryRefresh` | `PENDING` / `ENQUEUED` / `COMPLETED` durable retry ledger |

---

## B. Transaction boundary

`TripDecisionEngine.repairTripBoundariesWithAudit()` runs in **one** `prisma.$transaction`:

- Optimistic lock: `vehicleTrip.updateMany` on `id + startTime + endTime`  
- On `count !== 1` → `BoundaryRepairConcurrentMutationError` (safe retry)  
- Upserts `TripRepair` with `BOUNDARY_APPLIED`  
- Sets `boundaryRefresh.state = PENDING` on the trip row  

Queue publication remains **outside** the transaction; recovery is via durable `boundaryRefresh` + `retryPendingBoundaryRefreshes()`.

`TripDecisionEngine` remains the sole `VehicleTrip` lifecycle writer.

---

## C. Downstream refresh (production trace)

| Layer | Action on boundary refresh |
|-------|---------------------------|
| `VehicleTripWaypoint` | `TripsService.enrichTrip` → `storeWaypoints` **deleteMany + createMany** |
| `TripBehaviorEvent` | `trip-behavior-enrichment.service` **deleteMany({ tripId }) + insert** |
| `DrivingEvent` | Re-ingested via route/safety + behavior enrichment chain |
| Behavior summary counters | Recomputed from replaced events |
| Fuel/energy summaries | Post-finalize pipeline (`REPAIR_FINALIZE`) |
| Temperature/performance | Route enrichment window |
| `TripDrivingImpact` | `DrivingImpactService.computeForTrip` **upsert** per tripId |
| `VehicleDrivingImpactCurrent` | Rolling recompute after trip impact |
| Driver Score inputs | One impact row per tripId after recompute |
| Post-finalize analysis | `postFinalizeAnalysisProducer` when wired |
| Event-trip associations | Preserved (same tripId FK) |

`refreshEnrichmentAfterBoundaryRepair()` resets statuses to `PENDING`, runs route enrichment, then `enqueueBehaviorEnrichment({ force: true })`.

---

## D–F. Route, behavior, driving impact

- **Waypoints:** suffix-only geometry cannot remain sole truth — full-window replace on route enrich.  
- **Behavior events:** replace-by-trip; repeated refresh idempotent (no duplicate accumulation).  
- **Driving impact:** status reset to `PENDING`; upsert replaces prior window impact for same tripId.

---

## G. EXACT_MATCH + pending refresh

At reconciliation step 2, `retryPendingBoundaryRefreshes(vehicleId)` scans completed trips with `boundaryRefresh` pending/enqueued and re-enqueues.

During partial-boundary handling, **EXACT_MATCH** with pending refresh re-enqueues instead of suppressing.

---

## H. Organization ID safety

`resolveOrganizationIdForVehicle()` throws before boundary mutation if `organizationId` cannot be resolved. **No silent skip** of refresh after boundary apply.

---

## I. Concurrent reconciliation

Minimum DB guard: optimistic `updateMany` on trip boundaries. Concurrent identical repairs → one applies, other gets `BoundaryRepairConcurrentMutationError` and safe re-read on next tick.

Per-vehicle Redis mutex deferred to P1.4.

---

## J. Same-physical-drive evidence

`assessSamePhysicalDriveEvidence()` in classifier adds conservative **AMBIGUOUS** guards:

- Suffix partial without end alignment  
- Prefix partial without start alignment  
- Interior short trip inside long provider without end alignment  
- Coordinate contradiction (when coords available)  
- Trip distance > 125% of provider distance  

---

## K. Config determinism

`deriveDefaultTripStartBoundaryMaxLookbackMs(env)` uses the **supplied** `env` object for confirmation wait (not `process.env` mixed in).

---

## L. Audit history hardening

`normalizeBoundaryRepairHistory()` / `appendBoundaryRepairHistory()` — safe array normalization, cap at 20 entries.

---

## M. Test matrix (FINAL-3.1)

| # | Case | Suite |
|---|------|-------|
| 1 | Atomic boundary + audit | `partial-boundary-repair.final31.spec.ts` |
| 2 | Refresh fail → BOUNDARY_APPLIED + retry | final31 |
| 3 | Restart → pending refresh retried | final31 |
| 4 | EXACT_MATCH + pending → retry | final31 |
| 5 | organizationId null → refuse | final31 |
| 6 | Waypoint replace | final31 |
| 7 | Behavior event replace | final31 |
| 8 | No duplicate behavior on repeat | final31 |
| 9 | DrivingEvent via enrichment chain | documented + behavior replace |
| 10 | DrivingImpact status reset | final31 |
| 11 | Driver score single-count | final31 + `driver-score.service.spec.ts` |
| 12 | Concurrent identical repairs | final31 |
| 13 | Concurrent reconciliation | final31 |
| 14 | Malformed history | `boundary-repair.state.util.spec.ts` + final31 |
| 15 | Config env consistency | `worker.boundary-lookback.spec.ts` |
| 16 | Interior trip → AMBIGUOUS | final31 + classifier spec |

**FINAL-3 + FINAL-3.1 combined:** 56 tests in 8 suites (this slice).

---

## N. Rollback

No schema migration. Roll back via `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false`.

Existing trips with `boundaryRefresh=PENDING` will be retried on next reconciliation until refresh succeeds.

---

## O. Remaining limitations

- `boundaryRefresh=COMPLETED` not yet set on enrichment completion (PENDING/ENQUEUED sufficient for retry)  
- No per-vehicle Redis reconciliation mutex (P1.4)  
- FINAL-4 scale work not started  
