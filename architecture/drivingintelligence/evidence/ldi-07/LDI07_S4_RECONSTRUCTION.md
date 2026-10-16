# LDI07 — Historical S4 reconstruction feasibility

**Vehicle:** `8c850ff1-4201-432b-af2e-2711dbc7ca48`
**Primary trip:** `a682d3df-545a-4a8a-aa14-d45c23fae985`
**Window:** 2026-07-21T13:47:54.000Z → 2026-07-21T14:46:31.000Z

## Raw GPS

- Waypoints: **499** (499 valid coords, 499 unique 1 Hz buckets)
- Position updates in window: **0**
- Cadence: inter_waypoint_7.00s_median_7.00s_p95_unique_buckets_499
- Gaps: gaps_gte_3s=498_max_gap_s=21.0

## Missing S4 pin

- Work items: **none**
- Boundary admission meta: **absent**
- Assessment: NO_S4_WORK_ITEM_ROW; MISSING_diV0BoundaryAdmissionV1; LIKELY_PRE_S4_DISCOVERY_CONTAINMENT_OR_BACKLOG

## Offline L3/QC (no writes)

- Feasible: **CONDITIONAL_YES_waypoint_grid_plus_computeDiV0TripIntervals_NOT_identical_to_provider_S4_pin**
- Expected trusted coverage: **full_grid_0.0pct_trusted_present_buckets_0.0pct_trusted_499_of_3517_seconds_with_waypoint** (3517 intervals)

## Native events (6)

- `HARSH_ACCELERATION` @ 2026-07-21T13:59:15.000Z bucket=2026-07-21T13:59:15Z waypoint=false Δwp=2000ms L3=null eventSpd=99
- `HARSH_ACCELERATION` @ 2026-07-21T14:03:44.000Z bucket=2026-07-21T14:03:44Z waypoint=false Δwp=2000ms L3=null eventSpd=83.66666666666667
- `HARSH_CORNERING` @ 2026-07-21T14:06:56.000Z bucket=2026-07-21T14:06:56Z waypoint=false Δwp=1000ms L3=null eventSpd=104.3333333333333
- `HARSH_ACCELERATION` @ 2026-07-21T14:09:21.000Z bucket=2026-07-21T14:09:21Z waypoint=false Δwp=1000ms L3=null eventSpd=91
- `EXTREME_BRAKING` @ 2026-07-21T14:10:19.000Z bucket=2026-07-21T14:10:19Z waypoint=false Δwp=1000ms L3=null eventSpd=92.66666666666667
- `HARSH_ACCELERATION` @ 2026-07-21T14:10:47.000Z bucket=2026-07-21T14:10:47Z waypoint=false Δwp=1000ms L3=null eventSpd=93

## Fusion alternate (secondary)

- `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9` — pinned shadow 362 intervals

## Independent validation

- **LIMITED_gaps_or_missing_waypoints_at_event_buckets**