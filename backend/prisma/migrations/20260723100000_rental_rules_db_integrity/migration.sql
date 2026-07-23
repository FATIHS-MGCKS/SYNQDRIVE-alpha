-- Rental rules DB integrity (Prompt 20/34)
--
-- Non-destructive preflight repairs + CHECK constraints + uniqueness on normalized category names.
-- Idempotent repair logging via rental_rules_integrity_repair_log.
--
-- BACKUP: pg_dump snapshot required before production deploy (see docs/runbooks/rental-rules-db-integrity-migration.md).
-- ROLLBACK: drop constraints/indexes/column added here; repair log rows are audit-only.

CREATE TABLE IF NOT EXISTS "rental_rules_integrity_repair_log" (
  "id" TEXT NOT NULL,
  "migration_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rental_rules_integrity_repair_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rental_rules_integrity_repair_log_migration_id_idx"
  ON "rental_rules_integrity_repair_log"("migration_id");

CREATE INDEX IF NOT EXISTS "rental_rules_integrity_repair_log_entity_idx"
  ON "rental_rules_integrity_repair_log"("entity_type", "entity_id");

-- 1) Empty / whitespace category names → deterministic placeholder (no deletes)
INSERT INTO "rental_rules_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260723100000_rental_rules_db_integrity',
  'rental_vehicle_category',
  c."id",
  'rename_empty_category_name',
  jsonb_build_object('previous_name', c."name")
FROM "rental_vehicle_categories" c
WHERE trim(c."name") = ''
  AND NOT EXISTS (
    SELECT 1 FROM "rental_rules_integrity_repair_log" l
    WHERE l."migration_id" = '20260723100000_rental_rules_db_integrity'
      AND l."entity_id" = c."id"
      AND l."action" = 'rename_empty_category_name'
  );

UPDATE "rental_vehicle_categories"
SET
  "name" = 'Unnamed category ' || substring("id", 1, 8),
  "updated_at" = CURRENT_TIMESTAMP
WHERE trim("name") = '';

-- 2) Add normalized name column (nullable during backfill)
ALTER TABLE "rental_vehicle_categories"
  ADD COLUMN IF NOT EXISTS "name_normalized" TEXT;

UPDATE "rental_vehicle_categories"
SET "name_normalized" = lower(trim(regexp_replace("name", '\s+', ' ', 'g')))
WHERE "name_normalized" IS NULL;

-- 3) Resolve duplicate normalized names per organization (rename losers, keep oldest)
WITH ranked AS (
  SELECT
    "id",
    "organization_id",
    "name",
    lower(trim(regexp_replace("name", '\s+', ' ', 'g'))) AS norm,
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id", lower(trim(regexp_replace("name", '\s+', ' ', 'g')))
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "rental_vehicle_categories"
),
losers AS (
  SELECT "id", "name", rn FROM ranked WHERE rn > 1
)
INSERT INTO "rental_rules_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260723100000_rental_rules_db_integrity',
  'rental_vehicle_category',
  l."id",
  'rename_duplicate_category_name',
  jsonb_build_object('previous_name', l."name", 'duplicate_rank', l.rn)
FROM losers l
WHERE NOT EXISTS (
  SELECT 1 FROM "rental_rules_integrity_repair_log" existing
  WHERE existing."migration_id" = '20260723100000_rental_rules_db_integrity'
    AND existing."entity_id" = l."id"
    AND existing."action" = 'rename_duplicate_category_name'
);

WITH ranked AS (
  SELECT
    "id",
    "name",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id", lower(trim(regexp_replace("name", '\s+', ' ', 'g')))
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "rental_vehicle_categories"
)
UPDATE "rental_vehicle_categories" c
SET
  "name" = c."name" || ' (' || ranked.rn || ')',
  "updated_at" = CURRENT_TIMESTAMP
FROM ranked
WHERE c."id" = ranked."id"
  AND ranked.rn > 1;

UPDATE "rental_vehicle_categories"
SET "name_normalized" = lower(trim(regexp_replace("name", '\s+', ' ', 'g')))
WHERE "name_normalized" IS DISTINCT FROM lower(trim(regexp_replace("name", '\s+', ' ', 'g')));

ALTER TABLE "rental_vehicle_categories"
  ALTER COLUMN "name_normalized" SET NOT NULL;

-- 4) Cross-tenant override organization_id repair (align to vehicle org)
INSERT INTO "rental_rules_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260723100000_rental_rules_db_integrity',
  'vehicle_rental_requirement_override',
  o."id",
  'fix_override_organization_mismatch',
  jsonb_build_object('previous_organization_id', o."organization_id", 'vehicle_organization_id', v."organization_id")
