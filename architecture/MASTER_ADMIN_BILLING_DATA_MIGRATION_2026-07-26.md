# Master Admin — Billing Data Migration (Phase 2B.8)

**Date:** 2026-07-26

## Decision

Billing data migration is **audit-first, human-approved, idempotent execute only**.

No automatic data mutation in this phase. Anomaly detection uses:

- Read-only SQL (documented in remediation doc)
- `backfill-billing-legacy.ts --dry-run`
- `BillingReconciliationService` drift engine

## Anomaly classes

Orphaned customers, missing Stripe IDs, trial without cause, duplicate customers, inconsistent subscriptions, missing products, invalid prices — each with detection queries and remediation class (manual vs approved tool).

## Doc

`docs/remediation/billing-data-migration.md`
