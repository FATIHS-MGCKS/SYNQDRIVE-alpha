# Master Admin Remediation — Phase 2B.2: Stripe Environment Separation

**Date:** 2026-07-26  
**Status:** Implemented (backend guards + documentation)  
**Scope:** SynqDrive platform Stripe integration (billing subscriptions + Connect end-customer payments)

---

## 1. Executive summary

SynqDrive uses a **single platform Stripe secret key** (`STRIPE_SECRET_KEY`) for both:

- **Billing** — SynqDrive SaaS subscriptions (`modules/billing`)
- **Connect** — End-customer rental payments (`modules/payments`)

Before this remediation, mode detection existed in several places (DB `stripe_mode` columns, webhook livemode checks, reconciliation drift) but **production could start with `sk_test_*`** because there was no centralized fail-fast guard.

Phase 2B.2 introduces a **canonical Stripe environment layer** that:

1. Derives runtime mode from the secret key prefix (`sk_test_` / `sk_live_`)
2. Optionally cross-checks `STRIPE_ENVIRONMENT`
3. **Refuses production startup** when test keys are configured (unless an explicit escape hatch is set)
4. Rejects webhook events whose `livemode` flag does not match the runtime key mode
5. Centralizes mode helpers used by billing reconciliation and catalog mapping

**Goal:** Production must never accidentally process test Stripe data.

---

## 2. Inventory — Stripe configuration surfaces

### 2.1 Environment variables

| Variable | Purpose | Test vs Live |
|----------|---------|--------------|
| `STRIPE_SECRET_KEY` | Platform API key | `sk_test_*` vs `sk_live_*` — **canonical mode source** |
| `STRIPE_WEBHOOK_SECRET` | Billing webhook signing secret | Dashboard endpoint must match key mode |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect webhook signing secret | Separate endpoint; must match key mode |
| `STRIPE_ENVIRONMENT` | **New** explicit guard (`test` / `live`) | Must match secret key prefix |
| `STRIPE_ALLOW_TEST_IN_PRODUCTION` | **New** escape hatch (`true` only for prod sandboxes) | Default `false` |
| `STRIPE_DEFAULT_PRICE_ID` | Legacy fallback price | Test/live price IDs differ in Stripe |
| `STRIPE_CURRENCY` | Default currency (`eur`) | Mode-agnostic |
| `STRIPE_CUSTOMER_PORTAL_RETURN_URL` | Portal return URL | Mode-agnostic |
| `STRIPE_CONNECT_*` URLs | Connect onboarding / checkout redirects | Mode-agnostic |

**Not in env (by design):** Customer IDs, Product IDs, Price IDs for catalog — stored in DB with `stripe_mode` on mapping tables.

### 2.2 Code modules

| Area | Path | Mode handling (before → after) |
|------|------|--------------------------------|
| Config load | `backend/src/config/stripe.config.ts` | Partial → **fail-fast** via `validateStripeEnvironmentOrThrow` |
| Environment service | `backend/src/shared/stripe/stripe-environment.*` | **New** global Nest module |
| Billing Stripe client | `backend/src/modules/billing/stripe-client.util.ts` | No guard → validates on client creation |
| Billing webhooks | `backend/src/modules/billing/stripe-webhook.service.ts` | Inline livemode check → `StripeEnvironmentService` |
| Connect webhooks | `backend/src/modules/payments/stripe-connect-webhook.service.ts` | `inferStripeLiveMode` → `StripeEnvironmentService` |
| Connect client | `backend/src/modules/payments/stripe/stripe-connect-client.util.ts` | Prefix check → shared `resolveStripeModeFromSecretKey` |
| Catalog mapping | `backend/src/modules/billing/domain/stripe-catalog-mapping.ts` | `assertRuntimeStripeMode` (unchanged contract) |
| Reconciliation | `backend/src/modules/billing/domain/billing-reconciliation.ts` | Local livemode helper → shared util |
| Legacy backfill | `backend/src/modules/billing/migration/billing-legacy-backfill.util.ts` | Re-exports shared key resolver |
| Sandbox E2E scripts | `backend/scripts/ops/stripe-*`, `stripe-sandbox.fixture.util.ts` | Already reject `sk_live_*` in sandbox |

### 2.3 Database — `stripe_mode` / `BillingStripeMode`

Tenant-scoped billing records carry explicit mode:

- `billing_subscriptions.stripe_mode`
- `billing_subscription_items.stripe_mode`
- `billing_invoices.stripe_mode`
- `billing_payments.stripe_mode`
- `billing_payment_methods.stripe_mode`
- `billing_discounts.stripe_mode`
- `stripe_catalog_mappings.stripe_mode`
- `stripe_webhook_events` (via event `livemode` at ingest)

Reconciliation emits `TEST_LIVE_MODE_CONFLICT` when local `stripe_mode` ≠ runtime key mode.

### 2.4 Webhooks