FROM "vehicle_rental_requirement_overrides" o
JOIN "vehicles" v ON v."id" = o."vehicle_id"
WHERE o."organization_id" <> v."organization_id"
  AND NOT EXISTS (
    SELECT 1 FROM "rental_rules_integrity_repair_log" l
    WHERE l."migration_id" = '20260723100000_rental_rules_db_integrity'
      AND l."entity_id" = o."id"
      AND l."action" = 'fix_override_organization_mismatch'
  );

UPDATE "vehicle_rental_requirement_overrides" o
SET
  "organization_id" = v."organization_id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "vehicles" v
WHERE v."id" = o."vehicle_id"
  AND o."organization_id" <> v."organization_id";

-- 5) Cross-tenant vehicle ↔ category assignments → clear category (vehicle stays)
INSERT INTO "rental_rules_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260723100000_rental_rules_db_integrity',
  'vehicle',
  v."id",
  'clear_cross_tenant_category_assignment',
  jsonb_build_object(
    'rental_category_id', v."rental_category_id",
    'vehicle_organization_id', v."organization_id",
    'category_organization_id', c."organization_id"
  )
FROM "vehicles" v
JOIN "rental_vehicle_categories" c ON c."id" = v."rental_category_id"
WHERE v."organization_id" <> c."organization_id"
  AND NOT EXISTS (
    SELECT 1 FROM "rental_rules_integrity_repair_log" l
    WHERE l."migration_id" = '20260723100000_rental_rules_db_integrity'
    AND l."entity_id" = v."id"
    AND l."action" = 'clear_cross_tenant_category_assignment'
  );

UPDATE "vehicles" v
SET "rental_category_id" = NULL
FROM "rental_vehicle_categories" c
WHERE v."rental_category_id" = c."id"
  AND v."organization_id" <> c."organization_id";

-- 6) Invalid currencies → EUR (org defaults) or NULL (category/override nullable)
UPDATE "organization_rental_rules"
SET "deposit_currency" = 'EUR', "updated_at" = CURRENT_TIMESTAMP
WHERE "deposit_currency" IS NULL
   OR length(trim("deposit_currency")) <> 3
   OR upper(trim("deposit_currency")) !~ '^[A-Z]{3}$';

UPDATE "rental_vehicle_categories"
SET "deposit_currency" = NULL, "updated_at" = CURRENT_TIMESTAMP
WHERE "deposit_currency" IS NOT NULL
  AND (
    length(trim("deposit_currency")) <> 3
    OR upper(trim("deposit_currency")) !~ '^[A-Z]{3}$'
  );

UPDATE "vehicle_rental_requirement_overrides"
SET "deposit_currency" = NULL, "updated_at" = CURRENT_TIMESTAMP
WHERE "deposit_currency" IS NOT NULL
  AND (
    length(trim("deposit_currency")) <> 3
    OR upper(trim("deposit_currency")) !~ '^[A-Z]{3}$'
  );

-- Uppercase valid currency codes
UPDATE "organization_rental_rules"
SET "deposit_currency" = upper(trim("deposit_currency")), "updated_at" = CURRENT_TIMESTAMP
WHERE "deposit_currency" <> upper(trim("deposit_currency"));

UPDATE "rental_vehicle_categories"
SET "deposit_currency" = upper(trim("deposit_currency")), "updated_at" = CURRENT_TIMESTAMP
WHERE "deposit_currency" IS NOT NULL
  AND "deposit_currency" <> upper(trim("deposit_currency"));

UPDATE "vehicle_rental_requirement_overrides"
SET "deposit_currency" = upper(trim("deposit_currency")), "updated_at" = CURRENT_TIMESTAMP
WHERE "deposit_currency" IS NOT NULL
  AND "deposit_currency" <> upper(trim("deposit_currency"));

-- 7) Invalid numeric rule fields → NULL (preserve row, drop invalid value)
UPDATE "organization_rental_rules"
SET
  "minimum_age_years" = CASE
    WHEN "minimum_age_years" IS NULL THEN NULL
    WHEN "minimum_age_years" < 18 OR "minimum_age_years" > 99 THEN NULL
    ELSE "minimum_age_years"
  END,
  "minimum_license_holding_months" = CASE
    WHEN "minimum_license_holding_months" IS NULL THEN NULL
    WHEN "minimum_license_holding_months" < 0 OR "minimum_license_holding_months" > 971 THEN NULL
    ELSE "minimum_license_holding_months"
  END,
  "deposit_amount_cents" = CASE
    WHEN "deposit_amount_cents" IS NULL THEN NULL
    WHEN "deposit_amount_cents" < 0 OR "deposit_amount_cents" > 10000000 THEN NULL
    ELSE "deposit_amount_cents"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE ("minimum_age_years" IS NOT NULL AND ("minimum_age_years" < 18 OR "minimum_age_years" > 99))
   OR ("minimum_license_holding_months" IS NOT NULL AND ("minimum_license_holding_months" < 0 OR "minimum_license_holding_months" > 971))
   OR ("deposit_amount_cents" IS NOT NULL AND ("deposit_amount_cents" < 0 OR "deposit_amount_cents" > 10000000));

