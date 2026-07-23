# Booking Cancellation & Admin Override Hardening (Prompt 10)

Production-readiness layer on top of the booking status command API (Prompt 9) and state machine (Prompt 8).

## Cancellation

### Allowed states

Cancellation remains governed by the central state machine (`PENDING`, `CONFIRMED`, `ACTIVE` → `CANCELLED`).

### Request contract

`POST /organizations/:orgId/bookings/:id/status/cancel`

Headers:
- `Idempotency-Key` (required)

Body (required):
```json
{
  "reasonCode": "CUSTOMER_REQUEST",
  "description": "optional free text",
  "effectiveAt": "2026-01-01T10:00:00.000Z"
}
```

`actor` is derived from authenticated user context (not client-supplied).

Stable `reasonCode` values:
- `CUSTOMER_REQUEST`
- `CUSTOMER_NO_LONGER_NEEDS`
- `VEHICLE_UNAVAILABLE`
- `PRICING_ERROR`
- `DUPLICATE_BOOKING`
- `WEATHER_FORCE_MAJEURE`
- `OPERATIONAL_DECISION`
- `OTHER`

### Cancellation fee

Derived server-side from:
- `OrganizationRentalRules.cancellationFeePercentBps`
- `cancellationFreeHoursBeforePickup`
- `cancellationMinFeeCents` / `cancellationMaxFeeCents`
- frozen `BookingPriceSnapshot.totalGrossCents`

No fee is charged when policy fields are absent (explicit zero default).

### Financial/document sync

`BookingCancellationOrchestrationService` synchronizes:
1. **Documents** — void all non-void generated documents for the booking
2. **Invoice** — cancel unpaid canonical `OUTGOING_BOOKING` invoice; flag paid/partial invoices for manual refund/credit
3. **Payment requests** — transition active requests to `CANCELLED`; flag paid amounts for manual refund

Process status is returned in the command response under `cancellation.processStatus`.

### Domain events & audit

- Workflow event `booking.cancelled` (existing state machine path)
- Append-only `booking_cancellation_audit_events` with SHA-256 `contentHash`, actor, truncated IP, process status

### Idempotency

Repeated cancel with the same `Idempotency-Key` replays stored command result (`transition.replayed = true`).

## Admin override

### Permission

`POST .../status/override` requires `booking.override` — not granted to worker/read-only role templates.

### Request contract

```json
{
  "toStatus": "CONFIRMED",
  "reason": "min 10 characters required",
  "affectedInvariants": ["STATUS_MACHINE_BYPASS", "TERMINAL_REACTIVATION"],
  "approvalRequestId": "optional OrgWorkflowApproval UUID"
}
```

When `affectedInvariants` is omitted, server infers from `fromStatus`/`toStatus`.

`approvalRequestId` is optional four-eyes preparation — validated against `org_workflow_approvals` when present.

### Audit

Append-only `booking_status_override_audit_events`:
- previous/new status
- reason + affected invariants
- actor, org, truncated IP, user-agent
- SHA-256 `contentHash` over canonical payload fields

## Response shape

```json
{
  "booking": { "...": "..." },
  "transition": { "...": "..." },
  "cancellation": {
    "reasonCode": "CUSTOMER_REQUEST",
    "description": null,
    "effectiveAt": "2026-01-01T10:00:00.000Z",
    "fee": { "feeCents": 2500, "currency": "EUR", "...": "..." },
    "processStatus": {
      "documents": { "state": "COMPLETED", "voidedCount": 2, "pendingCount": 0 },
      "invoice": { "state": "COMPLETED", "requiresManualRefund": false },
      "payment": { "state": "COMPLETED", "requiresManualRefund": false },
      "followUpProcessesRunning": false
    },
    "auditEventId": "uuid"
  },
  "overrideAudit": {
    "reason": "...",
    "affectedInvariants": ["STATUS_MACHINE_BYPASS"],
    "approvalRequestId": null,
    "auditEventId": "uuid"
  }
}
```

## Key modules

| Path | Role |
|------|------|
| `cancellation/booking-cancellation-fee.service.ts` | Fee derivation from rental rules + price snapshot |
| `cancellation/booking-cancellation-orchestration.service.ts` | Document/invoice/payment sync + process status |
| `cancellation/booking-cancellation-audit.service.ts` | Append-only cancellation audit |
| `override/booking-status-override-audit.service.ts` | Tamper-resistant override audit |
| `util/booking-request-context.util.ts` | Privacy-safe request context + content hash |

## Frontend (minimal)

Cancel dialogs in rental + operator surfaces now require `reasonCode` and optionally send `description`. No layout redesign.
