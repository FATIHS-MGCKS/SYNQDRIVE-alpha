# P4-PR4 — Rental recompute trigger port (five VI consumers)

**Date:** 2026-11-17 (Europe/Berlin)  
**Base `origin/main`:** `f3368419f2db2c86ac157831d418aaf484587653` (P4-PR3 merged #2425)

## Change

| Area | Before | After |
|------|--------|--------|
| VI consumers (5) | `forwardRef` → `RentalDrivingAnalysisRecomputeTriggerService` | `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT` |
| Rental module | Handler/trigger class export | `useExisting` on trigger service (one instance) |

## Consumers

1. `TripPostFinalizeAnalysisProducer` — fire-and-forget `enqueueForTrip` (TRIP_COMPLETED)
2. `DrivingAnalysisStageOrchestratorService` — fire-and-forget `enqueueForTrip` (TRIP_ANALYSIS_COMPLETED)
3. `TripAssignmentService` — fire-and-forget `enqueueForBooking` (BOOKING_ASSIGNMENT_CORRECTED)
4. `DriverAttributionService` — awaited `enqueueForBooking` (ATTRIBUTION_CHANGED)
5. `DrivingMisuseReconcileJobHandler` — awaited `enqueueForBooking` (MISUSE_RECONCILED)

## Parity

- Reason constants, correlation IDs, idempotency keys (in trigger), await vs void semantics unchanged
- `bookings.service` still injects concrete trigger (out of P4-PR4 VI scope)

## Remaining dependencies

- VI ↔ Rental `forwardRef` module graph
- P4-PR1 booking port, P4-PR2 reconciliation port, P4-PR3 job handler port
- Bookings module direct trigger injection

**Production validation:** **NOT_CLAIMED**