# Master Admin Remediation — Phase 2B.8: Billing Data Migration

**Date:** 2026-07-26  
**Status:** Documented (analysis + safe migration plan — **no automatic data mutation**)  
**Scope:** SynqDrive SaaS billing — inventory of existing data anomalies and controlled migration path

---

## 1. Executive summary

SynqDrive billing data spans **three eras** that may coexist in production:

| Era | Tables | Role today |
|-----|--------|------------|
| **Legacy licenses** | `organization_products`, `products` | Historical product access; **not** entitlement SoT |
| **Modern contract** | `billing_subscriptions`, `billing_subscription_items` | Commercial SoT for entitlements |
| **Stripe projection** | Stripe IDs on subscription, catalog mappings, invoice/payment ledger | Payment runtime mirror |

Phase 2B.8 defines **how to find** data problems and **how to migrate safely**.  
**Rule: no automatic writes in this phase.** All remediation is manual or via explicitly approved, idempotent tools after human review.

---

## 2. Data model reference

### 2.1 Stripe identity (not on `organizations`)

Stripe customer/subscription IDs live on **`billing_subscriptions`**:

| Field | Constraint |
|-------|------------|
| `stripe_customer_id` | Unique per `(stripe_customer_id, stripe_mode)` |
| `stripe_subscription_id` | Unique per `(stripe_subscription_id, stripe_mode)` |
| `stripe_mode` | `TEST` \| `LIVE` — must match runtime `STRIPE_SECRET_KEY` mode |

There is **no** `stripe_customer_id` on `organizations`. Reverse lookup uses subscription rows or Stripe metadata (`organizationId`).

### 2.2 Modern contract stack

```
organizations
  └── billing_subscriptions (status, trial_start_at, trial_end_at, stripe_*)
        └── billing_subscription_items (BASE_PLAN / ADDON, price_version_id, status)
              └── billing_stripe_catalog_mappings (per price_version + stripe_mode)
```

### 2.3 Legacy parallel path

```
organizations
  └── organization_products (status: ACTIVE | TRIAL | SUSPENDED | CANCELLED)
        └── products (slug: RENTAL | FLEET | TAXI)
```

`entitlement-migration.registry.ts` documents: **`organization_products` is a legacy projection target, not SoT.**

### 2.4 Price / catalog stack

| Layer | Table | Validity |
|-------|-------|----------|
| Catalog product | `billing_catalog_products` | `key` = RENTAL, FLEET, … |
| Price book | `billing_price_books` | `product_key`, `status` |
| Price version | `billing_price_versions` | DRAFT → ACTIVE → ARCHIVED |
| Tiers | `billing_price_tiers` | `unit_price_cents` required for priced tiers |
| Stripe mapping (modern) | `billing_stripe_catalog_mappings` | Per `price_version_id` + `stripe_mode`, `mapping_status` |
| Stripe mapping (legacy) | `billing_stripe_price_mappings` | Per `price_book_id` + `stripe_mode` |

---

## 3. Anomaly taxonomy & detection

Each anomaly type includes: **definition**, **severity**, **detection method** (read-only), **existing tooling**, **remediation class**.

### 3.1 Verwaiste Customer (orphaned Stripe customers)

**Definition:** A Stripe Customer exists without a matching local row, **or** local `stripe_customer_id` points to a deleted/unknown Stripe customer.

| Sub-type | Detection |
|----------|-----------|
| **A — Local ID, Stripe missing** | Reconciliation + manual Stripe API `customers.retrieve(id)` |
| **B — Stripe customer, no local row** | List Stripe customers with `metadata.organizationId`; compare to `billing_subscriptions` |
| **C — Customer on wrong org** | Same `stripe_customer_id` linked to subscriptions for different `organization_id` (DB unique constraint prevents same mode; cross-mode duplicates possible) |

**Read-only SQL — local customers without subscription context:**

```sql
SELECT bs.id, bs.organization_id, bs.stripe_customer_id, bs.stripe_mode, bs.status
FROM billing_subscriptions bs
WHERE bs.stripe_customer_id IS NOT NULL
  AND bs.ended_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM billing_subscriptions bs2
    WHERE bs2.stripe_customer_id = bs.stripe_customer_id
      AND bs2.stripe_mode = bs.stripe_mode
      AND bs2.organization_id = bs.organization_id
  );
```

**Read-only SQL — stripe_customer_id reused across orgs (same mode):**

