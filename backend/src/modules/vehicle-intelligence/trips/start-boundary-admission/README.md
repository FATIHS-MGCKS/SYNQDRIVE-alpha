# Trip Start Boundary Admission (P1A — offline)

Pure resolver + shadow comparison for evidence-backed live start boundaries.

**P1B:** Optional runtime shadow at start confirmation (`TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED`, default OFF). Legacy `resolveConfirmedStartBoundary` remains the **canonical writer**; shadow results land under `shadowStartBoundaryAdmission` in FSM evidence summary only.

## Principle

Provider segment existence may establish **candidate trip context**, but **physical start-boundary authority** requires **temporally localized** movement corroboration (core speed/odometer, route position/speed). Segment aggregates (`distanceKm`, max speed, segment odometer delta) support **activity context** only — they do **not** authorize exact `segment.startTime`.

## Provenance

- `integrationModality` — `SOFTWARE_INTEGRATION` / `HARDWARE_DEVICE` / `UNKNOWN` (connection identity)
- `providerSegmentDetectionMechanism` — DIMO detector on segment payload (`changePointDetection`, …)
- `segmentDetectionMechanismIndependentlyProven` — separate flag; never inferred from modality

## Uncertainty

- `departureReviewAnchorAt` — EXP021 departure context only; not stationary guarantee; does not set canonical start

## Regression matrix (15 tests)

| Case | Description |
|------|-------------|
| A / Tesla | Early DIMO segment, sparse SOFTWARE prefix → `PROVIDER_START_UNCORROBORATED` |
| B | Movement at provider time → `PROVIDER_START_ADMITTED` |
| C | Slow reverse (2 km/h) → bounded creep time |
| D | Odometer without GPS speed |
| E | Frequency-only zero speed |
| F | Early movement before delayed candidate |
| G | Hardware aggregates without timed movement → not admitted |
| H1–H2 | Hardware distance / maxSpeed only |
| H3–H4 | Earliest of core vs route (min timestamp, exact source) |
| H5 | Departure anchor does not change canonical |
| H6 | Modality vs detection mechanism separated |

## Shadow

`compareStartBoundaryAdmissionShadow` — `legacyCanonicalStartAt` vs `proposedCanonicalStartAt`.
