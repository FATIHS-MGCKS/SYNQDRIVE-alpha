# P4-PR2 — Driving analysis reconciliation rental booking decouple

**Date:** 2026-11-17 (Europe/Berlin)  
**Base `origin/main`:** `0ef353f5f9434c3b44e3b5ca001190b46ff0455d` (P4-PR1 merged #2423)  
**Reference (architecture only):** [SYNQDRIVE-CORE PR #10](https://github.com/FATIHS-MGCKS/SYNQDRIVE-CORE/pull/10)

## Change

| Area | Before | After |
|------|--------|--------|
| `DrivingAnalysisReconciliationService` booking scan | `prisma.booking.findMany` | `RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT.scanBookingsWithoutRentalAnalysis` |
| Booking remediation case | Inline booking/trip/run/enqueue | `remediateBookingWithoutRentalAnalysis` on port |
| `recordReconciliation` / idempotency | Core service | Unchanged in Core service |

## Parity

- `organizationId` tenant scope on scan and remediate revalidation
- `BookingStatus.COMPLETED`, `endDate >= lookbackFrom`, `rentalDrivingAnalyses none { supersededAt: null }`
- `take` / limit from `MAX_FINDINGS_PER_CHECK`
- Finding `BOOKING_WITHOUT_RENTAL_ANALYSIS`, `entityType: booking`, `detail: vehicle=${vehicleId ?? 'none'}`
- Finding merge position after misuse check, before health jobs
- Remediation: `REPAIR_FINALIZE`, `RENTAL_DRIVING_ANALYSIS_RECOMPUTE`, correlation `reconcile-booking:*`

## Remaining Core/Rental dependencies (explicit)

- `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` circular `forwardRef` for port export/injection
- `DrivingIntelligenceBookingResolutionModule` import on VI (P4-PR1)
- Trip attribution and other paths may still read `booking` directly (out of P4-PR2)
- Adapter uses Rental Prisma + VI init/dispatcher services

**Production validation:** **NOT_CLAIMED**