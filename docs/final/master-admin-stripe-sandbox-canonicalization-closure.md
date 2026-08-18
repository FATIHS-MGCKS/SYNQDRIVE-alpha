# Master Admin — Stripe Sandbox Canonicalization & Billing Acceptance

| Feld | Wert |
|------|------|
| **Task** | Stripe Sandbox Canonicalization & Billing Acceptance |
| **Datum (UTC)** | 2026-08-18 |
| **Production Release** | `20260818222804_v4994` (`e25a7ffd`) |
| **Operator Decision** | Stripe Live cutover **intentionally deferred** until full SynqDrive software go-live readiness |
| **MA-BILL-P0-001** | **CLOSED FOR CURRENT SANDBOX OPERATING MODE** |
| **STRIPE-LIVE-CUTOVER-DEFERRED** | **DEFERRED BY OPERATOR** |

---

## 1. Operator Decision

SynqDrive Production continues to run **Stripe TEST/Sandbox** billing (`STRIPE_ENVIRONMENT=test`, `STRIPE_ALLOW_TEST_IN_PRODUCTION=true`, `sk_test_*`). This is an **operator-approved temporary state** for the pre–real-payment software phase.

- No live keys, live webhooks, live customers, live subscriptions, or live products/prices were created.
- `NOT READY FOR LIVE CUTOVER` remains documented as a **future go-live gate**, not a current production defect.
- `STRIPE_ALLOW_TEST_IN_PRODUCTION=true` is **not** treated as an error in the current operating mode.

---

## 2. Sandbox Architecture

| Layer | Mode | Evidence |
|-------|------|----------|
| Application (`NODE_ENV`) | `production` | PM2 `synqdrive` |
| Stripe runtime | **TEST** | Boot log: `Stripe environment locked: runtime=TEST nodeEnv=production` |
| Billing webhook | **TEST** | Endpoint `https://app.synqdrive.eu/api/v1/webhooks/stripe`, `livemode:false` |
| Connect webhook | **TEST** | Separate endpoint (unchanged) |
| Catalog mappings | **TEST** | 2 rows (`RENTAL`, `FLEET`) |
| Reconciliation scheduler | **TEST** | Latest runs `COMPLETED`, `stripe_mode=TEST`, `driftCount=0` |

---

## 3. Environment Conflict Remediation

| Finding | Before | After | Method |
|---------|--------|-------|--------|
| `TEST_LIVE_MODE_CONFLICT` | Subscription `55cb95d9-…` had `stripe_mode=LIVE` at TEST runtime | `stripe_mode=TEST` | `BillingSandboxCanonicalizationService` verified Stripe customer `livemode:false`, updated local mode |

Stripe customer `cus_UsXKh8lxDP3UAv` confirmed **testmode** — no live Stripe resource mutation.

---

## 4. Test Billing Webhook

| Check | Result |
|-------|--------|
| `STRIPE_WEBHOOK_SECRET` | **SET** (runtime secret in `shared/backend.env`, not in git) |
| Stripe TEST endpoint | Created for `/api/v1/webhooks/stripe` with 23 billing lifecycle events |
| DB ingest | **5** `stripe_webhook_events` rows after remediation |
| Signature verification | Enabled via existing `StripeWebhookService` |

Ops: `npm run billing:sandbox:ensure-webhook` (VPS, root/sudo).

---

## 5. Catalog / Price Mappings

Production had **zero** price books and mappings. Remediation:

1. `npm run billing:sandbox:bootstrap-catalog -- --execute` — created RENTAL + FLEET price books, published sandbox tiers (EUR 24,99 / vehicle / month), synced to Stripe TEST.
2. Result: **2** `billing_stripe_catalog_mappings`, matching TEST products/prices.

| Product | Stripe TEST Product | Stripe TEST Price |
|---------|--------------------|--------------------|
| RENTAL | `prod_V67bMDa3gXfVpF` | `price_1U5vLrKTcW1K1ahf89MXLcSC` |
| FLEET | `prod_V67bjQDMRZy1RY` | `price_1U5vLtKTcW1K1ahfmxaSKOAp` |

Addons (`VOICE_AGENT`, `AI_PACKAGE`, `WHATSAPP`) remain **without price books** — not billing-activated in catalog; documented as out of scope for this acceptance pass.

---

## 6. Customer Mappings

| Org | Classification | Stripe Customer | Mode |
|-----|----------------|-----------------|------|
| F.S Mobility Service | TEST customer mapped | `cus_UsXKh8lxDP3UAv` | TEST |
| Voice Staging E2E | No billing subscription | — | — |
| Data Auth PG Org A/B | Test data, no billing | — | — |

---

## 7. Subscription Mappings

| Org | Local Status | Stripe Subscription | Mode | Result |
|-----|-------------|---------------------|------|--------|
| F.S Mobility Service | `ACTIVE` (synced from TRIALING) | `sub_1U5veXKTcW1K1ahffGAzRuT9` | TEST | **SYNCED** |

