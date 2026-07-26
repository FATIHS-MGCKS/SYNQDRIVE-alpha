# Master Admin Remediation — Phase 2B.5: Billing Reconciliation Engine

**Date:** 2026-07-26  
**Status:** Implemented (engine hardening + manual confirmation workflow)  
**Scope:** SynqDrive SaaS billing — Stripe vs local DB contract reconciliation

---

## 1. Executive summary

SynqDrive already operated a **billing reconciliation engine** (Prompt 27) that periodically compares Stripe subscription state against local `billing_subscriptions` and related tables. Phase 2B.5 **hardens** this engine to meet Master Admin remediation requirements:

- **Detect** drift across subscription, customer, price, product, status, renewal, cancellation, and invoice dimensions
- **Never auto-overwrite** contract-sensitive data from the scheduler
- **Log** every newly detected drift to `billing_audit_logs`
- **Classify** drifts by type and severity (`INFO` / `WARNING` / `CRITICAL`)
- **Require manual acknowledgment** before resolve or admin-triggered auto-fix

**Stripe remains the external runtime truth for payment state; local DB remains the commercial contract truth.** Reconciliation surfaces gaps — it does not silently merge them.

---

## 2. Architecture

```
┌─────────────────────┐     every 6h      ┌──────────────────────────────┐
│ BillingReconciliation│ ───────────────► │ BillingReconciliationService│
│ Scheduler (worker)   │                   │  runPeriodicReconciliation() │
└─────────────────────┘                   └──────────────┬───────────────┘
                                                         │
                         ┌───────────────────────────────┼───────────────────────────────┐
                         ▼                               ▼                               ▼
                 Stripe API (read)              detectBillingReconciliationDrift()    billing_reconciliation_drifts
                 subscriptions/customers/invoices         (pure domain)                  (append-only until resolved)
```

### Components

| Layer | Path | Role |
|-------|------|------|
| Scheduler | `workers/schedulers/billing-reconciliation.scheduler.ts` | Periodic batch runs (default 6h) |
| Service | `modules/billing/billing-reconciliation.service.ts` | Orchestration, Stripe fetch, persist |
| Domain | `modules/billing/domain/billing-reconciliation.ts` | Pure drift detection (testable) |
| API | `billing.controller.ts` | Master Admin run / list / acknowledge / resolve |
| Storage | `billing_reconciliation_runs`, `billing_reconciliation_drifts` | Run history + open drifts |

---

## 3. Compared dimensions

| Dimension | Drift type(s) | Auto-fix |
|-----------|---------------|----------|
| **Subscription** | `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE`, `STRIPE_SUBSCRIPTION_WITHOUT_LOCAL`, `MISSING_ITEM`, `EXTRA_ITEM` | ❌ |
| **Customer** | `CUSTOMER_ID_MISMATCH` | ❌ |
| **Price** | `WRONG_PRICE_ID` | ❌ |
| **Product** | `PRODUCT_MISMATCH` | ❌ |
| **Status** | `STATUS_MISMATCH` (incl. `cancel_at_period_end`) | ❌ |
| **Renewal** | `RENEWAL_PERIOD_MISMATCH`, `BILLING_ANCHOR_MISMATCH` | ❌ |
| **Cancellation** | `CANCELLATION_MISMATCH` | ❌ |
| **Invoice** | `MISSING_LOCAL_INVOICE`, `INVOICE_STATUS_MISMATCH`, `MISSING_LOCAL_PAYMENT` | ❌ |
| **Environment** | `TEST_LIVE_MODE_CONFLICT` | ❌ |
| **Webhooks** | `STUCK_WEBHOOK` | ✅ admin-only technical replay |
| **Payment method mirror** | `MISSING_DEFAULT_PAYMENT_METHOD` | ✅ admin-only PM sync |

**Phase 2B.5 additions:** `CUSTOMER_ID_MISMATCH`, `CANCELLATION_MISMATCH`, `RENEWAL_PERIOD_MISMATCH`, `INVOICE_STATUS_MISMATCH`, `PRODUCT_MISMATCH`.

