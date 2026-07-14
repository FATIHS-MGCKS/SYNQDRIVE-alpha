# End Customer Payments — Stripe Connect Webhook (Ingestion MVP)

**Date:** 2026-07-14  
**Scope:** Separate webhook ingress for Connect end-customer payment events — **no** PAID transitions, invoice posting, or email.

## Route

```
POST /api/v1/webhooks/stripe-connect
```

Public (no JWT). Signature verified in service. **Separate** from platform billing:

```
POST /api/v1/webhooks/stripe   ← modules/billing (unchanged)
```

## Secret

| Variable | Purpose |
|----------|---------|
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect webhook signing secret |
| `STRIPE_WEBHOOK_SECRET` | Billing only — **never reused** |

## Event store

`StripeConnectWebhookEvent` (`stripe_connect_webhook_events`):

- `stripeEventId` unique (idempotent ingress)
- `stripeConnectedAccountId`, `organizationId` (nullable)
- `payloadHash`, `safeEventData` (minimized — no full raw payload, no customer email)
- `processingStatus`: `RECEIVED`, `IGNORED`, `UNRESOLVED_ACCOUNT`, `FAILED`, `PROCESSED`

## HTTP strategy

| Case | Response |
|------|----------|
| Invalid signature | `400` reject |
| Duplicate `stripeEventId` | `200` skip |
| Persisted successfully | `200` |
| Unknown connected account | `200` + `UNRESOLVED_ACCOUNT` stored |
| DB failure | `503` (Stripe retry) |
| Test/live mismatch | `400` (`StripeModeMismatchError`) |

## Account resolution

1. Extract `event.account` (or object-level account reference)
2. Lookup `OrganizationPaymentAccount` by `stripeConnectedAccountId`
3. Set `organizationId` when found
4. **Never** guess org from metadata alone — unknown account → `organizationId = null`, status `UNRESOLVED_ACCOUNT`

## MVP event types (stored as `RECEIVED`)

- `account.updated`
- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`

Other verified event types are stored as `IGNORED` (safe retention, no business dispatch).

## Processing

Controller → `StripeConnectWebhookService.ingestRawWebhook()` → `StripeConnectWebhookProcessorService.enqueueForProcessing()` (deferred stub).

No PAID status, no invoice payment, no email in this phase.

## Key files

- `stripe-connect-webhook.controller.ts`
- `stripe-connect-webhook.service.ts`
- `stripe-connect-webhook.processor.ts`
- `stripe-connect-webhook.util.ts`
- `repositories/stripe-connect-webhook-event.repository.ts`
