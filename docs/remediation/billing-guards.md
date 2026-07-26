# Master Admin Remediation — Phase 2B.7: Billing Guards

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** SynqDrive SaaS billing — activation guards, endpoint audit, Stripe confirmation gate

---

## 1. Executive summary

Phase 2B.7 ensures **no billing endpoint can commit local subscription `ACTIVE` without Stripe confirmation** when Stripe is configured.

Guards protect against:

| Risk | Mechanism |
|------|-----------|
| **Duplicate activation** | Pre-check: domain status must not already be `ACTIVE` (`BILLING_ACTIVATION_ALREADY_ACTIVE`) |
| **Race conditions** | Existing `lockVersion` optimistic locking + `BillingCommandService` idempotency (`CONCURRENT_COMMAND_IN_PROGRESS`) |
| **Duplicate events** | Command idempotency keys + Stripe sync idempotency suffix per activation command |
| **Manual inconsistencies** | Stripe-first sync with `contractDomainStatusOverride: ACTIVE`, then retrieve + verify Stripe status before local commit |

**Stripe webhooks remain the inbound confirmation channel** (`applyStripeSubscription`). Master Admin activate/reactivate now use **outbound sync-then-verify** before local lifecycle commit.

---

## 2. Endpoint audit

### 2.1 Endpoints that can reach `ACTIVE` (guarded)

| Endpoint | Method | Guard |
|----------|--------|-------|
| `/admin/billing/organizations/:orgId/subscription/activate` | POST | `MasterBillingGuard` + idempotency + **`BillingActivationGuardService.guardActivation()`** before `lifecycle.activate()` |
| `/admin/billing/organizations/:orgId/subscription/reactivate` | POST | Same guard before `lifecycle.reactivate()` |
| `/api/v1/webhooks/stripe` (`customer.subscription.*`) | POST | Inbound Stripe confirmation → `applyStripeSubscription` (allowed — Stripe is source) |
| `/admin/billing/organizations/:orgId/sync-stripe` | POST | Pull sync only; does not force local ACTIVE without lifecycle |

### 2.2 Endpoints blocked or read-only

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `/billing/subscriptions` | POST | **Blocked** — `LEGACY_DIRECT_ACTIVATION_BLOCKED` (was direct DB `ACTIVE` create) |
| All other `/billing/*` tenant routes | GET/POST | Read, payment methods, portal — no subscription activation |
| Master subscription draft/trial/pause/cancel | POST/PATCH | Lifecycle mutations; only **activate/reactivate** require Stripe confirmation for `ACTIVE` |
| Voice billing `PUT …/subscription` | PUT | Separate product — out of SaaS billing guard scope |

### 2.3 Endpoints with existing protections (unchanged)

| Protection | Applies to |
|------------|------------|
| `MasterBillingGuard` | Master subscription mutations, Stripe sync admin, reconciliation resolve |
| `Idempotency-Key` required | All `BillingCommandService` mutations |
| `lockVersion` | Subscription lifecycle transitions |
| Webhook signature verification | `POST /webhooks/stripe` |

---

## 3. Activation guard flow

```
POST /subscription/activate
        │
        ▼
BillingCommandService.claimCommand(idempotencyKey)     ← duplicate / race guard
        │
        ▼
BillingActivationGuardService.assertPreActivationContract()
   • reject if domainStatus === ACTIVE
   • reject if transition to ACTIVE not allowed
        │
        ▼
BillingActivationGuardService.syncStripeAndConfirmActivation()
   • require STRIPE_SECRET_KEY
   • StripeSubscriptionOrchestrator.sync (override domain → ACTIVE)
   • stripe.subscriptions.retrieve()
   • verify status ∈ { active, trialing, past_due }
        │
        ▼ (only on Stripe confirm)
SubscriptionLifecycleService.activate()               ← local ACTIVE commit
        │
        ▼
Outbox SUBSCRIPTION_ACTIVATED → async Stripe sync    ← idempotent follow-up
```

### Stripe confirmation statuses

| Stripe `subscription.status` | Accepted for activation |
|------------------------------|-------------------------|
| `active` | ✅ |
| `trialing` | ✅ (e.g. trial still winding down on provider) |
| `past_due` | ✅ (billable but payment retrying) |
| `incomplete`, `canceled`, `unpaid`, … | ❌ `BILLING_ACTIVATION_STRIPE_NOT_CONFIRMED` |

### Stripe not configured

If `STRIPE_SECRET_KEY` is absent → `501 BILLING_ACTIVATION_STRIPE_NOT_CONFIGURED`. Local `ACTIVE` is **not** committed via Master Admin activate/reactivate.

---

## 4. Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `BILLING_ACTIVATION_ALREADY_ACTIVE` | 409 | Duplicate activation attempt |
| `BILLING_ACTIVATION_INVALID_TRANSITION` | 409 | Lifecycle does not allow → ACTIVE from current state |
| `BILLING_ACTIVATION_STRIPE_NOT_CONFIGURED` | 501 | Stripe required but not configured |
| `BILLING_ACTIVATION_STRIPE_NOT_CONFIRMED` | 409 | Stripe subscription not in confirmed status after sync |
| `BILLING_ACTIVATION_STRIPE_SUBSCRIPTION_MISSING` | 409 | Orchestrator returned no Stripe subscription id |
| `BILLING_ACTIVATION_LEGACY_DIRECT_BLOCKED` | 409 | Legacy `POST /billing/subscriptions` blocked |
| `CONCURRENT_COMMAND_IN_PROGRESS` | 409 | Parallel command with same idempotency key |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | 409 | Same key, different payload |

---

## 5. Implementation files

| File | Role |
|------|------|
| `domain/billing-activation-guard.ts` | Pure guard rules + error codes |
| `billing-activation-guard.service.ts` | Pre-checks + Stripe sync-then-verify |
| `billing-subscription-admin.service.ts` | `activate` / `reactivate` call guard before lifecycle |
| `stripe-subscription-orchestrator.service.ts` | `contractDomainStatusOverride`, `idempotencyKeySuffix`, end trial on activate |
| `billing.service.ts` | Legacy direct create blocked |
| `domain/stripe-subscription-orchestrator.ts` | Idempotency key suffix support |

---

## 6. Orchestrator changes

- **`contractDomainStatusOverride`** — push Stripe params as if contract were `ACTIVE` (no `trial_end` on new subs; end trial with `trial_end: 'now'` when updating trialing subs)
- **`idempotencyKeySuffix`** — ties Stripe API idempotency to command idempotency key (safe replay)

---

## 7. Remaining considerations

| Item | Status |
|------|--------|
| Trial configure (`POST /trial`) | Sets `TRIALING` only — no Stripe confirmation required for trial start (see `trial-model.md`) |
| Entitlements | Still read local contract; activation guard ensures ACTIVE is Stripe-backed |
| Async listener double-sync | Idempotent; runs after local commit as reconciliation follow-up |
| `updateSubscriptionStatus()` internal | Not exposed via HTTP; webhooks use `applyStripeSubscription` |

---

## 8. Tests

- `domain/billing-activation-guard.spec.ts`
- `billing-activation-guard.service.spec.ts`
- `billing-subscription-admin.service.spec.ts` (updated constructor)

Run:

```bash
cd backend && npm test -- --testPathPattern="billing-activation-guard|billing-subscription-admin"
```

---

**Changes:** Updated (`ChangesView.tsx`, V4.9.886).  
**Architektur:** Updated (`ArchitekturView.tsx`, `architecture/MASTER_ADMIN_BILLING_GUARDS_2026-07-26.md`).
