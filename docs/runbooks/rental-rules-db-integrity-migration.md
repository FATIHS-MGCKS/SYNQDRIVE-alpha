# Runbook: Rental Rules DB Integrity Migration

**Controlled migration** for Prompt 20/34 — database-level integrity for rental rules (normalized category uniqueness, CHECK constraints, lookup indexes).

| Field | Value |
|-------|-------|
| **Valid from** | Backend ≥ commit with migration `20260723100000_rental_rules_db_integrity` |
| **Migration ID** | `20260723100000_rental_rules_db_integrity` |
| **Preflight audit** | [`backend/scripts/ops/audit-rental-rules-integrity.ts`](../../backend/scripts/ops/audit-rental-rules-integrity.ts) |
| **Remediation doc** | [`docs/audits/rental-rules-production-readiness-remediation-2026-07.md`](../audits/rental-rules-production-readiness-remediation-2026-07.md) §20 |

> **Principle:** Repair before constrain. No uncontrolled deletes. Empty override shells with no active fields are the only rows removed. All other fixes are logged in `rental_rules_integrity_repair_log`.

---

## 1. Prerequisites

### 1.1 Required migrations (in order)

| Migration | Purpose |
|-----------|---------|
| `20260620100000_rental_rules_eligibility` | Base rental rules tables + FKs |
| `20260723100000_rental_rules_db_integrity` | Backfill, CHECK constraints, indexes |

```bash
cd backend
npx prisma migrate status
```

### 1.2 Backup (mandatory before production)

```bash
# Full logical backup of the target database
pg_dump "$DATABASE_URL" -Fc -f "synqdrive-pre-rental-rules-integrity-$(date +%Y%m%d-%H%M).dump"
```

Store the dump off-VPS. Verify restore on a staging clone before production apply.

### 1.3 Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Target PostgreSQL |
| `ORG_ID` | Optional — scope preflight audit to one tenant |

---

## 2. Phase A — Read-only preflight audit

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-rental-rules-integrity.ts
```

Per-organization:

```bash
ORG_ID=<ORG_UUID> npx ts-node -r tsconfig-paths/register scripts/ops/audit-rental-rules-integrity.ts
```

| Check | Blocking? | Migration repair |
|-------|:---------:|------------------|
| Empty category names | ✓ | Rename to `Unnamed category {id-prefix}` |
| `name_normalized` mismatch | ✓ | Backfill from trimmed/lowercased name |
| Duplicate normalized names per org | ✓ | Rename losers with ` (N)` suffix (oldest wins) |
| Override `organization_id` ≠ vehicle org | ✓ | Align to vehicle `organization_id` |
| Cross-tenant vehicle ↔ category | ✓ | Clear `vehicles.rental_category_id` |
| Invalid age / months / deposit | ✓ | Set offending column to `NULL` |
| Invalid currency format | ✓ | Org default → `EUR`; category/override → `NULL` |
| Empty override shells | info | Deleted (no active override fields) |

Exit code `1` = blocking issues remain (run migration or investigate).

---

## 3. Phase B — Apply migration

### Staging (recommended)

```bash
cd backend
npx prisma migrate deploy
npx ts-node -r tsconfig-paths/register scripts/ops/audit-rental-rules-integrity.ts
npm test -- --testPathPattern=rental-rules
```

### Production (via standard VPS deploy)

1. Confirm backup (§1.2).
2. Push `main` with migration committed.
3. `bash .cursor/scripts/cloud-agent-deploy.sh` (runs `prisma migrate deploy` on VPS).
4. Re-run audit script on production (read-only).
5. Smoke-test rental rules UI: create/rename category, vehicle override, org defaults.

---

## 4. Backfill strategy summary

| Issue | Strategy | Data loss |
|-------|----------|-----------|
| Empty category name | Deterministic placeholder name | None |
| Duplicate normalized name | Rename duplicate rows | None (display name may change) |
| Override org mismatch | Update `organization_id` to vehicle org | None |
| Cross-tenant category assignment | `rental_category_id = NULL` on vehicle | Category link only |
| Invalid currency | EUR (org) or NULL (category/override) | Invalid string only |
| Invalid numeric fields | NULL the invalid column | Invalid value only |
| Empty override shell | `DELETE` row with all fields NULL | Shell row only |

All non-delete repairs write to `rental_rules_integrity_repair_log` (idempotent per `migration_id` + `entity_id` + `action`).

---

## 5. Rollback

**Only if migration has not been superseded by later schema changes.**

1. Restore from `pg_dump` backup (preferred) if constraints block business operations.
2. Surgical rollback (constraints/indexes/column only — does **not** undo data repairs):

```sql
-- Drop CHECK constraints
ALTER TABLE organization_rental_rules
  DROP CONSTRAINT IF EXISTS organization_rental_rules_minimum_age_years_check,
  DROP CONSTRAINT IF EXISTS organization_rental_rules_minimum_license_holding_months_check,
  DROP CONSTRAINT IF EXISTS organization_rental_rules_deposit_amount_cents_check,
  DROP CONSTRAINT IF EXISTS organization_rental_rules_deposit_currency_check;