Remediation path:

1. DB trigger fix migration `20260818223000_fix_billing_subscription_item_trigger` (ambiguous `product_role` in PL/pgSQL)
2. `backfill-billing-legacy.ts --execute --organization-id=faa710c9-…` — RENTAL base plan item
3. `billing-sandbox:canonicalize --execute` — Stripe subscription orchestrator sync

---

## 8. Trial Canonicalization

Canonical model (`detectBillingReconciliationDrift`): `TRIALING` / `ACTIVE` / `PAST_DUE` **require** a Stripe subscription reference.

- F.S Mobility was `TRIALING` with customer but no subscription → `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE`.
- After backfill + orchestrator sync: Stripe TEST subscription created (no real charge path in test mode), local subscription `ACTIVE`, item still `TRIALING` until webhook/lifecycle projection catches up.
- Reconciliation dry-run after remediation: **0 drifts**.

---

## 9. Reconciliation

| Capability | Status |
|------------|--------|
| Dry-run mode | **Implemented** — `POST /admin/billing/reconciliation/run` with `{ "dryRun": true }` |
| Dry-run after remediation | `scanned=1`, `driftCount=0`, `errorCount=0` |
| Mutating run | `COMPLETED`, `stripe_mode=TEST`, `driftCount=0` |
| Stale open drift rows | **4 resolved** post-remediation (historical records from pre-fix state) |

---

## 10. Scheduler

Latest reconciliation runs (post-remediation):

| Run | Status | stripe_mode | driftCount | scanned |
|-----|--------|-------------|------------|---------|
| Latest | `COMPLETED` | TEST | 0 | 1 |
| Previous | `COMPLETED` | TEST | 0 | 1 |

Pre-remediation: 2 drifts/run (`TEST_LIVE_MODE_CONFLICT`, `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE`).

---

## 11. Sandbox E2E

Controlled acceptance on production stack (TEST only):

1. Bootstrap TEST catalog (RENTAL/FLEET)
2. Legacy backfill for F.S Mobility (RENTAL)
3. Stripe TEST subscription sync
4. Webhook events ingested (5 events)
5. Reconciliation dry-run → 0 drifts

No live APIs. No real payments.

---

## 12. Source of Truth

| Dimension | Stripe Sandbox | Backend | Master Admin |
|-----------|---------------|---------|--------------|
| Environment | TEST | TEST | TEST context available |
| Customer | `cus_UsXKh8lxDP3UAv` | Mapped | Billing org row |
| Subscription | `sub_1U5veXKTcW1K1ahffGAzRuT9` | Mapped, `SYNCED` | Operational APIs |
| Catalog | 2 TEST products/prices | 2 mappings | Pricebook admin |
| Payment health | TEST mode only | No live charges | N/A |

---

## 13. Environment Safety

- Production app environment: `production`
- Stripe billing environment: **TEST** (deliberate, operator-approved)
- Fail-closed guards remain: `STRIPE_ENVIRONMENT=test` blocks accidental `sk_live_*` activation
- `STRIPE_ALLOW_TEST_IN_PRODUCTION=true` documented as controlled sandbox escape hatch — **not removed**

---

## 14. S1–S10 Sandbox Acceptance Gates

| Gate | Name | Status |
|------|------|--------|
| **S1** | Environment consistency | **PASS** |
| **S2** | Test credentials | **PASS** |
| **S3** | Test products/prices | **PASS** (RENTAL/FLEET; addons not price-booked) |
| **S4** | Test billing webhook | **PASS** |
| **S5** | Customer mappings | **PASS** |
| **S6** | Subscription mappings | **PASS** |
| **S7** | Trial consistency | **PASS** |
| **S8** | Reconciliation | **PASS** |
| **S9** | Source of Truth | **PASS** |
| **S10** | Sandbox E2E | **PASS** |

---

## 15. Deferred Live Cutover

| ID | Status | Reason |
|----|--------|--------|
| `STRIPE-LIVE-CUTOVER-DEFERRED` | **DEFERRED BY OPERATOR** | Full SynqDrive software not yet approved for real payment operations |

Future gate checklist **G1–G10** preserved in `docs/final/master-admin-stripe-live-readiness-preflight.md` — not counted as current system defects while deferred.

---

## 16. Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Addon products without price books | Low | VOICE/AI/WHATSAPP not in sandbox catalog yet |
| Historical drift rows | Low | Resolved manually; engine now reports 0 on dry-run |
| Live cutover | Future | Requires separate operator-approved go-live process |
| `MA-BKP-P1-001` Offsite | Unchanged | Still active production blocker (out of scope) |

---

## Code / Ops Deliverables

- `BillingReconciliationService.runBatch({ dryRun })`
- `BillingSandboxCanonicalizationService` + `billing-sandbox:canonicalize`
- `billing-sandbox:bootstrap-catalog`
- `billing-sandbox:ensure-webhook`
- Migration `20260818223000_fix_billing_subscription_item_trigger`
