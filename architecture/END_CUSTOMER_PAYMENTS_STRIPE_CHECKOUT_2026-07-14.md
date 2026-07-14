# End Customer Payments — Stripe Checkout Session (Direct Charge)

**Date:** 2026-07-14  
**Scope:** Per `BookingPaymentRequest` create an individual Stripe Checkout Session as Direct Charge on the org connected account. **No** email, **no** webhooks, **no** PAID transition.

## Stripe call

```
stripe.checkout.sessions.create(
  {
    mode: 'payment',
    line_items: [...],  // from frozen snapshot, no deposit
    payment_intent_data: {
      application_fee_amount: <frozen fee snapshot>,
      metadata: { organizationId, bookingId, invoiceId, paymentRequestId },
    },
    metadata: { organizationId, bookingId, invoiceId, paymentRequestId },
    customer_email,
    success_url,
    cancel_url,
    expires_at,  // clamped to Stripe 30min–24h window
  },
  {
    stripeAccount: <connectedAccountId>,  // Direct Charge context
    idempotencyKey: checkout:<orgId>:<paymentRequestId>:<header-key>,
  },
)
```

Implemented in `StripeConnectV1Adapter.createCheckoutSession` — test mode only (`assertConnectTestModeOnly`).

## Account context

Pre-checks before creation:

- `Organization.paymentsEnabled` + `payments.create`
- Connected account exists, `ACTIVE`, `chargesEnabled`
- Live Stripe retrieve confirms charges not restricted
- Currency supported (EUR MVP)
- Platform test/live mode guard (no live objects in this phase)

## API

```
POST /api/v1/organizations/:orgId/bookings/:bookingId/payment-requests/:requestId/checkout
```

**Header:** `Idempotency-Key` (required)  
**Body:** `successUrl?`, `cancelUrl?` only — validated against CORS/config allowlist. **No amounts.**

**Response:** checkout URL, session ID, payment intent ID (if available), amount/currency/fee from frozen request, connected account ID, livemode.

## Status flow

| Step | Status | Notes |
|------|--------|-------|
| Payment request created (Prompt 12) | `OPEN` | Frozen amount |
| Checkout creation started | `LINK_PENDING` | In-flight |
| Session persisted | `CHECKOUT_READY` | Checkout URL available; **not** `LINK_SENT` |
| Email sent (future) | `LINK_SENT` | Only after Resend integration |
| Payment confirmed | `PROCESSING` → `PAID` | **Webhooks only** (future) |

Success/cancel redirect URLs are UX-only — they do **not** change payment status.

## Idempotency

- **Stripe:** `idempotencyKey` on `checkout.sessions.create`
- **DB:** unique `(organizationId, checkoutIdempotencyKey)` + advisory lock per payment request
- Active non-expired session → return existing (no second Stripe call)
- Expired session → new session allowed (`CHECKOUT_READY` → `LINK_PENDING` → `CHECKOUT_READY`)

## Deposit

Deposit line items excluded from checkout `line_items` (same rules as fee snapshot). `amountCents` on request never includes deposit.

## Stored fields

`stripeCheckoutSessionId`, `stripePaymentIntentId`, `checkoutUrl`, `checkoutCreatedAt`, `checkoutExpiresAt`, `checkoutIdempotencyKey`, `stripeConnectedAccountId`, `stripeLivemode`

## Out of scope

- Email (`LINK_SENT` not set in this phase)
- Connect webhooks / PAID
- Invoice payment marking
- Static Stripe Payment Links

## Key files

- `stripe-checkout.service.ts`
- `stripe/stripe-connect-v1.adapter.ts` (`createCheckoutSession`)
- `utils/checkout-line-items.util.ts`
- `utils/payments-checkout-url.util.ts`
- `booking-payment-request.controller.ts` (`POST :requestId/checkout`)
