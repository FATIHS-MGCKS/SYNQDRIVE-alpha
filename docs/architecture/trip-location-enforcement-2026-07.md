# Trip & Location History Enforcement (Prompt 18)

Authorization Decision Engine bound to trip lifecycle, waypoints, route rendering, and location history reads/exports.

## Actions

| Action | Use case | Service method |
|--------|----------|----------------|
| `INGEST` | Trip create/finalize, waypoint persist | `mayIngest()` |
| `DERIVE` | Route fetch, enrich, reconcile, backfill | `mayDerive()` |
| `READ` | Trip list/detail/route/timeline/behavior/energy | `isReadAllowed()` / `assertRead()` |
| `EXPORT` | Future bulk route/GPX export | `assertExport()` |

Trip processing is **not** allowed solely because raw telemetry exists — each path runs an explicit decision with matching `dataCategory` + `purpose`.

## Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `DATA_AUTH_TRIP_LOCATION_SHADOW_MODE` | `true` | DENY on INGEST/DERIVE logged; persist may continue |
| `DATA_AUTH_TRIP_LOCATION_FAIL_CLOSED` | `false` | Blocks new trip/waypoint writes and derive when enabled |

## Protected processes (initial coverage)

| Process | Action | Gate location |
|---------|--------|---------------|
| Trip create (live tracking) | INGEST | `TripDetectionOrchestrationService` before `createTrip` |
| Waypoint persist (tracking) | INGEST | Orchestration active tick + `TripsService.persistWaypointsIfAllowed` |
| Trip list | READ | `TripsService.findByVehicle` → `applyTripSummaryGate` |
| Trip detail / route | READ | Existing `LiveGpsEnforcement` + derive gate on route fetch |
| Trip enrich | DERIVE | `TripsService.enrichTrip` |
| Trip reconciliation | DERIVE | `TripReconciliationService.reconcileWindow` (with `effectiveTimestamp`) |
| Energy events API | READ | `VehicleIntelligenceController.getEnergyEvents` |
| Behavior events API | READ | `getTripBehaviorEvents` (driving event coords redacted) |
| Customer driver filter | Scope | `assertCustomerScope` on `driverCustomerId` |
| Booking scope | Scope | `assertBookingScope` when `bookingId` present |

## Data lifecycle & retention

- **Revocation / suspension:** blocks new INGEST/DERIVE (fail-closed) or logs shadow DENY; no new derived trips after policy revoke.
- **Historical rows:** existing trips remain queryable; READ gate redacts coordinates when policy denies (no silent leak).
- **Retention:** governed by existing `DataAuthorizationAuditRetentionClass` on decision events — this prompt does not delete historical trip rows on revoke.

## Remaining gaps

- `finalizeTrip` end-coordinate ingest gate in orchestration finalize path
- ClickHouse waypoint/HF mirrors (`WaypointMirrorService`, `HfMirrorService`)
- Trip assignment writes (metadata only — lower risk)
- Dedicated heatmap API (route coloring uses protected route endpoint)
- EXPORT HTTP endpoint (service ready via `assertExport`)
- Prometheus counters for trip-location metrics

## Tests

```bash
cd backend && npm test -- --testPathPattern="trip-location-enforcement|data-authorizations"
```

Covers: trip create ALLOW/DENY, waypoint ingest, historical read, export action, wrong customer/booking/vehicle, reprocessing timestamp, heatmap read metric, trip list redaction, resolver error without legacy fallback.