ALTER TABLE rental_vehicle_categories
  DROP CONSTRAINT IF EXISTS rental_vehicle_categories_minimum_age_years_check,
  DROP CONSTRAINT IF EXISTS rental_vehicle_categories_minimum_license_holding_months_check,
  DROP CONSTRAINT IF EXISTS rental_vehicle_categories_deposit_amount_cents_check,
  DROP CONSTRAINT IF EXISTS rental_vehicle_categories_deposit_currency_check,
  DROP CONSTRAINT IF EXISTS rental_vehicle_categories_name_not_blank_check;

ALTER TABLE vehicle_rental_requirement_overrides
  DROP CONSTRAINT IF EXISTS vehicle_rental_requirement_overrides_minimum_age_years_check,
  DROP CONSTRAINT IF EXISTS vehicle_rental_requirement_overrides_minimum_license_holding_months_check,
  DROP CONSTRAINT IF EXISTS vehicle_rental_requirement_overrides_deposit_amount_cents_check,
  DROP CONSTRAINT IF EXISTS vehicle_rental_requirement_overrides_deposit_currency_check;

-- Drop indexes added by this migration
DROP INDEX IF EXISTS rental_vehicle_categories_org_name_normalized_key;
DROP INDEX IF EXISTS organization_rental_rules_is_active_idx;
DROP INDEX IF EXISTS booking_eligibility_approvals_org_booking_revision_idx;
DROP INDEX IF EXISTS booking_eligibility_approvals_org_revision_created_idx;

-- Optional: remove normalized column (only if application rolled back)
ALTER TABLE rental_vehicle_categories DROP COLUMN IF EXISTS name_normalized;
```

3. Mark migration rolled back in `_prisma_migrations` only under DBA supervision.
4. Re-deploy previous application version that does not write `name_normalized`.

`rental_rules_integrity_repair_log` is append-only audit — retain for forensics.

---

## 6. Verification checklist

- [ ] `npm run prisma:validate` passes
- [ ] Preflight audit exits 0 after migration
- [ ] `rental-rules-integrity.schema.spec.ts` passes
- [ ] Create category with case-variant name → unique constraint blocks duplicate
- [ ] Vehicle override upsert respects one row per `vehicle_id`
- [ ] Booking eligibility approval queries use revision indexes (explain analyze optional)

---

## 7. Related application changes

- `normalizeRentalCategoryName()` — set on create/update category in `RentalRulesService`
- `RENTAL_RULES_DB_LIMITS` — must stay aligned with `rental-rules-validation.constants.ts`
- Server validation (Prompt 19) remains the first line of defense; DB constraints are the second
