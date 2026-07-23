# Booking domain event outbox consumers (V4.9.795)

Reliable, idempotent outbox consumers for booking follow-up processes (Prompt 23).

## Consumer inventory

| Consumer ID | Responsibility |
|-------------|----------------|
| `booking.invoice` | Bootstrap booking invoice on `BookingCreated` |
| `booking.document-bundle` | Enqueue initial bundle / pickup / return document generation jobs |
| `booking.rental-agreement` | Ensure draft rental contract + bundle record |
| `booking.pickup-return-tasks` | Task automation + vehicle cleaning lifecycle |
| `booking.notifications` | Workflow events + in-app notification ingest |
| `booking.customer-email` | Auto-send frozen booking documents on confirm |
| `booking.internal-email` | Internal ops email to org reply-to on create/confirm |
| `booking.payment-link` | Payment-link email enqueue when checkout is ready |

## Idempotency

- Per-consumer receipts in `booking_domain_event_consumer_receipts`
- Unique `businessKey` per consumer (`consumerId:org:booking:…`)
- Duplicate business keys across events dedupe safely
- Terminal receipt statuses: `SUCCEEDED`, `SKIPPED`, `STALE`, `FAILED`

## Error handling

- **Retryable** (`RETRYABLE_EXTERNAL`, `RETRYABLE_DEPENDENCY`, timeouts): outbox row retries with backoff
- **Non-retryable** (`TENANT_MISMATCH`, `NON_RETRYABLE`): consumer receipt `FAILED`, other consumers continue
- **Stale aggregate version**: receipt `STALE`, consumer skipped

## Email metadata (requirement 12)

Customer/internal email consumers persist receipt metadata:

- `bookingId`
- recipient scope / email
- `templateVersion`
- `documentReferences`
- `idempotencyKey`
- `outboundEmailId` when sent

## Migration from best-effort

Removed direct `void` follow-up calls from:

- `BookingsService.create/update/cancel/markNoShow`
- `BookingsHandoverService.createHandover`

Invoice bootstrap is now async via `booking.invoice` consumer (no booking rollback on invoice failure).

## Tests

- `booking-domain-event-outbox.spec.ts` — repository, processor, router, failure injection
