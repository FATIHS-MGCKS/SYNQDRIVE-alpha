# End Customer Payments — Payment Reconciliation (Connect Webhooks)

**Date:** 2026-07-14  
**Scope:** Idempotent processing of stored `StripeConnectWebhookEvent` rows into payment request status, ledger, and invoice payments.

## Canonical event responsibility

| Event | Responsibility |
|-------|----------------|
| `checkout.session.completed` | Session closed; reference PaymentIntent; transition to `PROCESSING` if not yet paid. **No** `OrgInvoicePayment`, **no** CHARGE ledger booking. |
| `payment_intent.succeeded` | **Canonical successful money receipt.** CHARGE `PaymentTransaction`, `OrgInvoicePayment` with `InvoicePaymentMethod.STRIPE`, request → `PAID`, booking `paymentStatus` derived, audit log. Confirmation email scheduled **after** DB transaction. |
| `payment_intent.payment_failed` | Request → `FAILED` (from checkout-ready states); failure reason in audit meta. **No** invoice payment. |
| `checkout.session.expired` | Request → `EXPIRED` when still in expirable states. **Never** downgrades `PAID`. |
| `account.updated` | Sync `OrganizationPaymentAccount` (`chargesEnabled`, `payoutsEnabled`, requirements, `disabledReason`). Outside payment-request transaction. |
| `charge.refunded` / `charge.dispute.created` | Stored; marked deferred (no financial reconciliation in this phase). |

## Processing flow

```
StripeConnectWebhookService.ingestRawWebhook()
  → StripeConnectWebhookProcessorService.enqueueForProcessing()
    → PaymentReconciliationService.processStoredWebhookEvent(eventRowId)
```

### DB transaction (payment events)

Within `prisma.$transaction`:

1. Advisory lock on event row (`pg_advisory_xact_lock`)
2. Skip if `processingStatus === PROCESSED` (duplicate `stripeEventId` replay)
3. Load payment context: org, metadata, amount, currency, connected account, livemode
4. Validate alignment with frozen `BookingPaymentRequest`
5. Event-specific reconciliation (status transitions only — no downgrade from `PAID`)
6. On `payment_intent.succeeded`: append-only `PaymentTransaction` (CHARGE + APPLICATION_FEE), single `OrgInvoicePayment`, update invoice `paidCents` / status
7. Derive `booking.paymentStatus` from all requests on booking
8. Activity audit log
9. Mark `StripeConnectWebhookEvent` as `PROCESSED`

Post-transaction (success only): `PaymentConfirmationNotifierService.schedulePaymentConfirmation()` — stub, no send inside tx.

## Idempotency

| Key | Mechanism |
|-----|-----------|
| `stripeEventId` | Unique at ingress; processor returns `skipped_duplicate` if already `PROCESSED` |
| PaymentIntent CHARGE | `PaymentTransaction` lookup by `providerObjectId` + `type=CHARGE` + `SUCCEEDED` |
| `OrgInvoicePayment` | Unique `bookingPaymentRequestId`; second success event skips create |
| Ledger | Append-only — existing CHARGE/fee rows are not mutated |

## Out-of-order behaviour

- `payment_intent.succeeded` may arrive **before** `checkout.session.completed` → financial booking still succeeds; late session.completed only patches Stripe refs or skips if already `PAID`.
- `checkout.session.expired` / `payment_intent.payment_failed` after `PAID` → `skipped_paid`, no status downgrade.
- `checkout.session.completed` after `PAID` → `skipped_paid`.

## Validation (per event)

- Resolved `organizationId` on webhook row (not metadata alone)
- Metadata `organizationId` / `paymentRequestId` match loaded request
- `stripeConnectedAccountId` matches request when both present
- `amountCents` and `currency` match frozen request
- `livemode` consistent with request when request already has `stripeLivemode`

## Guardrails

- No Success URL status changes
- No client-supplied payment totals
- No email inside DB transaction
- No SynqDrive billing (`modules/billing`) invoice changes
- No deposit (`BookingDeposit`) in payment amount
- Booking operational status stays `CONFIRMED` (MVP); only `booking.paymentStatus` derived

## Key files

- `payment-reconciliation.service.ts`
- `payment-reconciliation.util.ts`
- `payment-reconciliation.errors.ts`
- `payment-confirmation-notifier.service.ts`
- `stripe-connect-webhook.processor.ts` (dispatches to reconciliation)
