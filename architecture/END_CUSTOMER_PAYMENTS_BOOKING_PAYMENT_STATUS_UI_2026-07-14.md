# End Customer Payments — Booking Payment Status UI

**Date:** 2026-07-14  
**Scope:** Operator-visible payment status after booking confirmation and in booking detail.

## Success screen scenarios

| Scenario | Condition | UI |
|----------|-----------|-----|
| A — Full success | Payment request + checkout; email sent (`LINK_SENT` or queued) | Amount open, expiry, open/copy link, view booking |
| B — Email failed | Checkout exists; email step failed | Payment open, link actions, resend |
| C — Request failed | No payment request created | Booking OK; retry in booking detail |

Live status via `GET …/payment-requests` polling (3s) after confirm.

## Booking detail payment card

`BookingDetailDto.payments` (from `BookingPaymentCardService`):

- Summary: `Booking.paymentStatus`, `Booking.paymentIntent`
- Primary `BookingPaymentRequest` + invoice ref
- Amounts from server snapshot/request (no client pricing)
- Truncated Stripe refs only
- No application fee for normal workers

## API

| Method | Path | Permission |
|--------|------|------------|
| GET | `…/payment-requests` | `payments.read` |
| GET | `…/payment-requests/:id` | `payments.read` |
| POST | `…/payment-requests/:id/cancel` | `payments.cancel` |

Existing: create, checkout, resend.

## Frontend

- `BookingPaymentSuccessPanel` — success states A/B/C
- `BookingPaymentCard` — finance tab; mobile card layout; sticky actions; a11y labels
- Permissions via `hasPermission('payments', read/write)`
