# Master Admin Remediation — Phase 2B.6: Trial Model

**Date:** 2026-07-26  
**Status:** Documented (analysis + canonical definitions)  
**Scope:** SynqDrive SaaS billing — Stripe trial vs internal contract trial vs Master Admin manual trial

---

## 1. Executive summary

SynqDrive operates **one canonical contract trial** on `billing_subscriptions` (`BillingSubscription`). What looks like three “trial types” are really **three layers**:

| Layer | What it is | Source of truth |
|-------|------------|-----------------|
| **Internal trial** | Commercial contract state `TRIALING` with `trialStartAt` / `trialEndAt` | **Local DB** (`BillingSubscription` + base `BillingSubscriptionItem`) |
| **Manual trial** | **How** the internal trial is activated — Master Admin configures dates and price | Master Admin command `configureTrial` → `startTrial()` |
| **Stripe trial** | Payment-provider projection (`subscription.status = trialing`, `trial_end`) | **Derived from local contract** when Stripe sync runs |

**Local contract is always the commercial truth.** Stripe trial is a mirror for billing collection, not the authority for entitlements or trial end dates.

**Out of scope for this document (separate products):**

- Legacy `organization_products.status = TRIAL` (pre–billing-contract licenses)
- `VoiceSubscription` with `trialEndsAt` (Voice add-on billing)

---

## 2. When does each trial type exist?

### 2.1 Decision matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Trial existence decision tree                         │
└─────────────────────────────────────────────────────────────────────────────┘

Master Admin: draft → assign plan → configureTrial(trialEndAt, priceVersionId)
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │   INTERNAL TRIAL       │
                         │   domain: TRIALING     │
                         │   trialStartAt set     │
                         │   trialEndAt set       │
                         │   base item TRIALING   │
                         └───────────┬────────────┘
                                     │
              configureTrial path ───┤─── also MANUAL TRIAL (activation channel)
                                     │
                         STRIPE_SECRET_KEY set?
                           │              │
                          yes             no
                           │              │
                           ▼              ▼
              syncOrganizationSubscription   No Stripe trial
              + future trialEndAt            (internal trial only)
                           │
                           ▼
                    STRIPE TRIAL
              stripeSub.status = trialing
              stripeSub.trial_end = f(trialEndAt)
```

### 2.2 Internal trial (contract trial)

**Exists when** all of the following are true:

| Condition | Field / rule |
|-----------|--------------|
| Open subscription | `billing_subscriptions.ended_at IS NULL`, status ≠ `CANCELLED` |
| Prisma status | `status = TRIALING` |
| Trial window set | `trial_start_at IS NOT NULL` **and** `trial_end_at IS NOT NULL` |
| Base plan assigned | `billing_subscription_items` with `item_role = BASE_PLAN`, `status = TRIALING` |
| Domain resolution | `resolveSubscriptionDomainStatus()` → `TRIALING` (not `DRAFT`) |

**Does NOT exist when** (common false positives):

| Situation | Resolved domain status | Why |
|-----------|------------------------|-----|
| Fresh draft only | `DRAFT` | `createDraft()` writes Prisma `TRIALING` but **without** `trialStartAt`/`startedAt` and base item still `DRAFT` → domain maps to `DRAFT` |
| Stripe bootstrap row | `DRAFT` or ambiguous | `StripeBillingService.ensurePrimarySubscriptionRecord()` creates `TRIALING` row with **no** trial dates when ensuring Stripe customer only |
| Trial dates missing | Not entitling | `startTrial()` always sets both dates; without them, entitlements treat contract as inactive draft |

**Entitlements:** `resolveEntitlementAccess()` grants `TRIALING` access while domain status is `TRIALING` and base item is entitling. `validTo` = `trialEndAt`.

**Code anchors:**

- Domain status: `backend/src/modules/billing/domain/subscription-lifecycle.ts` (`resolveSubscriptionDomainStatus`)
- Lifecycle: `backend/src/modules/billing/subscription-lifecycle.service.ts` (`startTrial`)
- Entitlements: `backend/src/modules/billing/domain/billing-entitlements.ts` (`resolveEntitlementAccess`)

### 2.3 Manual trial (Master Admin activation channel)

**Exists when** internal trial exists **and** it was activated through the Master Admin billing command path.

| Property | Value |
|----------|-------|
| API | `POST /admin/billing/organizations/:orgId/subscription/trial` |
| Guard | `MasterBillingGuard` + `@RequireMasterBilling()` |
| Command | `BillingCommandType.MASTER_SUBSCRIPTION_CONFIGURE_TRIAL` |
| Service chain | `BillingSubscriptionAdminService.configureTrial()` → `SubscriptionLifecycleService.startTrial()` |
| Audit | `MASTER_SUBSCRIPTION_TRIAL_CONFIGURED` |
| Idempotency | Required `Idempotency-Key` header |
| UI | `BillingOrgDetailDrawer.tsx` — trial end date + price version |

**Manual trial is not a separate DB state.** It is the **only implemented activation path** for a real internal trial today. There is no self-service or automated signup trial flow on the modern billing contract.

**Payload requirements:**

- `priceVersionId` — must reference a non-archived, activatable price version
- `trialEndAt` — ISO datetime; defines contract end of trial window
- Optional `priceBookId`, `lockVersion`

**Prerequisite flow:** `createDraft` → `assign-rental` or `assign-fleet` → `trial` (or skip trial and `activate` directly from `DRAFT`).

### 2.4 Stripe trial (payment provider projection)

**Exists when** all of the following are true:

| Condition | Detail |
|-----------|--------|
| Stripe configured | `STRIPE_SECRET_KEY` present; `StripeBillingService.isStripeConfigured()` |
| Internal trial active | Domain `TRIALING` with **future** `trialEndAt` |
| Subscription synced | `StripeSubscriptionOrchestratorService.syncOrganizationSubscription()` ran successfully |
| Stripe subscription row | `billing_subscriptions.stripe_subscription_id` set |
| Stripe API state | `subscription.status === 'trialing'` |
| Trial end on Stripe | `subscription.trial_end` = `resolveTrialEndUnix(trialEndAt)` |

**Does NOT exist when:**

- Stripe not configured → internal/manual trial can still grant access; reconciliation flags `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE` for `TRIALING` contracts
- `trialEndAt` in the past → `resolveTrialEndUnix()` returns `undefined`; Stripe subscription created/updated **without** `trial_end`
- Contract already `ACTIVE` → orchestrator passes `trial_end: null` on updates
- Stripe subscription created outside orchestrator without local trial dates

**Direction of truth:**

```
Local trialEndAt  ──sync──►  Stripe trial_end
                ◄──status only──  Stripe webhooks (applyStripeSubscription)