```sql
SELECT stripe_customer_id, stripe_mode, COUNT(DISTINCT organization_id) AS org_count,
       array_agg(DISTINCT organization_id) AS org_ids
FROM billing_subscriptions
WHERE stripe_customer_id IS NOT NULL
GROUP BY stripe_customer_id, stripe_mode
HAVING COUNT(DISTINCT organization_id) > 1;
```

| Existing tooling | Gap |
|------------------|-----|
| Reconciliation `CUSTOMER_ID_MISMATCH` (2B.5) | No batch orphan-customer scan |
| `StripeBillingService.findOrganizationIdByStripeCustomer` | Lookup only, no audit report |

**Remediation class:** Manual — map/archive in Stripe dashboard; update local `stripe_customer_id` via Master Admin sync after decision. **Do not auto-delete.**

---

### 3.2 Fehlende Stripe IDs (missing Stripe IDs)

**Definition:** Local contract expects Stripe billing (`ACTIVE`, `PAST_DUE`, `TRIALING`) but `stripe_subscription_id` and/or `stripe_customer_id` is null.

**Read-only SQL:**

```sql
SELECT id, organization_id, status, stripe_customer_id, stripe_subscription_id, stripe_mode,
       trial_start_at, trial_end_at
FROM billing_subscriptions
WHERE status IN ('ACTIVE', 'PAST_DUE', 'TRIALING')
  AND ended_at IS NULL
  AND (stripe_subscription_id IS NULL OR stripe_customer_id IS NULL);
```

**Stripe IDs without mode:**

```sql
SELECT id, organization_id, stripe_customer_id, stripe_subscription_id, stripe_mode
FROM billing_subscriptions
WHERE (stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL)
  AND stripe_mode IS NULL;
```

| Existing tooling | Drift type |
|------------------|------------|
| `BillingReconciliationService` | `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE` |
| Legacy backfill | `STRIPE_ID_WITHOUT_MODE` conflict code |

**Remediation class:** After catalog + price version valid → `POST /admin/billing/organizations/:orgId/sync-stripe` or Master subscription activate (2B.7 guard). **Never invent Stripe IDs in SQL.**

---

### 3.3 Trial ohne Ursache (trial without cause)

**Definition:** Trial state exists without a documented business reason in the modern contract or legacy paths conflict.

| Pattern | Detection |
|---------|-----------|
| **Legacy TRIAL, no billing trial** | `organization_products.status = 'TRIAL'` but no `billing_subscriptions.status = 'TRIALING'` with dates |
| **Billing TRIALING without dates** | `status = 'TRIALING'` but `trial_start_at` OR `trial_end_at` IS NULL |
| **Trial expired, still TRIALING** | `trial_end_at < NOW()` and status still `TRIALING` (no expiry worker — see `trial-model.md`) |
| **Prisma TRIALING, domain DRAFT** | `status = TRIALING`, no `trial_start_at`, base item `DRAFT` → resolves as DRAFT in code |

**Read-only SQL — legacy trial without billing trial:**

```sql
SELECT o.id AS organization_id, o.company_name, op.status AS org_product_status,
       p.slug AS product_slug, bs.id AS subscription_id, bs.status AS subscription_status,
       bs.trial_start_at, bs.trial_end_at
FROM organization_products op
JOIN organizations o ON o.id = op.organization_id
JOIN products p ON p.id = op.product_id
LEFT JOIN billing_subscriptions bs
  ON bs.organization_id = o.id AND bs.ended_at IS NULL AND bs.status != 'CANCELLED'
WHERE op.status = 'TRIAL'
  AND (bs.id IS NULL OR bs.status != 'TRIALING' OR bs.trial_end_at IS NULL);
```

**Read-only SQL — billing trialing without trial window:**

```sql
SELECT id, organization_id, status, trial_start_at, trial_end_at, started_at, created_at
FROM billing_subscriptions
WHERE status = 'TRIALING'
  AND ended_at IS NULL
  AND (trial_start_at IS NULL OR trial_end_at IS NULL);
```

**Read-only SQL — expired trial still open:**

```sql
SELECT id, organization_id, trial_end_at, status
FROM billing_subscriptions
WHERE status = 'TRIALING'
  AND trial_end_at IS NOT NULL
  AND trial_end_at < NOW()
  AND ended_at IS NULL;
```

| Existing tooling | Gap |
|------------------|-----|
| `trial-model.md` documents semantics | No automated trial anomaly detector |
| Reconciliation | Does not check trial semantics |

