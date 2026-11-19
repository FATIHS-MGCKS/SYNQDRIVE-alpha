# Communication Center — Current State (partial)

## Boundary remediation PR1 (2026-11-19)

| Before | After |
|--------|-------|
| `CommunicationQuickActionExecutorService` injected `BookingsService` | Injects `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` |
| Core → Rental business service (forbidden) | Core → neutral port; Rental `CommunicationBookingSnapshotReadAdapter` → `BookingsService.findDetail` |

**Contract fields:** `bookingNumber`, `depositStatus`, `paymentStatus` (nullable finance fields preserved).

**Module wiring:** `CommunicationModule` imports `CommunicationBookingSnapshotReadModule` instead of `BookingsModule`.

**Behavior:** Unchanged observable quick-action text for missing-documents and payment-deposit reminders; `NotFoundException` when snapshot is null.