# Master Admin — Trial Model (Phase 2B.6)

**Date:** 2026-07-26

## Decision

SynqDrive uses **one canonical contract trial** on `billing_subscriptions` (domain `TRIALING`, `trialStartAt`, `trialEndAt`).

| Concept | Role |
|---------|------|
| Internal trial | Commercial contract state — **source of truth** for entitlements |
| Manual trial | Master Admin activation via `configureTrial` → `startTrial()` |
| Stripe trial | Payment projection (`trialing`, `trial_end`) pushed from local `trialEndAt` on orchestrator sync |

Stripe webhooks mirror **payment status** only; they do not own trial end dates.

## Lifecycle constraints

- Allowed: `DRAFT → TRIALING → ACTIVE`
- No downgrade back to trial
- `scheduleCancel` blocked from `TRIALING` (lifecycle gap)
- No automatic expiry worker — `trialEndAt` not enforced in entitlement resolver today

## Doc

`docs/remediation/trial-model.md`
