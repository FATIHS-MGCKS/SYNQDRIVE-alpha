# Booking Financial State (Booking ↔ Snapshot ↔ Invoice ↔ Payment)

**Prompt 16 / Booking Production-Readiness**

## Separation of concerns

| Concept | Field / source | Purpose |
|---------|----------------|---------|
| Operational lifecycle | `Booking.status` | PENDING → CONFIRMED → ACTIVE → COMPLETED |
| Checkout intent | `Booking.paymentIntent` | Wizard selection — **not** payment proof |
| Canonical financial state | `Booking.financialState` | Derived, persisted summary |
| Invoice pipeline | `Booking.invoiceProcessingState` | Bootstrap/issue retry state |
| Payment truth | `BookingPaymentRequest` + `OrgInvoicePayment` | Money received / refunded |
| Price lock | `BookingPriceSnapshot` + `OrgInvoice.bookingPriceSnapshotId` | Immutable billing basis |

## Financial states

`NOT_REQUIRED` · `PENDING` · `PROCESSING` · `READY` · `FAILED` · `PARTIALLY_PAID` · `PAID` · `REFUND_PENDING` · `REFUNDED`

## Invoice processing pipeline

On booking confirmation (`CONFIRMED`):

1. `invoiceProcessingState = PROCESSING`
2. Idempotent `bootstrapBookingInvoice` (DRAFT if missing)
3. `syncOnBookingConfirmed` (issue canonical invoice)
4. Validate bindings: booking, org, customer, currency, snapshot FK
5. `canonicalInvoiceId` + `invoiceProcessingState = READY`
6. Derive and persist `financialState`

On failure:

- `invoiceProcessingState = FAILED`
- `invoiceProcessingError` persisted (visible in booking detail)
- Exponential backoff `invoiceProcessingNextRetryAt`
- Recovery: `POST …/bookings/:id/retry-invoice-processing` (`invoices.write`)

## Permissions

`GET …/bookings/:id/detail` redacts `finance` and `payments` when actor lacks `invoices.read` or `payments.read`.

## Post-invoice changes

Price changes after invoicing require correction/credit/revision flows — not silent invoice overwrite. Canonical invoice is voided only via `voidDuplicateBookingInvoices` / credit workflows.

## Tests

- `booking-financial-state.derive.spec.ts` — state derivation
- `booking-financial-state.service.spec.ts` — idempotency, failure, retry, snapshot mismatch
