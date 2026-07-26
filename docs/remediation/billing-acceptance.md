# Master Admin Remediation — Phase 2B.9: Billing Acceptance

**Date:** 2026-07-26  
**Status:** Acceptance test report (automated CI + manual sandbox playbook)  
**Scope:** End-to-end billing lifecycle — Stripe ↔ local DB parity for all contract states

---

## 1. Executive summary

Billing acceptance validates that **every billable lifecycle state is reflected identically in Stripe and the local database** (`billing_subscriptions`, items, invoices, payments, webhooks).

| Layer | Result (2026-07-26) | Notes |
|-------|----------------------|-------|
| **CI automated (mocked)** | **782 / 784** billing specs pass | 2 failures in `billing-email-delivery.spec.ts` (Resend mock — unrelated to Stripe parity) |
| **Sandbox matrix integrity** | **40 / 40** pass | All 32 scenarios registered + fixtures valid |
| **Core parity suites** | **98 / 98** pass | Webhook matrix, lifecycle, reconciliation, invoice mirror |
| **Live Stripe E2E** | **Manual** — playbook required | Needs `sk_test_*`, running backend, Stripe CLI |

**Acceptance verdict:** **CONDITIONAL GO** for production billing remediation — automated parity layer is strong; **live sandbox sign-off** required for activate/trial/upgrade/cancel/renewal with real Stripe Test Mode before full GO.

---

## 2. Acceptance principle — Stripe ↔ DB parity

For every scenario, both sides must agree:

| Dimension | Stripe source | Local source | Verification |
|-----------|---------------|--------------|--------------|
| Subscription status | `subscription.status` | `billing_subscriptions.status` + domain resolver | Reconciliation `STATUS_MISMATCH` = fail |
| Subscription ID | `sub_*` | `stripe_subscription_id` + mode | Unique constraint + reconciliation |
| Customer ID | `cus_*` | `stripe_customer_id` + mode | Reconciliation `CUSTOMER_ID_MISMATCH` |
| Trial end | `trial_end` | `trial_end_at` | Orchestrator pushes local → Stripe; webhook mirrors status only |
| Period boundaries | `current_period_start/end` | `current_period_start/end` | `RENEWAL_PERIOD_MISMATCH` drift |
| Cancel schedule | `cancel_at_period_end` | `cancel_at_period_end` | `CANCELLATION_MISMATCH` drift |
| Line items | `items[].price`, `quantity` | `billing_subscription_items` + mappings | `MISSING_ITEM`, `WRONG_PRICE_ID`, `QUANTITY_MISMATCH` |
| Invoices | `invoice.*` events | `billing_invoices` mirror | `MISSING_LOCAL_INVOICE`, `INVOICE_STATUS_MISMATCH` |
| Payments | `payment_intent.*` | `billing_payments` ledger | `MISSING_LOCAL_PAYMENT` |
| Webhooks | Event ID processed once | `stripe_webhook_events` idempotent | Duplicate replay → no double-write |

**Gate:** After each lifecycle step, run reconciliation for the org — **zero open CRITICAL drifts** before sign-off.

```bash
POST /api/v1/admin/billing/reconciliation/run
GET  /api/v1/admin/billing/reconciliation/drifts?organizationId=<uuid>
```

---

## 3. Scenario acceptance matrix

### 3.1 Neue Organisation (new organization)

| Step | Action | Stripe expected | DB expected | Automated | Live E2E |
|------|--------|-----------------|-------------|-----------|----------|
| 1 | Create org (Master Admin) | No customer yet | No `billing_subscriptions` or DRAFT only | ✅ Scenario #1 | Manual §3.1 |
| 2 | Tenant overview | — | Empty contract / `INACTIVE` entitlements | ✅ `tenant-subscription-overview.service.spec.ts` | Manual |
| 3 | First billing touch | Customer on first sync | `stripe_customer_id` set | ✅ Orchestrator spec (mock) | Manual §3.3 |

