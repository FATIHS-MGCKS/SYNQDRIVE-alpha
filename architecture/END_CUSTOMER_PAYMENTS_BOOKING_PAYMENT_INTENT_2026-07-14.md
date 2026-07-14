# End Customer Payments — Booking Payment Intent (New Booking Checkout)

**Date:** 2026-07-14  
**Scope:** Replace misleading checkout option „Kartenzahlung“ with explicit MVP payment intents, persist intent on `Booking`, and orchestrate payment-link flow on confirm without fake PAID.

## Payment intents (`BookingPaymentIntent`)

| Wire / Prisma | Label (DE) | MVP behavior |
|---------------|------------|--------------|
| `payment_link` / `PAYMENT_LINK` | Zahlungslink per E-Mail | Confirm booking → invoice open → `BookingPaymentRequest` → Stripe Checkout → payment email |
| `pay_on_pickup` / `PAY_ON_PICKUP` | Vor Ort bezahlen | No Stripe; invoice stays open |
| `cash` / `CASH` | Barzahlung | No auto payment; manual cash recording later |
| `invoice` / `INVOICE` | Rechnung / Überweisung | No auto payment; invoice stays open |
| `terminal` / `TERMINAL` | — | Schema only; not selectable in wizard |

Legacy `paymentMethod: card` removed from wizard; deprecated alias `paymentMethod` still accepted on API for transition.

## Persistence

- `Booking.paymentIntent` (`booking_payment_intent` column) set on wizard confirm.
- Invoice lifecycle receives intent for metadata only — **never** auto-`recordPayment` unless `markPaid: true`.

## `payment_link` eligibility

`BookingWizardCheckoutContextService.evaluatePaymentLinkEligibility`:

1. `paymentsEnabled` (org feature)
2. Connect account: `stripeConnectedAccountId`, `status=ACTIVE`, `chargesEnabled=true`
3. Customer recipient email present
4. Pricing snapshot exists and `onlineAmountCents > 0` (from `PaymentFeeService` / snapshot — deposit excluded)

`GET …/wizard-draft/:bookingId/checkout-context` returns amounts and eligibility for checkout UI (no client-side total recompute).

## Confirm flow (`payment_link`)

```
confirmDraft
  → persist paymentIntent on Booking
  → syncOnBookingConfirmed (issue invoice, stay open)
  → BookingWizardPaymentFlowService.executePaymentLinkFlow
      → createRentalPaymentRequest
      → createCheckoutSessionForPaymentRequest
      → PaymentEmailEnqueueService.maybeEnqueueAfterCheckout
  → return { booking, bundle, autoSend, paymentIntent, paymentFlow }
```

Partial failures (`paymentFlow.partialFailures`):

| Step | Booking visible? |
|------|------------------|
| `payment_request` failed | Yes (confirmed) |
| `checkout` failed | Yes + request may exist |
| `email` failed | Yes + checkout may exist |

Success UI must reflect real state; booking must not disappear.

## Frontend

- `CheckoutStep`: four intents; `payment_link` panel shows server amounts (online without deposit, deposit at pickup, email, expiry).
- `NewBookingView`: fetches checkout context on step 5; disables/auto-switches ineligible `payment_link`.
- `BookingSuccessState`: payment-flow steps + partial-failure banner.

## Tests

- `booking-wizard-checkout-context.service.spec.ts` — eligibility, server amounts
- `booking-wizard-payment-flow.service.spec.ts` — full flow + partial failures
- `booking-invoice-lifecycle.service.spec.ts` — no PAID from intent alone
