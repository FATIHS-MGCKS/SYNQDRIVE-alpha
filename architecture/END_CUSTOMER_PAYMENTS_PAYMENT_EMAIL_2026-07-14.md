# End Customer Payments — Payment Email Flow

**Date:** 2026-07-14  
**Scope:** Reliable outbound email for booking payment links and payment confirmations via existing Resend / OutboundEmail infrastructure.

## Email types (`PaymentEmailType` / `OutboundEmailSourceType`)

| Type | MVP |
|------|-----|
| `BOOKING_PAYMENT_REQUEST` | Implemented |
| `PAYMENT_CONFIRMATION` | Implemented |
| `PAYMENT_FAILED` | Enum only (future) |
| `PAYMENT_EXPIRED` | Enum only (future) |
| `PAYMENT_REFUND` | Enum only (future) |
| `PAYMENT_DISPUTE` | Enum only (future) |

## Flow — payment link email

```
BookingPaymentRequest persisted (OPEN)
  → Stripe Checkout session persisted (CHECKOUT_READY)
  → PaymentEmailOutbox row (PENDING)
  → BullMQ job payment.email
  → PaymentEmailSenderService → OutboundEmail + Resend
  → on success: BookingPaymentRequest → LINK_SENT
  → lastSentAt, sendAttemptCount++, delivery via OutboundEmail events
```

Auto-enqueue after checkout when `sendEmailOnLink === true` on the request.

Manual / retry: `POST …/payment-requests/:requestId/resend` (`payments.resend`).

## Flow — payment confirmation

```
payment_intent.succeeded reconciliation (DB tx commits)
  → PaymentConfirmationNotifierService.schedulePaymentConfirmation()
  → PaymentEmailOutbox (idempotent once per request)
  → worker send (only if request status PAID)
```

**Never** sent inside webhook DB transaction.

## Outbox (`payment_email_outbox`)

- Status: `PENDING` → `PROCESSING` → `COMPLETED` | `DEAD_LETTER`
- Unique `idempotencyKey` prevents duplicate enqueue
- Retry: exponential backoff (`PAYMENT_EMAIL_BACKOFF_MS`, max attempts)
- Cron poll every 30s + immediate schedule on enqueue
- Links to `OutboundEmail` for delivery status / Resend webhooks

## Resend rules

- Reuse active `checkoutUrl` when session still valid — **no new PaymentIntent**
- After expiry: `EXPIRED` → `OPEN`, new checkout session with new idempotency key
- New outbox idempotency suffix per resend attempt
- Audit via `ActivityLog` + `OutboundEmail` events

## Failure handling

- Booking and payment request remain unchanged financially
- `LINK_SENT` only after successful provider send
- `lastEmailErrorMessage` / `lastEmailErrorAt` on request for UI
- `sendAttemptCount` incremented on failure
- Retry via outbox; operator resend endpoint

## Guardrails

- Payment status never derived from email delivery
- No secrets in templates or logs
- Org hourly rate limit (`EMAIL_MAX_SENDS_PER_HOUR_PER_ORG`)
- Deposit excluded from email amount; noted as pickup-only

## Key files

- `email/payment-email-enqueue.service.ts`
- `email/payment-email-processor.service.ts`
- `email/payment-email-sender.service.ts`
- `email/payment-email-resend.service.ts`
- `email/payment-email-templates.util.ts`
- `workers/processors/payment-email.processor.ts`
