# Booking Atomic Pricing (Quote → Booking → Snapshot)

**Prompt 15 / Booking Production-Readiness**

## Goal

Booking creation and pricing-relevant updates must be fully atomic: quote lock, validation, booking write, immutable price snapshot, and quote consumption happen in **one database transaction**. Client-supplied prices are never trusted.

## Flow

```
Client                    API                         DB Transaction
  |                        |                                |
  |-- POST booking + quoteId ->                            |
  |                        |-- findConsumedBookingId (idempotency)
  |                        |-- BEGIN ---------------------->|
  |                        |-- SELECT quote FOR UPDATE ---->|
  |                        |-- verify tenant/expiry/context |
  |                        |-- verify integrity hash        |
  |                        |-- INSERT/UPDATE booking ------->|
  |                        |-- UPDATE quote CONSUMED ------->|
  |                        |-- INSERT snapshot revision --->|
  |                        |-- COMMIT ---------------------->|
  |<-- booking + snapshot --|                                |
```

## Components

| Component | Role |
|-----------|------|
| `PricingQuoteApplicationService` | Orchestrates atomic create (`createBookingWithQuote`) and reprice (`repriceBookingWithQuote`) |
| `PricingQuoteService.lockAndPrepareQuote` | `SELECT … FOR UPDATE`, integrity + consumability checks inside TX |
| `PricingService.appendBookingPriceSnapshotRevision` | Append-only revisions; marks prior `isCurrent = false` |
| `OrgInvoice.bookingPriceSnapshotId` | Invoice references concrete snapshot revision |

## Snapshot revision model

- `BookingPriceSnapshot.revision` — monotonic per booking (1, 2, 3, …)
- `isCurrent` — exactly one current revision per booking for operational reads
- Old revisions are **never overwritten**; repricing creates a new row
- `metadataJson` includes: base rental, rental days, tariff, options, fees, discounts, taxes, deposit, currency, rental-rule revision, `calculatedAt`, `engineVersion`

## Error codes

| Code | Meaning |
|------|---------|
| `PRICING_QUOTE_TAMPERED` | Integrity hash mismatch |
| `PRICING_QUOTE_ALREADY_CONSUMED` | Quote used for another booking |
| `PRICING_QUOTE_EXPIRED` | Quote past TTL |
| `BOOKING_PRICE_SNAPSHOT_FAILED` | Snapshot step failed (full TX rollback) |

## Idempotency

- If quote is already `CONSUMED` for the same `bookingId`, the application returns the existing booking + current snapshot (`idempotentReplay: true`).
- `markConsumed` uses `updateMany` with `status = ACTIVE` so concurrent consumers race safely.

## Invoice binding

`createBookingInvoice` sets `bookingPriceSnapshotId` to the current (`isCurrent: true`) snapshot at invoice creation time. All downstream payment/checkout reads use `isCurrent: true`.

## Tests

`backend/src/modules/pricing/pricing-quote-atomic.spec.ts` covers:

- Happy path (revision 1 + quote consumed)
- Double quote use
- Idempotent replay
- Expired quote
- Manipulated quote (integrity hash)
- Rollback on booking insert failure
- Rollback on snapshot failure
- Parallel quote consumption
- Reprice appends revision without overwriting