```

- **Push:** `createStripeSubscription` / `updateStripeSubscription` set `trial_end` from local `trialEndAt` when domain status is `TRIALING`.
- **Pull:** `applyStripeSubscription()` updates local `status`, period boundaries, `cancelAtPeriodEnd` from Stripe — but **does not** write `trialStartAt` / `trialEndAt` from Stripe.

**Stripe notifications:**

- Webhook `customer.subscription.trial_will_end` → outbox `TRIAL_ENDING` → billing email (“Testphase endet bald”)
- Payload uses Stripe `trial_end`; email context falls back to local `trialEndAt` when available

**Code anchors:**

- `resolveTrialEndUnix`: `domain/stripe-subscription-orchestrator.ts`
- Orchestrator: `stripe-subscription-orchestrator.service.ts`
- Webhook: `stripe-webhook-dispatcher.service.ts` (`handleTrialWillEndEvent`)
- Stripe → local status mirror: `stripe-billing.service.ts` (`applyStripeSubscription`)

---

## 3. Lifecycle operations by trial type

Legend: ✅ supported · ⚠️ partial / implicit · ❌ not supported / blocked · — not applicable

### 3.1 Activation

| Trial type | How activated | Preconditions | Result |
|------------|---------------|---------------|--------|
| **Internal** | `SubscriptionLifecycleService.startTrial()` | Base plan assigned; valid `priceVersionId`; transition `DRAFT → TRIALING` or `INCOMPLETE → TRIALING` | `trialStartAt = now`, `trialEndAt = input`, base item `TRIALING`, outbox lifecycle event |
| **Manual** | Master Admin `POST …/trial` | Same as internal + idempotency key + Master billing permission | Same DB state; audit `MASTER_SUBSCRIPTION_TRIAL_CONFIGURED` |
| **Stripe** | Automatic on `syncOrganizationSubscription` after internal trial exists | Stripe customer + price mappings + future `trialEndAt` | Stripe `trialing` + `trial_end`; local mapping persisted |

**Alternate path (no trial):** Master Admin can `activate` directly from `DRAFT → ACTIVE`, skipping trial entirely.

### 3.2 Expiry (Ablauf)

| Trial type | Mechanism | Post-expiry behavior |
|------------|-----------|----------------------|
| **Internal** | ⚠️ **No dedicated expiry worker** | Domain status stays `TRIALING` until explicit `activate` or other transition. Entitlement resolver does **not** compare `asOf` to `trialEndAt` — access may remain `active: true` after calendar trial end |
| **Manual** | Same as internal | Same gap — manual trial end date is informational in UI/overview (`tenant-subscription-overview` shows `nextChargeAt = trialEndsAt`) but not enforced by lifecycle |
| **Stripe** | Stripe ends `trialing` at `trial_end` | Stripe moves to `active` (if payment method) or `past_due` / `incomplete`; webhook `customer.subscription.updated` → `applyStripeSubscription` may set local status to `ACTIVE`/`PAST_DUE` **without** calling `activate()` on lifecycle |

**Implication:** Calendar trial expiry is **not** fully automated on the contract layer. Operational expectation today: Master Admin runs `activate` before or at trial end, or accepts Stripe-driven status mirror when billing sync is active.

### 3.3 Extension (Verlängerung)

| Trial type | Mechanism | Notes |
|------------|-----------|-------|
| **Internal** | ⚠️ Re-call `startTrial()` with new `trialEndAt` while already `TRIALING` | `assertTransitionAllowed(TRIALING, TRIALING)` is a no-op (same status allowed); `trialStartAt` reset to `now` on each call |
| **Manual** | Re-run `POST …/trial` with later `trialEndAt` | Same as internal; new audit entry |
| **Stripe** | Re-sync after local `trialEndAt` update | `updateStripeSubscription` sets new `trial_end` if still `TRIALING` and date in future |

**Gap:** No dedicated `extendTrial` command; extension is implicit via re-configure. Re-config resets `trialStartAt` to now (may affect reporting).

### 3.4 Upgrade (plan / price change during trial)

| Trial type | Mechanism | Notes |
|------------|-----------|-------|
| **Internal** | `scheduleTariffChange` / `schedulePriceVersionChange` on base item | Creates scheduled replacement item; does not change subscription domain status from `TRIALING` |
| **Manual** | Master Admin schedule endpoints | Same |
| **Stripe** | Next `syncOrganizationSubscription` | Pushes new Stripe prices; `trial_end` preserved while domain still `TRIALING` |

**Paid upgrade path:** `activate` (`TRIALING → ACTIVE`) is the canonical transition to paid contract — typically with chosen `priceVersionId` and optional Stripe sync for first invoice.

### 3.5 Downgrade

| Trial type | Mechanism | Notes |
|------------|-----------|-------|
| **Internal** | ❌ No `ACTIVE → TRIALING` or trial downgrade transition | `ALLOWED_TRANSITIONS`: `TRIALING → [ACTIVE]` only |
| **Manual** | ❌ Cannot revert paid org to trial via API | Would require new subscription / manual DB intervention |
| **Stripe** | ❌ Orchestrator only sets `trial_end` when **local** domain is `TRIALING` | Once local `ACTIVE`, Stripe trial is not re-applied |

### 3.6 Cancellation (Kündigung)

| Trial type | Mechanism | Notes |
|------------|-----------|-------|
| **Internal** | ⚠️ `scheduleCancelAtPeriodEnd` requires domain transition to `CANCEL_SCHEDULED` | **Blocked from `TRIALING`** — `ALLOWED_TRANSITIONS` does not include `TRIALING → CANCEL_SCHEDULED` |
| **Manual** | `POST …/cancel` during trial | Will throw `INVALID_TRANSITION` while status is `TRIALING` |
| **Internal** | `cancelImmediately` with `allowImmediateCancel: true` | Works if caller passes flag (Master Admin immediate cancel path); sets `CANCELLED` |
| **Stripe** | `cancel_at_period_end` on Stripe subscription | Local mirror via webhook; during `trialing`, Stripe may end trial on cancel depending on API params |

**Practical trial stop today:**

1. Master Admin **immediate cancel** (if exposed with `allowImmediateCancel`)
2. Let trial calendar expire without enforcement (entitlement gap)
3. **Activate** to convert to paid, then schedule cancel on active contract

---

## 4. State machine (contract layer)

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
           configureTrial│      │activate (skip trial)
                         ▼      ▼
                    ┌──────────┐     activate      ┌────────┐
                    │ TRIALING │ ────────────────► │ ACTIVE │
                    └──────────┘                   └───┬────┘
                         │                             │
              (no cancel  │                             │ scheduleCancel
               schedule)  │                             ▼
                         │                      ┌─────────────────┐
                         │                      │ CANCEL_SCHEDULED│
                         │                      └────────┬────────┘
                         │                               │
                         └───────────────────────────────┴──► CANCELLED
```

