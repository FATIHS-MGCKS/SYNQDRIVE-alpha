# Master Admin — Stripe Sandbox Canonicalization (2026-08-18)

## Summary

Production billing remains **Stripe TEST** by operator decision. Sandbox acceptance S1–S10 passed; live cutover deferred (`STRIPE-LIVE-CUTOVER-DEFERRED`).

## Architecture

- **Runtime:** `StripeEnvironmentService` locks `runtime=TEST` in production with `STRIPE_ALLOW_TEST_IN_PRODUCTION=true`.
- **Reconciliation:** `BillingReconciliationService.runBatch({ dryRun: true })` — read-only drift detection, no run/drift persistence.
- **Remediation ops:** `billing-sandbox:canonicalize`, `billing-sandbox:bootstrap-catalog`, `billing-sandbox:ensure-webhook`.
- **Catalog sync:** `StripeCatalogSyncService.syncPriceVersion` → `billing_stripe_catalog_mappings`.
- **Subscription sync:** `StripeSubscriptionOrchestratorService` after legacy backfill creates subscription items.
- **Webhook:** `POST /api/v1/webhooks/stripe` — 23 billing events; signature via `STRIPE_WEBHOOK_SECRET`.

## DB fix

Migration `20260818223000_fix_billing_subscription_item_trigger` — PL/pgSQL variable `product_role` renamed to `v_product_role` to fix insert trigger on `billing_subscription_items`.

## Closure

`docs/final/master-admin-stripe-sandbox-canonicalization-closure.md`
