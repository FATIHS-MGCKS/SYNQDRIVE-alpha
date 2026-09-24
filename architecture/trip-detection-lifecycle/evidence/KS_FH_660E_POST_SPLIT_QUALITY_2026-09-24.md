# KS FH 660E — post-split Trip 2 false `too_short_no_distance` (2026-09-24)

| Field | Value |
|-------|-------|
| Vehicle | KS FH 660E |
| vehicleId | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| Trip 2 | `a1788836-df34-48af-9945-6b1fe75ff288` |
| Physical drive | ~2 min post `MID_TRIP_GAP_SPLIT` |
| Waypoints | 15 persisted |
| distanceKm | null |
| Production discard | `too_short_no_distance` |

## Root cause (CONFIRMED)

1. **Finalize end-time chain** on main preferred `lastMeaningfulMovementAt` over later persisted route waypoints when CUSUM end absent → quality duration ~51764 ms (<60s).
2. **`checkTripQuality`** discarded any trip with duration <60s and null/<0.1 km distance **without** considering persisted route movement evidence (15 waypoints).

## Fix (implementation branch — not deployed)

- **`analyzePersistedRouteMovement`** — reuses `findEarliestRouteActivityAt` semantics (`speedMotionKmh`, `TRIP_ROUTE_MOVEMENT_MIN_METERS` 25 m). **Quality/end authority uses cumulative credible path** ≥ `odometerMinDeltaKm` (50 m); raw GPS path is observability-only. Coordinate-only motion requires sustained progression; isolated post-stop out-and-back spikes are excluded.
- **`resolveFinalizeEndTime`** — CUSUM first, else max(LMM, **latest credible route movement**), never latest stationary waypoint.
- **`checkTripQuality`** — `too_short_no_distance` defeated by credible persisted route movement independent of canonical duration.
- FINALIZATION_CHECK `QUALITY_*` + `FINALIZE_END_*` forensics (non-authoritative).

**Authority order:** `FINALIZE_END_AUTHORITY_ORDER` in `trip-finalize-quality.util.ts`

## Regression tests

- `trip-finalize-quality.util.spec.ts` — BASE/PR1750/FINAL proof + control matrix.
- `trip-post-split-finalize-quality.spec.ts` — `processFinalize` integration (production timestamps).