---

## 4. No auto-overwrite policy

| Rule | Implementation |
|------|----------------|
| Scheduler never writes contract data | `runPeriodicReconciliation()` only detects + persists drifts |
| Contract drifts not auto-fixable | `autoFixable: false` on all contract drift types |
| Auto-fix is admin-initiated only | `POST …/drifts/:id/auto-fix` + `MasterBillingGuard` |
| Auto-fix limited to technical projection | Payment method mirror + stuck webhook replay only |
| Acknowledgment required | `acknowledgeDrift()` before `resolveDrift()` or `applyAutoFix()` |

---

## 5. Manual confirmation workflow

```
Detect (scheduler or admin run)
  → Drift row created (open)
  → Audit: BILLING_RECONCILIATION_DRIFT_DETECTED
Admin reviews drift (GET …/drifts)
  → POST …/drifts/:id/acknowledge
  → Audit: BILLING_RECONCILIATION_DRIFT_ACKNOWLEDGED
Admin resolves or applies technical auto-fix
  → POST …/resolve OR …/auto-fix
  → Audit: BILLING_RECONCILIATION_DRIFT_RESOLVED / AUTO_FIX_APPLIED
```

### API endpoints (Master Admin)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/admin/billing/reconciliation/run` | Trigger batch (optional `organizationId`, cursor pagination) |
| `GET` | `/api/v1/admin/billing/reconciliation/runs` | List recent runs |
| `GET` | `/api/v1/admin/billing/reconciliation/drifts` | List open drifts |
| `POST` | `/api/v1/admin/billing/reconciliation/drifts/:id/acknowledge` | Manual confirmation |
| `POST` | `/api/v1/admin/billing/reconciliation/drifts/:id/resolve` | Mark resolved (post-ack) |
| `POST` | `/api/v1/admin/billing/reconciliation/drifts/:id/auto-fix` | Technical auto-fix (post-ack) |

---

## 6. Configuration

```env
# Scheduler (default: enabled)
BILLING_RECONCILIATION_SCHEDULER_ENABLED=true

# Stripe mode derived from STRIPE_SECRET_KEY (sk_test_ / sk_live_)
STRIPE_SECRET_KEY=sk_test_...
```

Scheduler interval: **6 hours** (`billing-reconciliation.scheduler.ts`).

---

## 7. Database schema

### `billing_reconciliation_runs`

Tracks batch execution: `status`, `cursor`, `total_scanned`, `drift_count`, `error_count`, `stripe_mode`.

### `billing_reconciliation_drifts`

| Column | Purpose |
|--------|---------|
| `drift_type` | Classification enum |
| `severity` | INFO / WARNING / CRITICAL |
| `local_value` / `stripe_value` | Compared values |
| `suggested_action` | Human-readable remediation hint |
| `auto_fixable` | Whether technical auto-fix exists |
| `idempotency_key` | Dedup open drifts per org/sub/type |
| `acknowledged_at` / `acknowledged_by_user_id` | **2B.5** manual confirmation |
| `resolved_at` / `resolved_by_user_id` | Closure |

**Migration:** `20260726190000_billing_reconciliation_hardening_2b5`

---

## 8. Idempotency

Drift idempotency key format:

```
billing-reconciliation:{orgId}:{subscriptionId}:{driftType}:{detailKey}:v2
```

Open drifts with the same key are not duplicated. Schema version bumped to `v2` for new drift types.

---

## 9. Verification

```bash
cd backend
npx jest src/modules/billing/domain/billing-reconciliation.spec.ts
npx jest src/modules/billing/billing-reconciliation.service.spec.ts
```

---

## 10. Related phases

| Phase | Topic |
|-------|-------|
| 2B.1 | Billing source of truth (Stripe vs DB roles) |
| 2B.2 | Stripe environment separation |
| 2B.3 | Webhook hardening |

**Changes / Architektur:** Updated in SynqDrive Master UI.
