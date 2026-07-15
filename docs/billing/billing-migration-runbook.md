# Billing Legacy Migration Runbook

Controlled, idempotent backfill from pre–Prompt-10 billing (`billing_subscriptions` + price books) to the target domain introduced in Prompts 6–8 (catalog products, subscription items, quantity ledger, Stripe mode).

**Script:** `backend/scripts/ops/backfill-billing-legacy.ts`  
**Service:** `BillingLegacyBackfillService`

---

## What the backfill does

| Step | Action | Idempotent? |
|------|--------|-------------|
| Global | Ensure `RENTAL` / `FLEET` catalog products exist (seed IDs from migration) | Yes — skips existing keys |
| Global | Link `billing_price_books.billing_product_id` from `product_key` | Yes — only when null |
| Global | Upsert `billing_stripe_price_mappings` for default price book + `STRIPE_DEFAULT_PRICE_ID` | Yes — per `(priceBookId, stripeMode)` |
| Per org | Infer base tariff: org product → price book → `businessType` | Read-only inference |
| Per org | Update subscription `priceBookId` / `priceVersionId` / `stripeMode` when missing | Yes — only fills nulls |
| Per org | Create `BillingSubscriptionItem` (base plan) when absent | Yes — skips if active base item exists |
| Per org | Record `BillingQuantityEvent` documenting billable vehicle count | Yes — `idempotencyKey` |
| Per org | Mark `BillingOrganizationPriceOverride` with `[legacy-backfill:documented]` | Yes — marker appended once |
| Per org | Report ambiguous / conflicting legacy data | No writes for conflicts |

**Does not:**

- Delete or archive legacy tables/rows
- Invent subscriptions, Stripe IDs, price versions, or quantities without source data
- Create add-on subscription items (Voice, WhatsApp, …) — future prompts
- Run workers, send email, or touch Stripe API

---

## Prerequisites

1. **Migrations deployed** through `20260715340000_billing_email_delivery_audit`
2. **`DATABASE_URL`** pointing at the target environment
3. **Backup** before `--execute` on production:
   ```bash
   pg_dump "$DATABASE_URL" -Fc -f /var/backups/synqdrive-billing-$(date +%F).dump
   ```
4. **Stripe env** (optional but recommended for mode classification):
   - `STRIPE_SECRET_KEY` — `sk_test_` → TEST, `sk_live_` → LIVE
   - `STRIPE_DEFAULT_PRICE_ID` — linked to default price book mapping
5. **Catalog seed** — normally present from migration `20260715190000`; backfill can create missing `RENTAL`/`FLEET` rows only

---

## Dry run (required first)

Dry run performs all reads and inference; **no database writes**.

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --dry-run
```

Single organization:

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --dry-run \
  --organization-id=<uuid>
```

Inspect JSON output:

- `summary.conflicts` — orgs needing manual review
- `summary.migrated` — orgs that would receive new subscription items
- `summary.alreadyMigrated` — orgs with existing base items
- `organizations[].actions` — planned mutations per org
- `global` — catalog / price book / Stripe mapping changes

**Acceptance:** re-running dry run must report the same planned actions (no drift).

---

## Execute

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --execute
```

Limit batch size during rollout:

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --execute --limit=50
```

### Resume after abort

Checkpoint is written when `--checkpoint-file` is set:

```bash
CHECKPOINT=/tmp/billing-backfill-checkpoint.json

npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --execute \
  --checkpoint-file="$CHECKPOINT"

# Re-run same command to continue from last organization id
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --execute \
  --checkpoint-file="$CHECKPOINT"
```

Organizations are processed in ascending `id` order; completed orgs are skipped via checkpoint cursor.

---

## Validation queries

### Orgs without base subscription item

```sql
SELECT o.id, o.company_name, bs.id AS subscription_id
FROM organizations o
JOIN billing_subscriptions bs ON bs.organization_id = o.id
LEFT JOIN billing_subscription_items bsi
  ON bsi.subscription_id = bs.id
  AND bsi.item_role = 'BASE_PLAN'
  AND bsi.status IN ('ACTIVE', 'TRIALING')
WHERE bsi.id IS NULL;
```

### Duplicate base plans (should be empty)