UPDATE "rental_vehicle_categories"
SET
  "minimum_age_years" = CASE
    WHEN "minimum_age_years" IS NULL THEN NULL
    WHEN "minimum_age_years" < 18 OR "minimum_age_years" > 99 THEN NULL
    ELSE "minimum_age_years"
  END,
  "minimum_license_holding_months" = CASE
    WHEN "minimum_license_holding_months" IS NULL THEN NULL
    WHEN "minimum_license_holding_months" < 0 OR "minimum_license_holding_months" > 971 THEN NULL
    ELSE "minimum_license_holding_months"
  END,
  "deposit_amount_cents" = CASE
    WHEN "deposit_amount_cents" IS NULL THEN NULL
    WHEN "deposit_amount_cents" < 0 OR "deposit_amount_cents" > 10000000 THEN NULL
    ELSE "deposit_amount_cents"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE ("minimum_age_years" IS NOT NULL AND ("minimum_age_years" < 18 OR "minimum_age_years" > 99))
   OR ("minimum_license_holding_months" IS NOT NULL AND ("minimum_license_holding_months" < 0 OR "minimum_license_holding_months" > 971))
   OR ("deposit_amount_cents" IS NOT NULL AND ("deposit_amount_cents" < 0 OR "deposit_amount_cents" > 10000000));

UPDATE "vehicle_rental_requirement_overrides"
SET
  "minimum_age_years" = CASE
    WHEN "minimum_age_years" IS NULL THEN NULL
    WHEN "minimum_age_years" < 18 OR "minimum_age_years" > 99 THEN NULL
    ELSE "minimum_age_years"
  END,
  "minimum_license_holding_months" = CASE
    WHEN "minimum_license_holding_months" IS NULL THEN NULL
    WHEN "minimum_license_holding_months" < 0 OR "minimum_license_holding_months" > 971 THEN NULL
    ELSE "minimum_license_holding_months"
  END,
  "deposit_amount_cents" = CASE
    WHEN "deposit_amount_cents" IS NULL THEN NULL
    WHEN "deposit_amount_cents" < 0 OR "deposit_amount_cents" > 10000000 THEN NULL
    ELSE "deposit_amount_cents"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE ("minimum_age_years" IS NOT NULL AND ("minimum_age_years" < 18 OR "minimum_age_years" > 99))
   OR ("minimum_license_holding_months" IS NOT NULL AND ("minimum_license_holding_months" < 0 OR "minimum_license_holding_months" > 971))
   OR ("deposit_amount_cents" IS NOT NULL AND ("deposit_amount_cents" < 0 OR "deposit_amount_cents" > 10000000));

-- 8) Remove semantically empty override shells (no active override fields)
-- Production may predate full eligibility columns — add defensively before purge.
ALTER TABLE "vehicle_rental_requirement_overrides"
  ADD COLUMN IF NOT EXISTS "credit_card_required" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "foreign_travel_policy" "RentalForeignTravelPolicy",
  ADD COLUMN IF NOT EXISTS "additional_driver_policy" "RentalAdditionalDriverPolicy",
  ADD COLUMN IF NOT EXISTS "young_driver_policy" "RentalYoungDriverPolicy",
  ADD COLUMN IF NOT EXISTS "insurance_requirement" TEXT,
  ADD COLUMN IF NOT EXISTS "manual_approval_required" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

DELETE FROM "vehicle_rental_requirement_overrides" o
WHERE o."minimum_age_years" IS NULL
  AND o."minimum_license_holding_months" IS NULL
  AND o."deposit_amount_cents" IS NULL
  AND o."deposit_currency" IS NULL
  AND o."credit_card_required" IS NULL
  AND o."foreign_travel_policy" IS NULL
  AND o."additional_driver_policy" IS NULL
  AND o."young_driver_policy" IS NULL
  AND o."insurance_requirement" IS NULL
  AND o."manual_approval_required" IS NULL
  AND o."notes" IS NULL;

-- 9) CHECK constraints (idempotent)
ALTER TABLE "organization_rental_rules"
  DROP CONSTRAINT IF EXISTS "organization_rental_rules_minimum_age_years_check",
  DROP CONSTRAINT IF EXISTS "organization_rental_rules_minimum_license_holding_months_check",
  DROP CONSTRAINT IF EXISTS "organization_rental_rules_deposit_amount_cents_check",
  DROP CONSTRAINT IF EXISTS "organization_rental_rules_deposit_currency_check";