**Parity check:**

```sql
SELECT id, organization_id, status, stripe_customer_id, stripe_subscription_id
FROM billing_subscriptions WHERE organization_id = '<org_id>' AND ended_at IS NULL;
```

**Result:** ✅ CI pass — no Stripe subscription until activate/sync.

---

### 3.2 Trial

| Step | Action | Stripe expected | DB expected | Automated | Live E2E |
|------|--------|-----------------|-------------|-----------|----------|
| 1 | Master `POST …/trial` | `trialing`, `trial_end` | `TRIALING`, `trial_start_at`, `trial_end_at` | ✅ Lifecycle `startTrial` | Manual §3.5 |
| 2 | Webhook `customer.subscription.updated` | `trialing` | Status mirror via `applyStripeSubscription` | ✅ Fixture `updated-trial.json` | Fixture replay |
| 3 | `trial_will_end` | Email outbox event | `TRIAL_ENDING` domain event | ⚠️ No matrix spec | Manual |
| 4 | Trial → paid activate | `active` (trial ended) | `ACTIVE` | ✅ Orchestrator `trial_end: now` (2B.7) | Manual |

**Parity check:**

| Field | Stripe | Local |
|-------|--------|-------|
| Status | `trialing` | `TRIALING` (domain) |
| Trial end | `trial_end` unix | `trial_end_at` |

**Result:** ✅ CI pass for start + webhook fixture. ⚠️ Live trial conversion requires sandbox §3.5.

**Known gap:** No worker auto-expires trial at `trial_end_at` — see `trial-model.md`.

---

### 3.3 Upgrade