```sql
SELECT organization_id, COUNT(*) AS active_base_items
FROM billing_subscription_items
WHERE item_role = 'BASE_PLAN'
  AND status IN ('ACTIVE', 'TRIALING')
  AND (valid_to IS NULL OR valid_to > NOW())
GROUP BY organization_id
HAVING COUNT(*) > 1;
```

### Quantity events from backfill

```sql
SELECT organization_id, subscription_item_id, quantity_after, reason
FROM billing_quantity_events
WHERE idempotency_key LIKE 'legacy-backfill:quantity:v1:%'
ORDER BY created_at DESC
LIMIT 50;
```

### Documented price overrides

```sql
SELECT id, organization_id, reason
FROM billing_organization_price_overrides
WHERE reason LIKE '%[legacy-backfill:documented]%';
```

### Stripe mode gaps on linked subscriptions

```sql
SELECT id, organization_id, stripe_customer_id, stripe_subscription_id, stripe_mode
FROM billing_subscriptions
WHERE (stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL)
  AND stripe_mode IS NULL;
```

### Conflicts to triage manually

After run, filter report JSON:

```bash
jq '.organizations[] | select(.outcome == "conflict")' report.json
```

---

## Rollback

There is **no automatic rollback**. Legacy rows are never deleted; rollback is selective:

| Created by backfill | Rollback approach |
|---------------------|-------------------|
| `billing_subscription_items` | `DELETE` only rows created in this migration window (use `created_at` + audit) |
| `billing_quantity_events` | Delete by `idempotency_key LIKE 'legacy-backfill:quantity:v1:%'` |
| Override reason marker | Remove ` [legacy-backfill:documented]` suffix manually |
| Subscription field updates | Restore `price_book_id` / `price_version_id` / `stripe_mode` from backup if wrongly set |
| Catalog / mapping upserts | Usually safe to keep; revert from backup if needed |

**Preferred:** restore from `pg_dump` taken before `--execute` if widespread issues occur.

---

## Conflict cases

| Code | Meaning | Suggested action |
|------|---------|------------------|
| `RENTAL_AND_FLEET_ACTIVE` | Org has both base products active | Deactivate wrong `organization_products` row, re-run |
| `AMBIGUOUS_BASE_PRODUCT` | No org product, price book, or mappable `businessType` | Assign correct org product or link subscription to price book |
| `NO_PRICE_BOOK` | No matching active price book for inferred product | Create/publish price book in Master admin |
| `NO_ACTIVE_PRICE_VERSION` | Price book has no ACTIVE version | Publish a price version before backfill |
| `PRICE_BOOK_PRODUCT_MISMATCH` | Subscription price book ≠ inferred product | Align subscription `price_book_id` or org product |
| `CONFLICTING_LEGACY_SOURCES` | Org product and price book disagree | Pick canonical source, fix data, re-run |
| `STRIPE_ID_WITHOUT_MODE` | Stripe IDs present but mode unknown | Set `STRIPE_SECRET_KEY` or manually set `stripe_mode` |
| `MULTIPLE_ACTIVE_SUBSCRIPTIONS` | More than one `billing_subscriptions` row per org | Consolidate subscriptions manually |

---

## Inference priority (documented)

1. Active `organization_products` → `RENTAL` / `FLEET` (`TAXI` → `RENTAL`)
2. Subscription’s `billing_price_books.product_key`
3. `organizations.business_type` (`RENTAL`, `TAXI` → Rental; `FLEET` → Fleet)
4. Otherwise: **conflict** — no default invented

Vehicle quantity for new items comes from `BillableVehiclesService` (connected + billable rules). Quantity events document the count; they do not change Stripe.

---

## Tests

```bash
cd backend
npx jest src/modules/billing/migration/billing-legacy-backfill.service.spec.ts
```

Covers: Rental/Fleet inference, conflicts, dry-run, idempotent second run, missing price version, overrides, Stripe mode classification.

---

## Operational checklist

- [ ] Backup database
- [ ] `--dry-run` full pass; review `conflicts` and `actions`
- [ ] Resolve or accept conflict orgs
- [ ] `--execute` with `--limit` in staging
- [ ] Run validation queries
- [ ] `--execute` production with checkpoint file
- [ ] Archive JSON report for audit
