-- Rental rule revisions (Prompt 24/34)
-- Versioned, temporally valid rule snapshots per ORGANIZATION / CATEGORY / VEHICLE scope.

CREATE TYPE "RentalRuleRevisionScopeType" AS ENUM ('ORGANIZATION', 'CATEGORY', 'VEHICLE');
CREATE TYPE "RentalRuleRevisionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

CREATE TABLE "rental_rule_revisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "scope_type" "RentalRuleRevisionScopeType" NOT NULL,
  "scope_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "RentalRuleRevisionStatus" NOT NULL,
  "normalized_rules" JSONB NOT NULL,
  "rules_hash" VARCHAR(64) NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_by" TEXT,
  "published_at" TIMESTAMP(3),
  "change_reason" TEXT,
  "supersedes_revision_id" TEXT,
  "lock_version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "rental_rule_revisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "rental_rule_revisions"
  ADD CONSTRAINT "rental_rule_revisions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_rule_revisions"
  ADD CONSTRAINT "rental_rule_revisions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rental_rule_revisions"
  ADD CONSTRAINT "rental_rule_revisions_published_by_fkey"
    FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rental_rule_revisions"
  ADD CONSTRAINT "rental_rule_revisions_supersedes_revision_id_fkey"
    FOREIGN KEY ("supersedes_revision_id") REFERENCES "rental_rule_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "rental_rule_revisions_scope_version_key"
  ON "rental_rule_revisions" ("organization_id", "scope_type", "scope_id", "version");

CREATE INDEX "rental_rule_revisions_scope_status_idx"
  ON "rental_rule_revisions" ("organization_id", "scope_type", "scope_id", "status");

CREATE INDEX "rental_rule_revisions_scope_effective_idx"
  ON "rental_rule_revisions" ("organization_id", "scope_type", "scope_id", "effective_from");

CREATE INDEX "rental_rule_revisions_rules_hash_idx"
  ON "rental_rule_revisions" ("rules_hash");

-- Exactly one open ACTIVE revision per scope (no effective_to).
CREATE UNIQUE INDEX "rental_rule_revisions_one_active_per_scope_idx"
  ON "rental_rule_revisions" ("organization_id", "scope_type", "scope_id")
  WHERE "status" = 'ACTIVE' AND "effective_to" IS NULL;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Canonical JSON text for hashing (matches backend rental-rules-revision.util.ts key order).
CREATE OR REPLACE FUNCTION rental_rules_revision_hash(
  p_rules JSONB,
  p_scope_meta JSONB
) RETURNS VARCHAR(64)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(jsonb_build_object('rules', p_rules, 'scopeMeta', p_scope_meta)::text, 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION rental_rules_revision_rules_json(
  minimum_age_years INTEGER,
  minimum_license_holding_months INTEGER,
  deposit_amount_cents INTEGER,
  deposit_currency TEXT,
  credit_card_required BOOLEAN,
  foreign_travel_policy TEXT,
  additional_driver_policy TEXT,
  young_driver_policy TEXT,
  insurance_requirement TEXT,
  manual_approval_required BOOLEAN,
  notes TEXT
) RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'minimumAgeYears', minimum_age_years,
    'minimumLicenseHoldingMonths', minimum_license_holding_months,
    'depositAmountCents', deposit_amount_cents,
    'depositCurrency', deposit_currency,
    'creditCardRequired', credit_card_required,
    'foreignTravelPolicy', foreign_travel_policy,
    'additionalDriverPolicy', additional_driver_policy,
    'youngDriverPolicy', young_driver_policy,
    'insuranceRequirement', insurance_requirement,
    'manualApprovalRequired', manual_approval_required,
    'notes', notes
  );
$$;

-- Backfill: organization defaults
INSERT INTO "rental_rule_revisions" (
  "id",
  "organization_id",
  "scope_type",
  "scope_id",
  "version",
  "status",
  "normalized_rules",
  "rules_hash",
  "effective_from",
  "effective_to",
  "published_at",
  "change_reason",
  "lock_version"
)
SELECT
  gen_random_uuid()::text,
  r."organization_id",
  'ORGANIZATION'::"RentalRuleRevisionScopeType",
  r."organization_id",
  r."version",
  'ACTIVE'::"RentalRuleRevisionStatus",
  jsonb_build_object(
    'rules', rental_rules_revision_rules_json(
      r."minimum_age_years",
      r."minimum_license_holding_months",
      r."deposit_amount_cents",
      r."deposit_currency",
      r."credit_card_required",
      r."foreign_travel_policy"::text,
      r."additional_driver_policy"::text,
      r."young_driver_policy"::text,
      r."insurance_requirement",
      r."manual_approval_required",
      r."notes"
    ),
    'scopeMeta', jsonb_build_object('isActive', r."is_active")
  ),
  rental_rules_revision_hash(
    rental_rules_revision_rules_json(
      r."minimum_age_years",
      r."minimum_license_holding_months",
      r."deposit_amount_cents",
      r."deposit_currency",
      r."credit_card_required",
      r."foreign_travel_policy"::text,
      r."additional_driver_policy"::text,
      r."young_driver_policy"::text,
      r."insurance_requirement",
      r."manual_approval_required",
      r."notes"
    ),
    jsonb_build_object('isActive', r."is_active")
  ),
  r."created_at",
  NULL,
  r."updated_at",
  'Initial revision backfill (Prompt 24)',
  1
