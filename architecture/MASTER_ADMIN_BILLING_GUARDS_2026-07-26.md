# Master Admin — Billing Guards (Phase 2B.7)

**Date:** 2026-07-26

## Decision

Local subscription `ACTIVE` commits via Master Admin `activate` / `reactivate` require **Stripe confirmation** when Stripe is configured:

1. Pre-check contract (not already ACTIVE, valid transition)
2. Sync to Stripe with `contractDomainStatusOverride: ACTIVE`
3. Retrieve Stripe subscription and verify confirmed status
4. Only then call `SubscriptionLifecycleService.activate()` / `reactivate()`

Legacy `POST /billing/subscriptions` direct ACTIVE create is blocked.

## Guards

| Risk | Mechanism |
|------|-----------|
| Duplicate activation | `BILLING_ACTIVATION_ALREADY_ACTIVE` |
| Race conditions | Command idempotency + `lockVersion` |
| Duplicate Stripe calls | Idempotency key suffix on orchestrator sync |
| Manual inconsistency | Stripe sync-then-verify gate |

## Doc

`docs/remediation/billing-guards.md`