ALTER TABLE "organization_rental_rules"
  ADD CONSTRAINT "organization_rental_rules_minimum_age_years_check"
    CHECK ("minimum_age_years" IS NULL OR ("minimum_age_years" >= 18 AND "minimum_age_years" <= 99)),
  ADD CONSTRAINT "organization_rental_rules_minimum_license_holding_months_check"
    CHECK ("minimum_license_holding_months" IS NULL OR ("minimum_license_holding_months" >= 0 AND "minimum_license_holding_months" <= 971)),
  ADD CONSTRAINT "organization_rental_rules_deposit_amount_cents_check"
    CHECK ("deposit_amount_cents" IS NULL OR ("deposit_amount_cents" >= 0 AND "deposit_amount_cents" <= 10000000)),
  ADD CONSTRAINT "organization_rental_rules_deposit_currency_check"
    CHECK ("deposit_currency" ~ '^[A-Z]{3}$');

ALTER TABLE "rental_vehicle_categories"
  DROP CONSTRAINT IF EXISTS "rental_vehicle_categories_minimum_age_years_check",
  DROP CONSTRAINT IF EXISTS "rental_vehicle_categories_minimum_license_holding_months_check",
  DROP CONSTRAINT IF EXISTS "rental_vehicle_categories_deposit_amount_cents_check",
  DROP CONSTRAINT IF EXISTS "rental_vehicle_categories_deposit_currency_check",
  DROP CONSTRAINT IF EXISTS "rental_vehicle_categories_name_not_blank_check";

ALTER TABLE "rental_vehicle_categories"
  ADD CONSTRAINT "rental_vehicle_categories_minimum_age_years_check"
    CHECK ("minimum_age_years" IS NULL OR ("minimum_age_years" >= 18 AND "minimum_age_years" <= 99)),
  ADD CONSTRAINT "rental_vehicle_categories_minimum_license_holding_months_check"
    CHECK ("minimum_license_holding_months" IS NULL OR ("minimum_license_holding_months" >= 0 AND "minimum_license_holding_months" <= 971)),
  ADD CONSTRAINT "rental_vehicle_categories_deposit_amount_cents_check"
    CHECK ("deposit_amount_cents" IS NULL OR ("deposit_amount_cents" >= 0 AND "deposit_amount_cents" <= 10000000)),
  ADD CONSTRAINT "rental_vehicle_categories_deposit_currency_check"
    CHECK ("deposit_currency" IS NULL OR "deposit_currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "rental_vehicle_categories_name_not_blank_check"
    CHECK (char_length(trim("name")) > 0);

ALTER TABLE "vehicle_rental_requirement_overrides"
  DROP CONSTRAINT IF EXISTS "vehicle_rental_requirement_overrides_minimum_age_years_check",
  DROP CONSTRAINT IF EXISTS "vehicle_rental_requirement_overrides_minimum_license_holding_months_check",
  DROP CONSTRAINT IF EXISTS "vehicle_rental_requirement_overrides_deposit_amount_cents_check",
  DROP CONSTRAINT IF EXISTS "vehicle_rental_requirement_overrides_deposit_currency_check";

ALTER TABLE "vehicle_rental_requirement_overrides"
  ADD CONSTRAINT "vehicle_rental_requirement_overrides_minimum_age_years_check"
    CHECK ("minimum_age_years" IS NULL OR ("minimum_age_years" >= 18 AND "minimum_age_years" <= 99)),
  ADD CONSTRAINT "vehicle_rental_requirement_overrides_minimum_license_holding_months_check"
    CHECK ("minimum_license_holding_months" IS NULL OR ("minimum_license_holding_months" >= 0 AND "minimum_license_holding_months" <= 971)),
  ADD CONSTRAINT "vehicle_rental_requirement_overrides_deposit_amount_cents_check"
    CHECK ("deposit_amount_cents" IS NULL OR ("deposit_amount_cents" >= 0 AND "deposit_amount_cents" <= 10000000)),
  ADD CONSTRAINT "vehicle_rental_requirement_overrides_deposit_currency_check"
    CHECK ("deposit_currency" IS NULL OR "deposit_currency" ~ '^[A-Z]{3}$');

-- 10) Uniqueness + lookup indexes
CREATE UNIQUE INDEX IF NOT EXISTS "rental_vehicle_categories_org_name_normalized_key"
  ON "rental_vehicle_categories" ("organization_id", "name_normalized");

CREATE INDEX IF NOT EXISTS "organization_rental_rules_is_active_idx"
  ON "organization_rental_rules" ("is_active");

CREATE INDEX IF NOT EXISTS "booking_eligibility_approvals_org_booking_revision_idx"
  ON "booking_eligibility_approvals" ("organization_id", "booking_id", "rule_revision");

CREATE INDEX IF NOT EXISTS "booking_eligibility_approvals_org_revision_created_idx"
  ON "booking_eligibility_approvals" ("organization_id", "rule_revision", "created_at");
