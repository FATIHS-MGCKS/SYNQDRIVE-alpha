# EXP021 — V2 trip speed evaluation product read path

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED (default OFF) |
| QC policy | `DI_V0_SPEED_QC_POLICY_V2` only |
| API | `GET /api/v1/vehicles/:vehicleId/trips/:tripId/gps-speed-evaluation-v2` |
| Backend gate | `DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENABLED` |
| UI gate | `VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED` |
| P2 auto-write gate | `DI_V0_P2_AUTO_PROJECTION_V2_*` (unchanged, independent) |

## Behavior

- Read-only: uses `DiV0TripSpeedQualityProjectionService.readCurrentOpsProjection(org, trip, V2)`; no compute, queue, provider, or DB writes.
- Stale CURRENT rows (non-active PRIMARY work item) are not returned (`null` → product `UNAVAILABLE` / `PENDING` via outbox).
- V1 rows are never mapped to the V2 product contract.
- Slim DTO: `DiV0TripGpsSpeedEvaluationProductV1` — no snapshot hashes, claim tokens, or raw worker errors.

## UI

- `TripGpsSpeedEvaluationPanel` in `TripTimelineExpanded` (rental trip detail).
- Null speed metrics render as “not available”, not `0`.
- Stationary interval count is shown separately from numeric coverage percentages.

## Validation (executed in CI / local)

- Backend unit: `di-v0-trip-speed-quality-product-read.{mapper,service,availability}.unit.spec.ts`
- Backend HTTP: `trip-gps-speed-evaluation-v2.http-security.integration.spec.ts` (guards, feature OFF, tenant isolation, GET side-effect spies on projection read vs write / P2 `runPass`)
- Frontend: `trip-gps-speed-evaluation-{ui,feature}.test.ts`, `TripGpsSpeedEvaluationPanel.test.tsx` (happy-dom rendered states)

## UI stationary semantics

- Panel primary count: `coverage.trustedLimitedStationaryIntervalCount` (V2 accepted).
- Optional separate row: `motion.stationarySupportedIntervalCount` (S1 motion candidates) when it differs.
- Numeric coverage percentages are unchanged by stationary acceptance counts.

## i18n

- Product keys live in `rental.tripGpsSpeedEvaluation.{en,de,pl,fr,cs,nl,es,it}.ts` only.
- Turkish (`tr`) remains **fallback-only** per registry — no owned `tripGpsSpeedEvaluation.*` keys.
