# Rental Driving Analysis — Current State (bootstrap)

**Code:** `backend/src/modules/rental-driving-analysis/`  
**Persist:** `rental_driving_analyses` (drivingScore, riskLevel, payload, assessmentStatus)  
**Reads:** `TripDrivingImpact` without analysisStatus filter; fallback `trip.drivingScore` (Consumer Audit V1 P1-2, P1-3)

**Production (Consumer Audit V1 @ `51adb234…`):** 2 non-superseded analyses, both PROVISIONAL/INSUFFICIENT, unscored.

**DS4 target:** Booking-window aggregation over DS4-authority impact rows only; publication gating per `assessmentStatus` (PR-6).

**P4-PR2 reconciliation port:** `RentalDrivingAnalysisReconciliationPortAdapter` owns Prisma booking scan/remediate for `BOOKING_WITHOUT_RENTAL_ANALYSIS`; exported via `RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT`.
