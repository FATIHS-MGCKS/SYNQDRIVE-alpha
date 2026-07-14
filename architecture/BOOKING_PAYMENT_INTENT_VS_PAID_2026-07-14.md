# Booking Checkout: Payment Intent vs. Actual Payment (2026-07-14)

## Problem

`paymentMethod = card` in the booking wizard checkout was treated as proof of payment. `BookingInvoiceLifecycleService.syncOnBookingConfirmed` called `InvoicesService.recordPayment` when `paymentMethod === 'card'`, marking `OrgInvoice` as `PAID` without any Stripe PaymentIntent, Checkout Session, or webhook.

## Root cause

```typescript
// booking-invoice-lifecycle.service.ts (before fix)
const shouldMarkPaid =
  options?.markPaid === true || options?.paymentMethod === 'card';
```

## Correct separation

| Concept | Source | Effect on invoice |
|---------|--------|-------------------|
| Payment intent | `BookingWizardDraftConfirmDto.paymentMethod` (`card` \| `cash` \| `invoice`) | None — informational only at checkout |
| Actual payment | `markPaid: true` (explicit authorized action), `POST .../invoices/:id/payments`, verified webhooks (future) | Creates `OrgInvoicePayment`, may set `PAID` |

## Flow after fix

```
NewBookingView → CheckoutStep (select paymentMethod)
  → confirmWizardDraft({ paymentMethod })
  → BookingWizardDraftService.confirmDraft()
  → BookingInvoiceLifecycleService.syncOnBookingConfirmed()
      → void duplicates, issue DRAFT → ISSUED
      → recordPayment ONLY if markPaid === true
```

`paymentMethod = card` confirms the booking and issues the invoice; invoice stays open until a real payment is recorded.

## Authorized payment paths (unchanged)

- `POST /organizations/:orgId/invoices/:id/payments` — manual payment recording
- `PATCH /organizations/:orgId/invoices/:id/pay` — mark remaining balance paid
- `syncOnBookingConfirmed({ markPaid: true })` — ops/repair explicit action only
- Future: Stripe Connect webhooks in `modules/payments` (not implemented in this step)

## Regression tests

`backend/src/modules/invoices/booking-invoice-lifecycle.service.spec.ts` — 10 cases covering card/invoice/cash intent, explicit markPaid, duplicate prevention.

## Legacy data (Prompt 3)

Bookings confirmed with `paymentMethod = card` before this fix may have `OrgInvoice` status `PAID` and `OrgInvoicePayment` rows with `method = CARD` without corresponding Stripe charges. No automatic correction in this step.
