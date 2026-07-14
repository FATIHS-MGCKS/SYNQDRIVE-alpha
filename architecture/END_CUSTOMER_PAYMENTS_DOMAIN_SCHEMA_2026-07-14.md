# End-customer payments domain — Prisma schema (Prompt 5)

**Date:** 2026-07-14  
**Scope:** Data model only — no Stripe API, checkout, or UI.

## Separation from `modules/billing`

| Domain | Scope |
|--------|--------|
| `modules/billing` | SynqDrive SaaS subscriptions (unchanged) |
| `modules/payments` (new) | Rental end-customer → organization + application fee |

## New enums

- `PaymentProvider` — `STRIPE`
- `StripeAccountGeneration` — `V1`, `V2`
- `OrganizationPaymentAccountStatus`
- `BookingPaymentStatus` — derived summary on `Booking` only
- `BookingPaymentRequestStatus` — `DRAFT`, `OPEN`, `LINK_PENDING`, `LINK_SENT`, `PROCESSING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`, `CANCELLED`, `EXPIRED`, `DISPUTED`
- `BookingPaymentPurpose` — `BOOKING_INVOICE`, `INVOICE_SETTLEMENT` (no deposit)
- `PaymentTransactionType` / `PaymentTransactionStatus`
- `StripeConnectWebhookProcessingStatus`

## New models

1. **OrganizationPaymentAccount** — one row per org + provider (MVP)
2. **BookingPaymentRequest** — checkout/payment intent lifecycle per booking/invoice
3. **PaymentTransaction** — append-only ledger (no `updatedAt`)
4. **StripeConnectWebhookEvent** — `payloadHash` + `safeEventData`, not full Stripe payloads

## Extensions

- `Booking.paymentStatus` — `BookingPaymentStatus` default `UNPAID` (derived, not source of truth)
- `OrgInvoicePayment` — `stripePaymentIntentId`, `stripeChargeId`, `bookingPaymentRequestId`; invoice FK `onDelete: Restrict`

## Constraints

- `@@unique([organizationId, provider])` on payment accounts
- `@@unique([stripeConnectedAccountId])` globally
- `@@unique([organizationId, idempotencyKey])` on payment requests
- Stripe IDs unique per connected account where applicable
- Ledger: `@@unique([provider, providerEventId, type])`
- Webhook: `@@unique([stripeEventId])`

## Deployment

Run migration on staging first:

```bash
cd backend && npx prisma migrate deploy
```

**Do not** run on production until Connect checkout flow is implemented and reviewed.
