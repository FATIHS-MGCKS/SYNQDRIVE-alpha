# End Customer Payments — Booking Payment Request (MVP)

**Date:** 2026-07-14  
**Scope:** Server-side creation of `BookingPaymentRequest` for rental payments — **no** Stripe Checkout, **no** email, **no** webhooks.

## Canonical payment basis (priority)

1. **`BookingPriceSnapshot`** and its line items (via `PaymentFeeService.buildFeeSnapshotForBooking`)
2. **`OrgInvoice`** resolved or created through existing booking invoice lifecycle, validated against the snapshot
3. **Frozen `BookingPaymentRequest.amountCents`** — immutable server snapshot at creation time

**Never used for amount:**

- Frontend / client-supplied totals
- `totalDueNowCents`
- Deposit (`BookingDeposit`)
- Arbitrary fees from the client

## MVP payment purpose

- **`RENTAL_PAYMENT`** — only purpose used in production for this endpoint
- `BOOKING_INVOICE`, `INVOICE_SETTLEMENT` remain in enum for future use

## API

```
POST /api/v1/organizations/:orgId/bookings/:bookingId/payment-requests
```

**Headers:** `Idempotency-Key` (optional but recommended)

**Body (no amounts):**

| Field | Type | Notes |
|-------|------|-------|
| `recipientEmail` | string? | Override; otherwise customer email |
| `expiresIn` | number? | Seconds until expiry (default 7 days) |
| `sendEmail` | boolean? | Stored as `sendEmailOnLink`; **not executed** in this phase |

**Guards:** `OrgScopingGuard`, `PaymentsFeatureGuard`, `PaymentsPermissionGuard`  
**Permission:** `payments.create`

**Response:** Payment request id, status, `amountCents`, `currency`, `depositInfoCents` (informational), optional `applicationFeeAmountCents` (only with `payments.settings.manage` or org admin).

## Creation flow

1. Validate org, feature flag, permission, booking, customer, recipient email
2. Load canonical price snapshot (line items)
3. Resolve or create `OrgInvoice` for booking
4. Validate snapshot ↔ invoice (currency, commissionable amount)
5. Compute commissionable amount and application fee via `PaymentFeeService`
6. Reject if Stripe Connect account not ACTIVE / charges not enabled
7. Idempotency + advisory lock; reject duplicate active `RENTAL_PAYMENT` per invoice
8. Create request in `DRAFT`, transition to `OPEN` via `PaymentStatusService`

## Idempotency

- Header `Idempotency-Key` or body field (if extended later) — stored on `(organizationId, idempotencyKey)` unique index
- Same org + key returns existing request (no second row)
- `pg_advisory_xact_lock` per org+booking during transaction for parallel safety
- At most one **active** `RENTAL_PAYMENT` per invoice (`DRAFT`, `OPEN`, `PROCESSING`)

## Deposit handling

- Deposit line items excluded from `amountCents` in fee snapshot (`excludeDeposit: true`)
- `depositInfoCents` returned separately in API response for UI context only
- `BookingDeposit` model unchanged

## Out of scope (this phase)

- Stripe Checkout Session
- Email sending
- Webhooks
- Marking invoice as paid

## Key files

- `booking-payment-request.service.ts`
- `booking-payment-request.controller.ts`
- `utils/booking-payment-invoice.validation.ts`
- `dto/booking-payment-request.dto.ts`
- `dto/booking-payment-request.response.ts`
- `repositories/booking-payment-request.repository.ts`
