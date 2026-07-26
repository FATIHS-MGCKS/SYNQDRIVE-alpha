# Master Admin — Stripe Webhook Hardening (Phase 2B.3)

**Date:** 2026-07-26

## Decision

All Stripe webhook ingress (billing + Connect) uses a shared security util for signature verification, replay tolerance, payload hashing, and terminal-state idempotency.

## Endpoints

| Path | Store table | Processing |
|------|-------------|------------|
| `/api/v1/webhooks/stripe` | `stripe_webhook_events` | Synchronous dispatch |
| `/api/v1/webhooks/stripe-connect` | `stripe_connect_webhook_events` | Store + inline reconciliation |

## Key invariants

1. Verify signature before any DB write (except missing-secret early exit).
2. `stripeEventId` is the idempotency key.
3. Terminal statuses are never re-dispatched.
4. FAILED statuses are retried on Stripe redelivery.
5. Payload hash mismatch is rejected (tamper protection).

## Remediation doc

`docs/remediation/stripe-webhook-hardening.md`