Allowed transitions (`subscription-lifecycle.ts`):

- `DRAFT → TRIALING | ACTIVE`
- `TRIALING → ACTIVE`
- `ACTIVE → PAST_DUE | PAUSED | CANCEL_SCHEDULED`
- No return to `TRIALING`

---

## 5. Legacy trial (`organization_products`)

Separate from the billing contract:

| Aspect | Legacy | Modern contract |
|--------|--------|-----------------|
| Table | `organization_products` | `billing_subscriptions` |
| Status | `OrgProductStatus.TRIAL` | `BillingStatus.TRIALING` |
| Expiry | `expires_at` column exists | `trial_end_at` on subscription |
| SoT | **Not** entitlement SoT (`entitlement-migration.registry.ts`) | **Yes** — `BillingEntitlementResolver` |
| Activation API | `ProductsService.assignProduct` always sets `ACTIVE` | `configureTrial` |
| Still read by | `EntitlementResolverService` (legacy merge), `billing.service` summaries, `ProductLicenseGuard` (ACTIVE only) | Primary path |

Legacy `TRIAL` rows may still grant features via `EntitlementResolverService.entitlementsFromLegacyLicenses()` until backfill/migration completes. **Do not conflate with manual/Stripe trial.**

---

## 6. Reconciliation & observability