Covers: Rental→Fleet (#22), new price version (#23), quantity increase (#6–7).

| Step | Action | Stripe expected | DB expected | Automated | Live E2E |
|------|--------|-----------------|-------------|-----------|----------|
| 1 | Schedule tariff change (RENTAL→FLEET) | Items updated on sync | New base item scheduled | ⚠️ Concurrency only in command spec | Manual §3.11 |
| 2 | Publish + migrate price version | New `price_*` on items | `price_version_id` updated | ✅ `pricebook.service.spec.ts` | Manual §3.12 |
| 3 | Vehicle add (quantity +1) | Item `quantity` +1 | Billable assignment + quantity ledger | ✅ Scenario #6–7 | Manual §3.6–3.7 |
| 4 | Reconciliation | No `WRONG_PRICE_ID` / `QUANTITY_MISMATCH` | — | ✅ `billing-reconciliation.spec.ts` | Post-step API |

**Result:** ⚠️ **Partial** — unit/mock coverage strong; **no full HTTP E2E** for Rental→Fleet migration path.

---

### 3.4 Downgrade

| Step | Action | Stripe expected | DB expected | Automated | Live E2E |
|------|--------|-----------------|-------------|-----------|----------|
| 1 | Fleet→Rental or lower tier | Item swap on Stripe | Scheduled item replacement | ❌ No scenario | Not documented |
| 2 | Vehicle remove (qty -1) | `quantity` decreased | Assignment ended | ✅ Scenario #8 (unit) | Manual §3.8 |
| 3 | ACTIVE → TRIALING | N/A — **blocked** | Lifecycle forbids | ✅ `subscription-lifecycle.spec.ts` | N/A |

**Result:** ❌ **Gap** — explicit downgrade/tier-reduction E2E not in scenario registry. Quantity downgrade covered; product downgrade not.

---

### 3.5 Kündigung (cancellation)

| Step | Action | Stripe expected | DB expected | Automated | Live E2E |
|------|--------|-----------------|-------------|-----------|----------|
| 1 | Schedule cancel at period end | `cancel_at_period_end: true` | `cancel_at_period_end`, domain `CANCEL_SCHEDULED` | ✅ Lifecycle + fixture | Manual §3.13 |
| 2 | Webhook updated | Mirrors cancel flag | `applyStripeSubscription` | ✅ `updated-cancel-at-period-end.json` | Fixture replay |
| 3 | Revoke cancel | `cancel_at_period_end: false` | `CANCEL_SCHEDULED` → `ACTIVE` | ✅ Lifecycle spec | Manual §3.14 |
| 4 | Immediate cancel | `canceled` | `CANCELLED`, `ended_at` | ✅ Lifecycle spec | Manual |
| 5 | Cancel during TRIALING | — | ⚠️ `scheduleCancel` blocked | Documented in `trial-model.md` | Manual edge case |

**Parity check:** Reconciliation `CANCELLATION_MISMATCH` must be empty.

**Result:** ✅ CI pass for schedule/revoke/immediate + webhook fixtures.

---

### 3.6 Webhook

| Category | Event types | Automated | Result |
|----------|-------------|-----------|--------|
| Subscription | `created`, `updated`, `deleted`, `trial_will_end` | 20/22 in matrix spec | ✅ |
| Invoice | `created`, `finalized`, `paid`, `payment_failed`, `voided`, `marked_uncollectible` | ✅ | ✅ |
| Payment | `payment_intent.succeeded`, `payment_failed` | ✅ | ✅ |
| Setup | `setup_intent.succeeded` | ✅ | ✅ |
| Refund / credit | `charge.refunded`, `credit_note.created` | ✅ | ✅ |
| Idempotency | Duplicate event ID | ✅ Scenario #26 | ✅ |
| Out-of-order | Older event after newer | ✅ Scenario #27 | ✅ |
| Signature / livemode | Invalid sig rejected; livemode blocked in sandbox | ✅ ingest specs | ✅ |

**Fixture replay (local stack):**

```bash
cd backend
E2E_FIXTURE_FILE=invoice.paid.json npm run billing:sandbox:replay-webhook
```

**Result:** ✅ 98/98 core webhook + reconciliation tests pass. ⚠️ `trial_will_end` registered but not in matrix happy-path spec.

---

### 3.7 Zahlung erfolgreich (payment success)

| Step | Stripe | Local | Automated |
|------|--------|-------|-----------|
| `invoice.finalized` | Invoice open | `billing_invoices` OPEN | ✅ Webhook matrix |
| `payment_intent.succeeded` | PI succeeded | `billing_payments` row | ✅ Ledger spec |
| `invoice.paid` | Paid | `status = PAID`, `amount_paid_cents` | ✅ Fixture + mirror spec |

**Test card:** `4242 4242 4242 4242` (Stripe Test Mode)

**Parity SQL:**

```sql
SELECT bi.stripe_invoice_id, bi.status, bi.amount_paid_cents,
       bp.stripe_payment_intent_id, bp.status AS payment_status
FROM billing_invoices bi
LEFT JOIN billing_payments bp ON bp.invoice_id = bi.id
WHERE bi.organization_id = '<org_id>'
ORDER BY bi.created_at DESC LIMIT 5;
```

**Result:** ✅ CI pass. Live charge path: manual §5.1.

---

### 3.8 Zahlung fehlgeschlagen (payment failed)

| Step | Stripe | Local | Automated |
|------|--------|-------|-----------|
| `invoice.payment_failed` | Invoice open/past_due | Mirror + tenant overview | ✅ Fixture |
| `payment_intent.payment_failed` | Failed PI | Payment attempt logged | ✅ Webhook matrix |
| Subscription | May → `past_due` | `PAST_DUE` + grace entitlements | ✅ `billing-entitlements.spec.ts` |

**Decline card:** `4000 0000 0000 0002`

**Result:** ✅ CI pass. Live decline: manual §5.2.

---

### 3.9 Rechnung (invoice)

| State | Stripe event | Local `InvoiceStatus` | Automated |
|-------|--------------|----------------------|-----------|
| Draft | `invoice.created` | DRAFT / mirror | ✅ |
| Open | `invoice.finalized` | OPEN | ✅ Scenario #16 |
| Paid | `invoice.paid` | PAID | ✅ Scenario #13 |
| Failed | `invoice.payment_failed` | OPEN + past_due context | ✅ Scenario #14 |
| Void | `invoice.voided` | VOID | ✅ Scenario #17 |
| Uncollectible | `invoice.marked_uncollectible` | UNCOLLECTIBLE | ✅ Scenario #18 |

**Tenant API:** `GET /billing/invoices?orgId=…` — list matches mirrored rows.

**Result:** ✅ Full invoice lifecycle covered in CI mocks.

---

### 3.10 Renewal

| Step | Stripe | Local | Automated |
|------|--------|-------|-----------|
| Period roll | New `current_period_start/end` | `current_period_start/end` updated | ⚠️ Via `subscription.updated` webhook |
| Recurring invoice | New `invoice.*` cycle | New `billing_invoices` row | ⚠️ Implicit in `invoice.paid` fixture |
| Reconciliation | Period match | `RENEWAL_PERIOD_MISMATCH` = none | ✅ Domain spec |

**Result:** ⚠️ **Gap** — no dedicated scenario # for subscription renewal / second billing cycle. Covered indirectly by webhook + reconciliation drift types.

**Manual renewal test:**

1. Wait for Stripe Test Mode billing cycle (or use Stripe Test Clock)
2. Expect `invoice.created` → `finalized` → `paid`
3. Verify new invoice row + updated `current_period_end`
4. Run reconciliation — no `RENEWAL_PERIOD_MISMATCH`

---

## 4. Test execution log (2026-07-26)

Executed in Cloud Agent workspace (`cursor/master-admin-billing-acceptance-2b9-b5f0`):

```bash
# Sandbox scenario registry + fixtures
cd backend && npm run test:billing:sandbox-matrix
# → 40 passed, 0 failed

# Full billing module
cd backend && npm test -- --testPathPattern=modules/billing --no-coverage
# → 782 passed, 2 failed, 3 skipped (91 suites)

# Core parity suites
cd backend && npm test -- --testPathPattern="stripe-webhook.matrix|subscription-lifecycle|billing-reconciliation|stripe-invoice-mirror" --no-coverage
# → 98 passed, 0 failed (11 suites)
```

### Failures (non-blocking for Stripe parity)

| Suite | Failure | Impact on acceptance |
|-------|---------|----------------------|
| `billing-email-delivery.spec.ts` | `ResendWebhookService` mock missing `applyOutboundEmailWebhookUpdate` | Billing email delivery only — not Stripe/DB contract parity |

---

## 5. Live sandbox E2E procedure

**Prerequisites:** See `docs/billing/billing-stripe-sandbox-e2e.md`

| # | Requirement |
|---|-------------|
| 1 | `STRIPE_SECRET_KEY=sk_test_*` only |
| 2 | `STRIPE_WEBHOOK_SECRET=whsec_*` (Stripe CLI `listen`) |
| 3 | Backend `npm run start:dev` + `infra:up` |
| 4 | Dedicated org `E2E_BILLING_ORG_ID` (sandbox name) |
| 5 | Master Admin `master-billing` permission |

### Recommended E2E sequence (single org)

```
1. Neue Org          → §3.1   (no contract)
2. Draft             → §3.2
3. Trial             → §3.5   (configureTrial)
4. Activate          → §3.3   (Stripe confirm — 2B.7 guard)
5. Vehicle + invoice → §3.6–3.7, §5.1 (payment success)
6. Decline test      → §5.2   (separate PM or org)
7. Upgrade           → §3.11 or §3.12
8. Cancel schedule   → §3.13
9. Revoke cancel     → §3.14
10. Reconciliation   → zero CRITICAL drifts
```

After **each step**, verify:

```bash
# Stripe Dashboard → Subscriptions → compare status, items, trial_end
# Local:
GET /admin/billing/organizations/:orgId/subscription
POST /admin/billing/reconciliation/run  # body: { organizationId }
GET /admin/billing/reconciliation/drifts?organizationId=:orgId
```

### Webhook replay (without live charge)

```bash
E2E_BILLING_ORG_ID=<uuid> \
E2E_FIXTURE_FILE=invoice.paid.json \
npm run billing:sandbox:replay-webhook
```

---

## 6. Parity verification checklist (sign-off)

| # | Check | Pass criteria |
|---|-------|---------------|
| 1 | Subscription status | Stripe `status` maps to local `BillingStatus` (reconciliation clean) |
| 2 | Stripe IDs | `stripe_customer_id` + `stripe_subscription_id` + `stripe_mode` set |
| 3 | Items | Every syncable local item has matching Stripe price + quantity |
| 4 | Trial | If `trialing`: `trial_end` ≈ `trial_end_at` (±60s) |
| 5 | Cancel | `cancel_at_period_end` matches both sides |
| 6 | Invoices | Every non-draft Stripe invoice mirrored locally |
| 7 | Payments | Every paid invoice has `billing_payments` row |
| 8 | Webhooks | `stripe_webhook_events` — no stuck FAILED > 15min |
| 9 | Entitlements | `BillingEntitlementResolver` matches expected access |
| 10 | Cross-tenant | Org A data invisible to Org B (scenario #31) |

---

## 7. Gaps & remediation backlog

| ID | Gap | Severity | Recommendation |
|----|-----|----------|----------------|
| G1 | No HTTP-level billing E2E (supertest/Playwright) | Medium | Add `test/billing-lifecycle.e2e-spec.ts` |
| G2 | Downgrade path untested E2E | Medium | Add scenario #33 + manual § |
| G3 | Renewal not isolated | Medium | Stripe Test Clock + scenario #34 |
| G4 | `trial_will_end` not in webhook matrix spec | Low | Add matrix case |
| G5 | Rental→Fleet full migration | Medium | Integration test with orchestrator mock |
| G6 | 2 billing-email-delivery spec failures | Low | Fix Resend mock |
| G7 | Trial cancel during TRIALING blocked | Low | Product decision — see `trial-model.md` |

---

## 8. References

| Doc / tool | Path |
|------------|------|
| Sandbox playbook | `docs/billing/billing-stripe-sandbox-e2e.md` |
| Scenario registry | `backend/src/modules/billing/billing-stripe-sandbox.matrix.ts` |
| Trial model | `docs/remediation/trial-model.md` |
| Activation guards | `docs/remediation/billing-guards.md` |
| Data migration | `docs/remediation/billing-data-migration.md` |
| Reconciliation | `docs/remediation/billing-reconciliation.md` |
| Webhook replay | `backend/scripts/ops/stripe-billing-e2e-replay-webhook.ts` |
| Fixtures | `backend/src/modules/billing/__fixtures__/stripe-sandbox/events/` |

---

## 9. Acceptance verdict

| Criterion | Status |
|-----------|--------|
| All user scenarios documented with parity checks | ✅ |
| CI automated tests executed | ✅ (782/784 billing; 98/98 core parity) |
| Stripe ↔ DB parity rules defined | ✅ |
| Live sandbox E2E procedure defined | ✅ |
| Full live E2E executed in this run | ❌ (requires `sk_test_*` + local stack) |
| Zero known CRITICAL parity gaps in CI layer | ✅ |
| Unconditional production GO | ❌ — **conditional** pending live sandbox sign-off |

**Sign-off owners:** Master Admin billing operator + one engineering reviewer after live sandbox sequence (§5) with reconciliation clean.

**Changes:** Updated (this document).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_BILLING_ACCEPTANCE_2026-07-26.md`, `ArchitekturView`).