**Remediation class:** Manual Master Admin — `configureTrial` with explicit `trialEndAt`, or `activate`, or legacy org product status fix. **Do not bulk-update trial dates without per-org review.**

---

### 3.4 Doppelte Customer (duplicate customers)

**Definition:** Same Stripe customer identity incorrectly associated with multiple tenants or duplicate subscription rows.

| Pattern | Detection |
|---------|-----------|
| **DB constraint violation attempt** | `@@unique([stripeCustomerId, stripeMode])` on `billing_subscriptions` |
| **Cross-org same customer** | SQL in §3.1 |
| **Multiple open subscriptions per org** | More than one non-cancelled `billing_subscriptions` per `organization_id` |

**Read-only SQL — multiple open subscriptions per org:**

```sql
SELECT organization_id, COUNT(*) AS open_subscriptions,
       array_agg(id ORDER BY created_at) AS subscription_ids,
       array_agg(status ORDER BY created_at) AS statuses
FROM billing_subscriptions
WHERE ended_at IS NULL AND status != 'CANCELLED'
GROUP BY organization_id
HAVING COUNT(*) > 1;
```

| Existing tooling | Conflict code |
|------------------|---------------|
| Legacy backfill dry-run | `MULTIPLE_ACTIVE_SUBSCRIPTIONS` |
| Orchestrator write path | `DUPLICATE_STRIPE_SUBSCRIPTION` |

**Remediation class:** Manual consolidation — pick canonical subscription, cancel/archive duplicates, re-link Stripe metadata. **No auto-merge.**

---

### 3.5 Inkonsistente Subscription (inconsistent subscription)

**Definition:** Local contract state diverges from Stripe subscription state (status, items, prices, quantities, discounts, anchor).

| Drift type | What it detects |
|------------|-----------------|
| `STATUS_MISMATCH` | Local `BillingStatus` vs Stripe `subscription.status` |
| `MISSING_ITEM` / `EXTRA_ITEM` | Item set mismatch |
| `WRONG_PRICE_ID` | Stripe price ≠ catalog mapping for `price_version_id` |
| `QUANTITY_MISMATCH` | Local quantity vs Stripe item quantity |
| `BILLING_ANCHOR_MISMATCH` | `billing_anchor_day` vs Stripe cycle anchor |
| `MISSING_DISCOUNT` | Local coupon not on Stripe |
| `STRIPE_SUBSCRIPTION_WITHOUT_LOCAL` | Orphan Stripe sub with org metadata |
| `TEST_LIVE_MODE_CONFLICT` | Local `stripe_mode` ≠ runtime secret key mode |
| `CANCELLATION_MISMATCH` | `cancel_at_period_end` divergence (2B.5) |
| `RENEWAL_PERIOD_MISMATCH` | Period boundary drift (2B.5) |

**Detection (read-only):**

```bash
# Per org via API (Master Admin)
POST /api/v1/admin/billing/reconciliation/run
GET  /api/v1/admin/billing/reconciliation/drifts?organizationId=<uuid>

# Scheduled batch (every 6h)
# workers/schedulers/billing-reconciliation.scheduler.ts
```

**Open drifts in DB:**

```sql
SELECT drift_type, severity, organization_id, subscription_id, local_value, stripe_value,
       suggested_action, created_at
FROM billing_reconciliation_drifts
WHERE resolved_at IS NULL
ORDER BY severity DESC, created_at DESC;
```

**Remediation class:**

| Drift | Auto-fix? | Action |
|-------|-----------|--------|
| `STUCK_WEBHOOK`, `MISSING_DEFAULT_PAYMENT_METHOD` | Admin-initiated only | Reconciliation auto-fix endpoint |
| All contract drifts | ❌ Never scheduler auto-fix | Manual acknowledge → resolve per `billing-reconciliation.md` |

---

### 3.6 Fehlende Products (missing products)

**Definition:** Organization lacks required catalog/subscription structure for its declared product.

| Pattern | Detection |
|---------|-----------|
| **No base plan item** | Subscription exists but no `BASE_PLAN` item in ACTIVE/TRIALING |
| **No catalog product seed** | Missing `billing_catalog_products` for RENTAL/FLEET |
| **Legacy product, no contract item** | `organization_products` ACTIVE/TRIAL but no matching `billing_subscription_items` |
| **Org with billing signal, no subscription** | Overrides or legacy products but no `billing_subscriptions` row |

