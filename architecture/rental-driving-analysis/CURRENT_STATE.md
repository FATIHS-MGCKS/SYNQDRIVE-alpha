# Rental Driving Analysis — Current State (bootstrap)

**Code:** `backend/src/modules/rental-driving-analysis/`  
**Persist:** `rental_driving_analyses` (drivingScore, riskLevel, payload, assessmentStatus)  
**Reads:** `TripDrivingImpact` with admissible status filter; `trip.drivingScore` compat only when no TDI and `drivingImpactStatus === PENDING` (P6 F3). READY/SKIPPED/FAILED without TDI: no legacy stress score.

**Production (Consumer Audit V1 @ `51adb234…`):** 2 non-superseded analyses, both PROVISIONAL/INSUFFICIENT, unscored.

**DS4 target:** Booking-window aggregation over DS4-authority impact rows only; publication gating per `assessmentStatus` (PR-6).

**P4-PR2 reconciliation port:** `RentalDrivingAnalysisReconciliationPortAdapter` owns Prisma booking scan/remediate for `BOOKING_WITHOUT_RENTAL_ANALYSIS`; exported via `RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT`.

**P4-PR3 recompute job handler port:** `RentalDrivingAnalysisRecomputeJobHandler` bound to `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT` via `useExisting` (no duplicate handler instance).

**P4-PR4 recompute trigger port:** `RentalDrivingAnalysisRecomputeTriggerService` bound to `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT` via `useExisting`.