| Route | Secret env | Events |
|-------|------------|--------|
| `POST /api/v1/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` | Billing: subscriptions, invoices, payment methods |
| `POST /api/v1/webhooks/stripe-connect` | `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect: checkout, payment_intent, refunds |

Both paths now reject events where `event.livemode` ≠ runtime mode derived from `STRIPE_SECRET_KEY`.

### 2.5 Connect (end-customer payments)

- Uses the **same** `STRIPE_SECRET_KEY` as billing (platform key).
- MVP phase guard `assertConnectTestModeOnly()` still blocks **Connect account operations** with live keys — separate from billing production cutover; documented in `architecture/STRIPE_CONNECT_VERIFICATION_DECISION_2026-07-14.md`.
- Webhook livemode separation is now aligned with billing via shared service.

### 2.6 Customer / Product / Price IDs

| ID type | Storage | Mode separation |
|---------|---------|-----------------|
| Stripe Customer ID | `billing_subscriptions.stripe_customer_id` | Scoped by org + `stripe_mode` on subscription |
| Stripe Product ID | `stripe_catalog_mappings.stripe_product_id` | Row-level `stripe_mode` |
| Stripe Price ID | `stripe_catalog_mappings.stripe_price_id` | Row-level `stripe_mode`; unique per mode |
| Legacy default price | `STRIPE_DEFAULT_PRICE_ID` env | Must match runtime mode; catalog service calls `assertRuntimeStripeMode` |

---

## 3. Environment detection — canonical rules

### 3.1 Resolution order

```
1. STRIPE_SECRET_KEY prefix → TEST (sk_test_) or LIVE (sk_live_)
2. STRIPE_ENVIRONMENT (optional) → must match step 1 when set
3. NODE_ENV=production → requires LIVE unless STRIPE_ALLOW_TEST_IN_PRODUCTION=true
```

### 3.2 Fail-fast points

| When | What happens |
|------|----------------|
| `stripe.config.ts` load | `validateStripeEnvironmentOrThrow` if key present |
| `StripeEnvironmentService.onModuleInit` | Re-validates and logs locked mode |
| `getStripeClient()` | Validates before Stripe SDK instantiation |
| Webhook ingest (billing + connect) | `assertWebhookLivemode` — throws on mismatch |
| Catalog price resolve | `assertRuntimeStripeMode` — mapping mode vs runtime |

### 3.3 Error codes

| Code | Meaning |
|------|---------|
| `STRIPE_TEST_KEY_IN_PRODUCTION` | `NODE_ENV=production` + `sk_test_*` without override |
| `STRIPE_EXPLICIT_ENV_MISMATCH` | `STRIPE_ENVIRONMENT` disagrees with key prefix |
| `STRIPE_LIVE_KEY_REQUIRED_IN_PRODUCTION` | Production without live key / invalid key format |
| `STRIPE_WEBHOOK_LIVEMODE_MISMATCH` | Webhook `livemode` ≠ runtime |
| `STRIPE_RESOURCE_MODE_MISMATCH` | DB resource `stripe_mode` ≠ runtime (runtime assert helper) |

---

## 4. Production vs test deployment checklist

### Test / staging

```env
NODE_ENV=development   # or staging
STRIPE_SECRET_KEY=sk_test_...
STRIPE_ENVIRONMENT=test   # recommended
STRIPE_WEBHOOK_SECRET=whsec_...   # from Stripe Dashboard → Test mode endpoint
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

### Production

```env
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_ENVIRONMENT=live   # required best practice
STRIPE_ALLOW_TEST_IN_PRODUCTION=false   # never set true on real prod
STRIPE_WEBHOOK_SECRET=whsec_...   # Live mode endpoint
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

**VPS:** Secrets live in `/opt/synqdrive/env/backend.env` (not in git). After changing keys, redeploy and confirm startup log:

```
Stripe environment locked: runtime=LIVE nodeEnv=production
```

---

## 5. What this does *not* solve (follow-ups)

| Gap | Owner phase | Notes |
|-----|-------------|-------|
| Connect MVP blocks live keys for account creation | Connect go-live | `assertConnectTestModeOnly` — intentional until Connect production readiness |
| Separate test/live DB rows from wrong-era backfill | 2B.3+ reconciliation | Use `TEST_LIVE_MODE_CONFLICT` drift + admin tooling |
| Stripe Dashboard webhook endpoint provisioning | Ops | Manual; MCP cannot list endpoints |
| Frontend Stripe publishable key | N/A today | Backend-only integration; no `pk_` in frontend env |

---

## 6. Files changed (implementation)

| File | Change |
|------|--------|
| `backend/src/shared/stripe/stripe-environment.util.ts` | Core resolution + validation |
| `backend/src/shared/stripe/stripe-environment.service.ts` | Nest global service |
| `backend/src/shared/stripe/stripe-environment.module.ts` | `@Global()` module |
| `backend/src/shared/stripe/stripe-environment.util.spec.ts` | Unit tests |
| `backend/src/config/stripe.config.ts` | Fail-fast + new config fields |
| `backend/src/app.module.ts` | Import `StripeEnvironmentModule` |
| `backend/src/modules/billing/stripe-client.util.ts` | Validate on client create |
| `backend/src/modules/billing/stripe-webhook.service.ts` | Use environment service |
| `backend/src/modules/payments/stripe-connect-webhook.service.ts` | Use environment service |
| `backend/src/modules/payments/stripe/stripe-connect-client.util.ts` | Shared key resolver |
| `backend/src/modules/billing/domain/billing-reconciliation.ts` | Shared livemode helper |
| `backend/.env.example` | Document new env vars |

---

## 7. Verification

```bash
cd backend
npm test -- stripe-environment.util.spec.ts
npm test -- stripe-connect-webhook.service.spec.ts
npm test -- stripe-webhook.service.spec.ts
```

**Manual:** Start backend with `NODE_ENV=production` and `STRIPE_SECRET_KEY=sk_test_...` — process must exit during config/module init with `STRIPE_TEST_KEY_IN_PRODUCTION`.

---

## 8. Architecture alignment

- Preserves **Stripe as external runtime truth** (Phase 2B.1) while hardening **which** Stripe universe (test vs live) the process operates in.
- DB `stripe_mode` columns remain the per-record mode marker for reconciliation; runtime mode comes only from the secret key (+ optional `STRIPE_ENVIRONMENT`).

**Changes / Architektur:** Updated in SynqDrive Master UI (`ChangesView`, `ArchitekturView`).
