# Booking Observability (V4.9.790)

## Scope

Production-readiness observability for booking writes, side-effects, and detail reads.

## Persistence

- `booking_processing_failures` — durable processing failure ledger with category, operation, safe `error_code`, redacted message, correlation fields, severity, retryable flag.
- Categories: `INVOICE`, `DOCUMENT`, `EMAIL`, `TASK`, `HANDOVER`, `CONFLICT`, `DETAIL_READ`, `SIDE_EFFECT`, `TENANT`, `OUTBOX`, `OTHER`.

## Structured logging

`BookingObservabilityService` emits JSON logs with:

- `organizationId`, `bookingId`, `correlationId`, `requestId`, `eventId`, `operation`, `category`, `errorCode`
- Message body passed through `redactBookingLogValue` (no PII, tokens, signatures, full documents).

## Metrics (Prometheus)

| Metric | Purpose |
|--------|---------|
| `synqdrive_booking_create_success_total` | Successful creates |
| `synqdrive_booking_create_failure_total` | Failed creates |
| `synqdrive_booking_conflict_total` | Overlap / conflict denials |
| `synqdrive_booking_invoice_failure_total` | Invoice bootstrap/sync failures |
| `synqdrive_booking_document_failure_total` | Document enqueue/void failures |
| `synqdrive_booking_email_failure_total` | Email side-effect failures |
| `synqdrive_booking_task_failure_total` | Task automation failures |
| `synqdrive_booking_handover_failure_total` | Pickup/return side-effect failures |
| `synqdrive_booking_outbox_retry_total` | Outbox retries (reserved for outbox worker) |
| `synqdrive_booking_outbox_dead_letter_total` | Dead-letter events |
| `synqdrive_booking_tenant_denial_total` | Cross-tenant denials |
| `synqdrive_booking_outbox_lag_seconds` | Oldest pending outbox age |
| `synqdrive_booking_processing_failure_unresolved` | Stale unresolved failures by category |
| `synqdrive_booking_conflict_rate_window` | Conflicts in 15m window |
| `synqdrive_booking_tenant_denial_window` | Tenant denials in 15m window |

## Alerts

See `backend/monitoring/prometheus/alerts.yml` group `synqdrive_bookings`.

## API surface

- `BookingDetailDto.readIssues[]` — partial read degradation (e.g. document bundle load failed) without masking as empty data.

## Wiring

- `BookingsService` — create/update/cancel/no-show/detail side-effects
- `BookingsHandoverService` — document enqueue + task automation after handover
- `BookingPickupGateService` — audit append failures + tenant denial tracking
- `BookingWizardDraftService` — invoice sync on wizard confirm
