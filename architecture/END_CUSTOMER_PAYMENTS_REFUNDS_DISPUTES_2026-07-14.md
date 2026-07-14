# End-Customer Payments — Refunds & Disputes MVP (2026-07-14)

## Refund API

`POST /organizations/:orgId/payment-requests/:requestId/refund`

- Permission: `payments.refund` → module `payments-refund`, level `write` (never `billing.write`)
- Headers: `Idempotency-Key` (required)
- Body: `{ amountCents?: number, reason: string }` — no client-supplied currency
- Stripe: Direct Charge refund on connected account via `stripe.refunds.create` with `refund_application_fee` when fee refund > 0

## Validation

- Status `PAID` or `PARTIALLY_REFUNDED`
- `refundableAmount = paidAmountCents - refundedAmountCents > 0`
- Refund amount ≤ refundable (default: full remaining)
- Organization + connected account alignment
- `stripePaymentIntentId` / charge present; livemode consistent
- Advisory lock per payment request (`payment-refund:{id}`) for parallel safety
- Idempotent replay via ledger `providerEventId = refund-idem:{orgId}:{key}`
- Deposit / non-rental purposes rejected in MVP

## Application fee refund policy (Prompt 8)

Proportional refund with integer-cent rounding:

`feeRefund = round(originalFee × refundAmount / originalRentalPayment)`

Full refund returns remaining fee after prior partial refunds (deterministic).

Ledger records policy amounts in `REFUND_APPLICATION_FEE`; Stripe receives `refund_application_fee: true`.

## Ledger (append-only)

- `PaymentTransaction` type `REFUND` — negative `balanceImpactCents`, parent = CHARGE
- `PaymentTransaction` type `REFUND_APPLICATION_FEE` — negative `applicationFeeImpactCents`
- Provider IDs + event/idempotency keys; no deletes or fee overwrites

## Invoice behavior

- `OrgInvoicePayment` row preserved (historical Stripe payment intact)
- `paidCents` / `outstandingCents` / status derived via `derivePaymentStatus` on refund
- SynqDrive platform billing invoices untouched

## Dispute behavior (`charge.dispute.created`)

- Append `DISPUTE` transaction linked to charge
- Payment request → `DISPUTED` (from `PAID` or `PARTIALLY_REFUNDED`)
- Booking payment summary updated; audit log + `PAYMENT_DISPUTE` email outbox
- No automatic booking cancellation; no evidence-upload UI in MVP

## Webhook reconciliation

- `charge.refunded`: processes incremental `amount_refunded` delta when not already recorded (API path skips duplicate)
- Duplicate events skipped via `provider + providerEventId + type` unique constraint

## Frontend

- `BookingPaymentCard`: refund action gated by `payments-refund` write; max amount, reason, confirmation checkbox, busy guard against double submit
- API: `api.organizationPaymentRequests.refund`