| Signal | Behavior |
|--------|----------|
| `TRIALING` without `stripe_subscription_id` | Reconciliation drift `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE` (WARNING) |
| Stripe `trialing` vs local `ACTIVE` | `STATUS_MISMATCH` drift |
| Trial ending soon | Stripe webhook → `TRIAL_ENDING` email |
| Master overview | `TenantSubscriptionOverviewService` — `trialEndsAt`, `nextChargeAt` when trialing |

---

## 7. Known gaps (remediation backlog)

| ID | Gap | Risk | Suggested direction |
|----|-----|------|---------------------|
| G1 | No worker to transition `TRIALING → INACTIVE/CANCELLED` at `trialEndAt` | Access may continue after trial | Entitlement check `asOf > trialEndAt` and/or scheduled lifecycle job |
| G2 | Entitlements ignore elapsed `trialEndAt` | Same as G1 | Add date guard in `resolveEntitlementAccess` for `TRIALING` |
| G3 | `scheduleCancel` blocked during `TRIALING` | Cannot gracefully end trial with notice | Allow `TRIALING → CANCEL_SCHEDULED` with `cancelAt = trialEndAt` |
| G4 | `applyStripeSubscription` overwrites local `status` but not trial dates | Stripe/local status divergence around trial end | Define policy: lifecycle owns contract dates; Stripe owns payment state only |
| G5 | Re-`configureTrial` resets `trialStartAt` | Reporting distortion | Dedicated `extendTrial` preserving original start |
| G6 | Legacy `OrganizationProduct.TRIAL` parallel path | Double entitlement sources | Complete backfill; retire legacy reads |

---

## 8. File reference

| Area | Path |
|------|------|
| Lifecycle service | `backend/src/modules/billing/subscription-lifecycle.service.ts` |
| Lifecycle domain / transitions | `backend/src/modules/billing/domain/subscription-lifecycle.ts` |
| Master Admin API | `backend/src/modules/billing/master-subscription.controller.ts` |
| Admin commands | `backend/src/modules/billing/billing-subscription-admin.service.ts` |
| Entitlements | `backend/src/modules/billing/domain/billing-entitlements.ts` |
| Stripe orchestrator | `backend/src/modules/billing/stripe-subscription-orchestrator.service.ts` |
| Stripe trial unix | `backend/src/modules/billing/domain/stripe-subscription-orchestrator.ts` |
| Stripe status mirror | `backend/src/modules/billing/stripe-billing.service.ts` |
| Webhook trial_will_end | `backend/src/modules/billing/stripe-webhook-dispatcher.service.ts` |
| Tenant overview | `backend/src/modules/billing/tenant-subscription-overview.service.ts` |
| Master UI | `frontend/src/master/components/billing/BillingOrgDetailDrawer.tsx` |
| Prisma | `billing_subscriptions.trial_start_at`, `trial_end_at` |
| Legacy | `organization_products.status`, `expires_at` |

---

## 9. Summary definitions

| Term | One-line definition |
|------|---------------------|
| **Internal trial** | `BillingSubscription` in domain status `TRIALING` with `trialStartAt`/`trialEndAt` and trialing base item — **commercial SoT** |
| **Manual trial** | Internal trial activated exclusively via Master Admin `configureTrial` (today’s only activation path) |
| **Stripe trial** | Stripe `trialing` subscription with `trial_end` mirrored from local `trialEndAt` after orchestrator sync — **payment projection** |

**Changes:** Updated (this document).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_TRIAL_MODEL_2026-07-26.md`, `ArchitekturView`).
