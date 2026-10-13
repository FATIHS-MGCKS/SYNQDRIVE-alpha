# EXP021 P2 — Trip speed quality projection V1

**Status:** IMPLEMENTED (draft PR)  
**Policy binding:** `DI_V0_SPEED_QC_POLICY_V1`  
**Projection:** `DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1`  
**Persistence:** `di_v0_trip_speed_quality_projections_v1`  
**Runtime:** OFF — `DiV0TripSpeedQualityModule` not registered on AppModule; no S4 T06 hook.

## Scope

Internal ops read model aggregating per-interval QC over COMPLETED PRIMARY work items with verified pinned S4 evidence snapshots. S1/S2/S4C execution paths unchanged.

## Validation

- `npm run test:di:trip-speed-quality`
- `npm run test:di:trip-speed-quality:postgres:ci` (PG1–PG14, `DI_V0_S4A_POSTGRES_REQUIRED=1`)
- Dormant audit: no import from AppModule / VehicleIntelligenceModule / S4C executor

## Pre-merge hardening (P2)

- Motion counters use canonical `MotionState` (`TRANSITION_UNCERTAIN`, not `UNCERTAIN`); unknown states throw.
- Coverage split: numeric, trusted numeric, trusted limited (+ stationary/numeric split), non-untrusted; `trustedCoveragePercent` aliases trusted numeric only.
- Assessability: `DI_V0_TRIP_SPEED_QUALITY_ASSESSABILITY_CRITERIA_V1` (provisional); `FULL` requires trusted **numeric** coverage ≥70%, not TRUSTED_LIMITED padding.
- Persist: per-scope `pg_advisory_xact_lock`, idempotency fingerprint mismatch fail-closed, transactional S4 authority gate before CURRENT write.
- Ops read: `readCurrentOpsProjection` returns null when CURRENT work item is not the active non-`SUPERSEDED` PRIMARY or not `COMPLETED`.
- Calibration: position re-classification uses shadow run `calibration_version` via `resolveDiV0TripSpeedQualityCalibrationBundle` (fail-closed).
