-- Tariff version lifecycle: SCHEDULED status, audit fields, one draft per group
ALTER TYPE "PriceTariffVersionStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';

ALTER TABLE "price_tariff_versions"
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "published_by" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "price_tariff_versions_one_draft_per_group"
  ON "price_tariff_versions" ("tariff_group_id")
  WHERE "status" = 'DRAFT';