FROM "organization_rental_rules" r
ON CONFLICT ON CONSTRAINT "rental_rule_revisions_scope_version_key" DO NOTHING;

-- Backfill: vehicle categories
INSERT INTO "rental_rule_revisions" (
  "id",
  "organization_id",
  "scope_type",
  "scope_id",
  "version",
  "status",
  "normalized_rules",
  "rules_hash",
  "effective_from",
  "effective_to",
  "published_at",
  "change_reason",
  "lock_version"
)
SELECT
  gen_random_uuid()::text,
  c."organization_id",
  'CATEGORY'::"RentalRuleRevisionScopeType",
  c."id",
  c."version",
  'ACTIVE'::"RentalRuleRevisionStatus",
  jsonb_build_object(
    'rules', rental_rules_revision_rules_json(
      c."minimum_age_years",
      c."minimum_license_holding_months",
      c."deposit_amount_cents",
      c."deposit_currency",
      c."credit_card_required",
      c."foreign_travel_policy"::text,
      c."additional_driver_policy"::text,
      c."young_driver_policy"::text,
      c."insurance_requirement",
      c."manual_approval_required",
      c."notes"
    ),
    'scopeMeta', jsonb_build_object(
      'isActive', c."is_active",
      'name', c."name",
      'status', c."status"::text,
      'type', c."type"::text
    )
  ),
  rental_rules_revision_hash(
    rental_rules_revision_rules_json(
      c."minimum_age_years",
      c."minimum_license_holding_months",
      c."deposit_amount_cents",
      c."deposit_currency",
      c."credit_card_required",
      c."foreign_travel_policy"::text,
      c."additional_driver_policy"::text,
      c."young_driver_policy"::text,
      c."insurance_requirement",
      c."manual_approval_required",
      c."notes"
    ),
    jsonb_build_object(
      'isActive', c."is_active",
      'name', c."name",
      'status', c."status"::text,
      'type', c."type"::text
    )
  ),
  COALESCE(c."status_changed_at", c."created_at"),
  NULL,
  c."updated_at",
  'Initial revision backfill (Prompt 24)',
  1
FROM "rental_vehicle_categories" c
ON CONFLICT ON CONSTRAINT "rental_rule_revisions_scope_version_key" DO NOTHING;

-- Backfill: vehicle overrides
INSERT INTO "rental_rule_revisions" (
  "id",
  "organization_id",
  "scope_type",
  "scope_id",
  "version",
  "status",
  "normalized_rules",
  "rules_hash",
  "effective_from",
  "effective_to",
  "published_at",
  "change_reason",
  "lock_version"
)
SELECT
  gen_random_uuid()::text,
  o."organization_id",
  'VEHICLE'::"RentalRuleRevisionScopeType",
  o."vehicle_id",
  o."version",
  'ACTIVE'::"RentalRuleRevisionStatus",
  jsonb_build_object(
    'rules', rental_rules_revision_rules_json(
      o."minimum_age_years",
      o."minimum_license_holding_months",
      o."deposit_amount_cents",
      o."deposit_currency",
      o."credit_card_required",
      o."foreign_travel_policy"::text,
      o."additional_driver_policy"::text,
      o."young_driver_policy"::text,
      o."insurance_requirement",
      o."manual_approval_required",
      o."notes"
    ),
    'scopeMeta', jsonb_build_object('vehicleId', o."vehicle_id")
  ),
  rental_rules_revision_hash(
    rental_rules_revision_rules_json(
      o."minimum_age_years",
      o."minimum_license_holding_months",
      o."deposit_amount_cents",
      o."deposit_currency",
      o."credit_card_required",
      o."foreign_travel_policy"::text,
      o."additional_driver_policy"::text,
      o."young_driver_policy"::text,
      o."insurance_requirement",
      o."manual_approval_required",
      o."notes"
    ),
    jsonb_build_object('vehicleId', o."vehicle_id")
  ),
  o."created_at",
  NULL,
  o."updated_at",
  'Initial revision backfill (Prompt 24)',
  1
FROM "vehicle_rental_requirement_overrides" o
ON CONFLICT ON CONSTRAINT "rental_rule_revisions_scope_version_key" DO NOTHING;

-- Drop helper functions (hashes persisted on rows).
DROP FUNCTION IF EXISTS rental_rules_revision_hash(JSONB, JSONB);
DROP FUNCTION IF EXISTS rental_rules_revision_rules_json(
  INTEGER, INTEGER, INTEGER, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT
);
