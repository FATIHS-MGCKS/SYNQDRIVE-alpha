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

## Validation

- Unit: `di-v0-trip-speed-quality-product-read.mapper.unit.spec.ts`, `di-v0-trip-speed-quality-product-read.service.unit.spec.ts`
- Frontend: `trip-gps-speed-evaluation-ui.test.ts`, `TripGpsSpeedEvaluationPanel.test.tsx`