**Read-only SQL — subscription without base item** (from runbook):

```sql
SELECT o.id, o.company_name, bs.id AS subscription_id
FROM organizations o
JOIN billing_subscriptions bs ON bs.organization_id = o.id
LEFT JOIN billing_subscription_items bsi
  ON bsi.subscription_id = bs.id
  AND bsi.item_role = 'BASE_PLAN'
  AND bsi.status IN ('ACTIVE', 'TRIALING')
WHERE bsi.id IS NULL
  AND bs.ended_at IS NULL;
```

**Read-only SQL — legacy active product without modern item:**

```sql
SELECT o.id AS organization_id, p.slug,
       op.status AS org_product_status,
       bsi.id AS subscription_item_id
FROM organization_products op
JOIN organizations o ON o.id = op.organization_id
JOIN products p ON p.id = op.product_id
LEFT JOIN billing_subscriptions bs
  ON bs.organization_id = o.id AND bs.ended_at IS NULL
LEFT JOIN billing_subscription_items bsi
  ON bsi.subscription_id = bs.id
  AND bsi.item_role = 'BASE_PLAN'
  AND bsi.status IN ('ACTIVE', 'TRIALING')
WHERE op.status IN ('ACTIVE', 'TRIAL')
  AND bsi.id IS NULL;
```

| Existing tooling | Outcome |
|------------------|---------|
| `backfill-billing-legacy.ts --dry-run` | `skipped_no_subscription`, `migrated`, `conflict` |
| Runbook SQL | Missing base items |

**Remediation class:** Approved backfill execute (`--execute`) per org after dry-run review; or Master Admin draft → assign plan. **Do not create subscriptions without inference source.**

---

### 3.7 Ungültige Prices (invalid prices)

**Definition:** Price version or Stripe mapping cannot be used for billing sync.

| Invalid condition | Detection |
|-------------------|-----------|
| No ACTIVE price version for price book | `billing_price_versions.status != 'ACTIVE'` on linked subscription |
| ARCHIVED version on item | Item `price_version_id` → ARCHIVED version |
| Missing catalog mapping | No `billing_stripe_catalog_mappings` for version + runtime mode |
| Mapping FAILED / disabled | `mapping_status = 'FAILED'` or `disabled_at IS NOT NULL` |
| Duplicate stripe price across versions | `STRIPE_CATALOG_DUPLICATE_STRIPE_PRICE_ID` on connect |
| Unpriced tiers | `billing_price_tiers.unit_price_cents IS NULL` |
| Legacy mapping gap | `billing_stripe_price_mappings` missing for legacy contracts |

**Read-only SQL — active subscriptions on non-ACTIVE price versions:**

```sql
SELECT bs.organization_id, bs.id AS subscription_id, bsi.id AS item_id,
       bpv.id AS price_version_id, bpv.status AS version_status, bpv.version_label
FROM billing_subscription_items bsi
JOIN billing_subscriptions bs ON bs.id = bsi.subscription_id
JOIN billing_price_versions bpv ON bpv.id = bsi.price_version_id
WHERE bsi.item_role = 'BASE_PLAN'
  AND bsi.status IN ('ACTIVE', 'TRIALING')
  AND bs.ended_at IS NULL
  AND bpv.status != 'ACTIVE';
```

**Read-only SQL — ACTIVE versions without SYNCED catalog mapping (per mode):**

```sql
SELECT bpv.id AS price_version_id, bpv.version_label, pb.product_key,
       bsm.stripe_mode, bsm.mapping_status, bsm.last_error
FROM billing_price_versions bpv
JOIN billing_price_books pb ON pb.id = bpv.price_book_id
LEFT JOIN billing_stripe_catalog_mappings bsm ON bsm.price_version_id = bpv.id
WHERE bpv.status = 'ACTIVE'
  AND (bsm.id IS NULL OR bsm.mapping_status NOT IN ('SYNCED', 'PENDING'));
```

**Read-only SQL — failed mappings:**

```sql
SELECT id, price_version_id, stripe_mode, mapping_status, last_error, disabled_at
FROM billing_stripe_catalog_mappings
WHERE mapping_status = 'FAILED' OR disabled_at IS NOT NULL;
```

| Existing tooling | Detection |
|------------------|-----------|
| `StripeCatalogMappingService.validateMapping` | Per-mapping |
| Reconciliation | `WRONG_PRICE_ID`, `PRODUCT_MISMATCH` |
| Orchestrator | `MAPPING_MISSING`, `NO_SYNCABLE_ITEMS` |

