# Master Admin — Billing Reconciliation Engine (Phase 2B.5)

**Date:** 2026-07-26

## Decision

Periodic Stripe ↔ local DB comparison runs via `BillingReconciliationService` + scheduler. Drifts are detected, classified, logged, and require **manual acknowledgment** before resolve or technical auto-fix.

Contract data is **never** overwritten by the scheduler.

## Drift storage

- `billing_reconciliation_runs` — batch metadata
- `billing_reconciliation_drifts` — open/resolved drift records with acknowledgment

## API

Master Admin: run, list runs, list drifts, acknowledge, resolve, auto-fix (technical only).

## Doc

`docs/remediation/billing-reconciliation.md`
