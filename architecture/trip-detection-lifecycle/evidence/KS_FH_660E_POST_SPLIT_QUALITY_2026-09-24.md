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

- `resolveFinalizeEndTime()` — event-time max(LMM, latest waypoint) after trip start; CUSUM unchanged.
- `hasPersistedMeaningfulMovementForQuality()` — ≥3 waypoints OR ≥2 waypoints with ≥50 m displacement.
- `checkTripQuality()` — `too_short_no_distance` only when short/low-distance **and** no meaningful persisted movement.
- FINALIZATION_CHECK `resultSummary` quality forensics keys (`QUALITY_*`).

## Regression tests

- `trip-finalize-quality.util.spec.ts` — BASE/HEAD portable repro + control matrix.
- `trip-post-split-finalize-quality.spec.ts` — `processFinalize` integration (production timestamps).