**Remediation class:** Master Admin — publish/archive correct version, connect Stripe mapping, `POST …/stripe-sync`. **Never edit `stripe_price_id` in SQL.**

---

## 4. Safe migration plan (phased)

**Principle:** *Audit → Classify → Approve → Execute (idempotent tool) → Validate → Sign-off*

No phase may skip human review for contract-affecting changes.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 0 — Freeze & backup                                              │
│   pg_dump before any --execute; note STRIPE_SECRET_KEY mode (TEST/LIVE) │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 1 — Read-only inventory (THIS DOCUMENT)                           │
│   Run all SQL queries in §3; export results to JSON/CSV for audit      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 2 — Legacy structure backfill (dry-run)                           │
│   backfill-billing-legacy.ts --dry-run [--organization-id] [--limit]    │
│   Classify: migrated | already_migrated | conflict | skipped            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 3 — Stripe drift detection                                        │
│   POST /admin/billing/reconciliation/run (or wait for 6h scheduler)     │
│   Triage CRITICAL before WARNING                                        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 4 — Manual conflict resolution                                    │
│   Per-org playbook (§5); no bulk SQL updates                            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 5 — Approved execute (idempotent tools only)                      │
│   backfill-billing-legacy.ts --execute --checkpoint-file=… --limit=N    │
│   Reconciliation auto-fix: PM sync + stuck webhooks ONLY                │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 6 — Validation & sign-off                                         │
│   Re-run Phase 1–3 queries; entitlement resolver smoke per pilot org      │
│   Archive reports + billing_audit_logs diff                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 0 — Prerequisites

| Requirement | Check |
|-------------|-------|
| Migrations through billing stack | `20260715340000_billing_email_delivery_audit` minimum |
| Environment mode | `sk_test_` vs `sk_live_` documented per run |
| Backup | `pg_dump -Fc` before any `--execute` |
| Master Admin access | `master-billing` permission for mutations |

### Phase 1 — Inventory commands

```bash
# Legacy backfill classification (read-only)
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --dry-run

# Single org
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --dry-run \
  --organization-id=<uuid>

# Save report
npx ts-node ... --dry-run 2>/dev/null | tee /tmp/billing-inventory-$(date +%F).json
```

Run SQL queries from §3 against read-only replica or production with DBA oversight.

### Phase 2–3 — Classify severity

| Priority | Categories |
|----------|------------|
| **P0 — CRITICAL** | `TEST_LIVE_MODE_CONFLICT`, `STRIPE_SUBSCRIPTION_WITHOUT_LOCAL`, cross-org duplicate customer |
| **P1 — HIGH** | Missing Stripe IDs on ACTIVE/TRIALING, `STATUS_MISMATCH`, missing base item |
| **P2 — MEDIUM** | Trial ohne Ursache, invalid price mappings, legacy/modern product mismatch |
| **P3 — LOW** | Documented overrides, INFO drifts, stuck webhooks (auto-fixable) |

### Phase 5 — Allowed automated tools

| Tool | Writes? | Allowed when |
|------|---------|--------------|
| `backfill-billing-legacy.ts --execute` | Yes — items, quantity events, null fills | After dry-run approval per org/batch |
| Reconciliation auto-fix | Yes — PM mirror, webhook replay | Admin-initiated; not scheduler |
| `sync-stripe` admin endpoint | Yes — Stripe pull/push | Per org after contract review |
| Master subscription lifecycle | Yes — contract state | Per org; activate requires Stripe confirm (2B.7) |
| Raw SQL UPDATE | — | **Forbidden** in migration plan |

### Phase 6 — Validation checklist

- [ ] §3.1–3.7 anomaly queries return zero rows (or accepted exceptions documented)
- [ ] `backfill-billing-legacy.ts --dry-run` → `conflicts: 0` (or accepted list)
- [ ] Open reconciliation CRITICAL drifts = 0
- [ ] Pilot org entitlement smoke: `BillingEntitlementResolver.resolve(orgId)`
- [ ] `billing_audit_logs` reviewed for unexpected mutations
- [ ] JSON reports archived with run timestamp + operator

---

## 5. Per-anomaly remediation playbook

