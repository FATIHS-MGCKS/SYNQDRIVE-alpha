# Master Admin — Stripe Environment Separation (Phase 2B.2)

**Date:** 2026-07-26

## Decision

SynqDrive uses a single platform `STRIPE_SECRET_KEY`. Runtime Stripe mode (TEST vs LIVE) is derived **only** from the key prefix (`sk_test_` / `sk_live_`), with optional `STRIPE_ENVIRONMENT` cross-check.

Production (`NODE_ENV=production`) **must not start** with test keys unless `STRIPE_ALLOW_TEST_IN_PRODUCTION=true` (non-prod sandboxes only).

## Components

| Layer | Module |
|-------|--------|
| Resolution + validation | `backend/src/shared/stripe/stripe-environment.util.ts` |
| Nest bootstrap | `StripeEnvironmentModule` + `StripeEnvironmentService` |
| Config | `backend/src/config/stripe.config.ts` |
| Billing webhooks | `stripe-webhook.service.ts` |
| Connect webhooks | `stripe-connect-webhook.service.ts` |

## Data model

Existing `BillingStripeMode` (`stripe_mode` columns) remains the per-record mode marker. Reconciliation compares local `stripe_mode` to runtime key mode (`TEST_LIVE_MODE_CONFLICT`).

## Remediation doc

`docs/remediation/stripe-environment-separation.md`
