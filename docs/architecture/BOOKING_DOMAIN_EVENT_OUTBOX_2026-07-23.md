# Booking domain event outbox (V4.9.794)

Transactional outbox for durable booking lifecycle events.

## Infrastructure reused

- **PostgreSQL outbox table** — `booking_domain_event_outbox` (same transaction as booking mutations)
- **BullMQ queue** — `booking.domain.events` (same pattern as `task.automation`, `notification.delivery`)
- **Cron scheduler** — polls pending rows every 30s, recovers stale `PROCESSING` locks

## Event envelope

Each outbox row contains:

| Field | Description |
|-------|-------------|
| `id` | `eventId` |
| `eventType` | e.g. `BookingCreated`, `PickupCompleted` |
| `aggregateId` | `bookingId` |
| `organizationId` | tenant scope |
| `aggregateVersion` | monotonic per booking |
| `occurredAt` | event timestamp |
| `payload` | minimized JSON (no signatures/PII) |
| `correlationId` | `booking:{bookingId}` by default |
| `causationId` | parent action / actor reference |
| `idempotencyKey` | unique dedup key |

## Supported event types

- `BookingCreated`, `BookingUpdated`, `BookingConfirmed`
- `BookingCancelled`, `BookingMarkedNoShow`
- `BookingActivated`, `BookingCompleted`
- `BookingPricingChanged`, `BookingCustomerChanged`, `BookingVehicleChanged`
- `BookingLegalAccepted` (hook ready via lifecycle service)
- `PickupCompleted`, `ReturnCompleted`

## Consumer idempotency

`booking_domain_event_consumer_receipts` stores per-consumer processing receipts. Primary consumer `booking.primary` forwards mapped events to `WorkflowEventService`.

## Operations

- **Retry** — exponential backoff, max 5 attempts
- **Dead letter** — `DEAD_LETTER` status after max retries
- **Retention** — published rows purged after 90 days (configurable)
- **Metrics** — `synqdrive_booking_domain_event_outbox_*` Prometheus counters/gauges

## Wiring

`BookingDomainEventLifecycleService` is called inside existing Prisma transactions in:

- `BookingsService.create`, `update`, `cancel`, `markNoShow`
- `BookingsHandoverService.createHandover` (pickup/return)

Direct `WorkflowEventService.scheduleEmit` on return handover was removed — workflow events now flow through the outbox consumer.