| Anomaly | Safe remediation | Forbidden |
|---------|------------------|-----------|
| Orphan Stripe customer | Stripe dashboard archive; update local via sync | Delete local row without backup |
| Missing Stripe IDs | Fix catalog → activate or sync-stripe | Insert fake `sub_` / `cus_` IDs |
| Trial ohne Ursache | Master `configureTrial` or fix `organization_products` | Bulk `UPDATE status = 'ACTIVE'` |
| Duplicate customer | Consolidate subs; one canonical per org+mode | Merge orgs in DB |
| Inconsistent subscription | Acknowledge drift → manual sync or contract fix | Scheduler auto-overwrite contract |
| Missing products | Backfill execute or Master draft/assign | Create item without price version |
| Invalid prices | Publish version + Stripe catalog connect | Edit mapping `stripe_price_id` in SQL |

---

## 6. Existing tooling map

| Tool | Path | Mode | Purpose |
|------|------|------|---------|
| Legacy backfill | `scripts/ops/backfill-billing-legacy.ts` | dry-run / execute | Structure migration |
| Backfill service | `migration/billing-legacy-backfill.service.ts` | — | Inference + idempotent writes |
| Reconciliation | `billing-reconciliation.service.ts` | API + scheduler | Stripe ↔ local drift |
| Reconciliation domain | `domain/billing-reconciliation.ts` | pure | Drift detection rules |
| Runbook | `docs/billing/billing-migration-runbook.md` | — | Operational detail |
| Trial semantics | `docs/remediation/trial-model.md` | — | Trial anomaly context |
| Activation guards | `docs/remediation/billing-guards.md` | — | Post-migration activate path |
| Monitoring | `billing-monitoring.service.ts` | — | Alerts on CRITICAL drifts |

---

## 7. Explicit non-goals (no auto-change)

Phase 2B.8 **does not**:

- Run `--execute` or reconciliation auto-fix automatically
- Delete `organization_products` or legacy rows
- Bulk-update `billing_subscriptions.status`
- Invent Stripe IDs, trial dates, or price versions
- Sync `organization_products` from contract (future projection job)
- Merge duplicate organizations
- Modify production data from this documentation task

---

## 8. Gaps & recommended follow-ups

| ID | Gap | Recommended next step |
|----|-----|----------------------|
| G1 | No `audit-billing-data.ts` ops script | Read-only script wrapping §3 SQL + backfill dry-run |
| G2 | No org-product ↔ contract consistency check in reconciliation | Add drift types in future phase |
| G3 | Trial expiry anomalies not in reconciliation | Batch report or worker |
| G4 | Orphan Stripe customer batch scan | Stripe API list + metadata compare |
| G5 | Legacy `billing_stripe_price_mappings` not in reconciliation | Extend drift detection for legacy contracts |
| G6 | `organization_products` projection sync | Separate backfill after contract stable |

---

## 9. File reference

| Area | Path |
|------|------|
| Prisma billing models | `backend/prisma/schema.prisma` (~4247–5089) |
| Legacy backfill | `backend/src/modules/billing/migration/billing-legacy-backfill.service.ts` |
| Reconciliation | `backend/src/modules/billing/domain/billing-reconciliation.ts` |
| Catalog mapping | `backend/src/modules/billing/stripe-catalog-mapping.service.ts` |
| Entitlement SoT | `backend/src/modules/billing/billing-entitlement-resolver.service.ts` |
| Legacy registry | `backend/src/modules/billing/entitlement-migration.registry.ts` |
| Ops backfill script | `backend/scripts/ops/backfill-billing-legacy.ts` |
| Migration runbook | `docs/billing/billing-migration-runbook.md` |

---

## 10. Summary

| Anomaly | Primary detection | Safe fix path |
|---------|-------------------|---------------|
| Verwaiste Customer | SQL §3.1 + Stripe API | Manual map/archive |
| Fehlende Stripe IDs | SQL §3.2 + `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE` | sync-stripe / guarded activate |
| Trial ohne Ursache | SQL §3.3 | Master configureTrial / activate |
| Doppelte Customer | SQL §3.4 + backfill conflict | Manual consolidation |
| Inkonsistente Subscription | Reconciliation drifts | Acknowledge → manual resolve |
| Fehlende Products | SQL §3.6 + backfill dry-run | Approved backfill execute |
| Ungültige Prices | SQL §3.7 + mapping validate | Publish + Stripe catalog connect |

**Migration safety rule:** *Read twice, write once, always with backup and per-org approval.*

**Changes:** Updated (this document).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_BILLING_DATA_MIGRATION_2026-07-26.md`, `ArchitekturView`).
