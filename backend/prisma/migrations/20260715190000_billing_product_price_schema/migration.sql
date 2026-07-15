-- Prompt 06: additive billing product catalog, pricebook extensions, Stripe mappings,
-- published-version immutability guards. Existing billing_price_* tables are preserved.

-- CreateEnum
CREATE TYPE "BillingProductRole" AS ENUM ('BASE_PLAN', 'ADDON');
CREATE TYPE "BillingCatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "BillingPriceBookStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "BillingStripeMode" AS ENUM ('TEST', 'LIVE');
CREATE TYPE "BillingStripeMappingStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'DRIFTED');

-- Extend billing interval (additive)
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'YEARLY';

-- Catalog products
CREATE TABLE "billing_catalog_products" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_role" "BillingProductRole" NOT NULL,
    "status" "BillingCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_catalog_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_catalog_products_key_key" ON "billing_catalog_products"("key");
CREATE INDEX "billing_catalog_products_status_sort_order_idx" ON "billing_catalog_products"("status", "sort_order");

-- Extend price books (non-destructive)
ALTER TABLE "billing_price_books" ADD COLUMN "billing_product_id" TEXT;
ALTER TABLE "billing_price_books" ADD COLUMN "status" "BillingPriceBookStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "billing_price_books" ADD COLUMN "internal_label" TEXT;

-- Normalize currency to ISO 4217 (3-letter) where possible
ALTER TABLE "billing_price_books"
  ALTER COLUMN "currency" SET DEFAULT 'EUR',
  ALTER COLUMN "currency" TYPE CHAR(3) USING UPPER(LEFT("currency", 3));

CREATE INDEX "billing_price_books_billing_product_id_idx" ON "billing_price_books"("billing_product_id");
CREATE INDEX "billing_price_books_status_idx" ON "billing_price_books"("status");

ALTER TABLE "billing_price_books"
  ADD CONSTRAINT "billing_price_books_billing_product_id_fkey"
  FOREIGN KEY ("billing_product_id") REFERENCES "billing_catalog_products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Extend price versions
ALTER TABLE "billing_price_versions" ADD COLUMN "published_by_user_id" TEXT;

CREATE INDEX "billing_price_versions_status_published_at_idx"
  ON "billing_price_versions"("status", "published_at");

ALTER TABLE "billing_price_versions"
  ADD CONSTRAINT "billing_price_versions_published_by_user_id_fkey"
  FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Stripe mappings (TEST/LIVE separated)
CREATE TABLE "billing_stripe_price_mappings" (
    "id" TEXT NOT NULL,
    "price_book_id" TEXT NOT NULL,
    "billing_product_id" TEXT,
    "stripe_mode" "BillingStripeMode" NOT NULL,
    "stripe_product_id" TEXT,
    "stripe_price_id" TEXT,
    "mapping_status" "BillingStripeMappingStatus" NOT NULL DEFAULT 'PENDING',
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_stripe_price_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_stripe_price_mappings_price_book_id_stripe_mode_key"
  ON "billing_stripe_price_mappings"("price_book_id", "stripe_mode");

CREATE UNIQUE INDEX "billing_stripe_price_mappings_stripe_price_id_stripe_mode_key"
  ON "billing_stripe_price_mappings"("stripe_price_id", "stripe_mode");

CREATE INDEX "billing_stripe_price_mappings_billing_product_id_idx"
  ON "billing_stripe_price_mappings"("billing_product_id");

CREATE INDEX "billing_stripe_price_mappings_mapping_status_idx"
  ON "billing_stripe_price_mappings"("mapping_status");

CREATE INDEX "billing_stripe_price_mappings_stripe_product_id_stripe_mode_idx"
  ON "billing_stripe_price_mappings"("stripe_product_id", "stripe_mode");

ALTER TABLE "billing_stripe_price_mappings"
  ADD CONSTRAINT "billing_stripe_price_mappings_price_book_id_fkey"
  FOREIGN KEY ("price_book_id") REFERENCES "billing_price_books"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_stripe_price_mappings"
  ADD CONSTRAINT "billing_stripe_price_mappings_billing_product_id_fkey"
  FOREIGN KEY ("billing_product_id") REFERENCES "billing_catalog_products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed canonical catalog products (idempotent by key)
INSERT INTO "billing_catalog_products" ("id", "key", "name", "description", "product_role", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('bprod-rental-0001-4000-8000-000000000001', 'RENTAL', 'SynqDrive Rental', 'Rental platform base plan', 'BASE_PLAN', 'ACTIVE', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bprod-fleet-0001-4000-8000-000000000002', 'FLEET', 'SynqDrive Fleet', 'Fleet platform base plan', 'BASE_PLAN', 'ACTIVE', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bprod-addon-voice-4000-8000-000000000003', 'VOICE_AGENT', 'Voice Agent', 'Voice agent add-on', 'ADDON', 'ACTIVE', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bprod-addon-ai-0001-4000-8000-000000000004', 'AI_PACKAGE', 'AI Package', 'AI package add-on', 'ADDON', 'ACTIVE', 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bprod-addon-wa-0001-4000-8000-000000000005', 'WHATSAPP', 'WhatsApp', 'WhatsApp business add-on', 'ADDON', 'ACTIVE', 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Link existing price books to catalog products by legacy product_key (best-effort backfill)
UPDATE "billing_price_books" pb
SET "billing_product_id" = bp."id"
FROM "billing_catalog_products" bp
WHERE pb."billing_product_id" IS NULL
  AND UPPER(pb."product_key") = bp."key";

UPDATE "billing_price_books" pb
SET "billing_product_id" = bp."id"
FROM "billing_catalog_products" bp
WHERE pb."billing_product_id" IS NULL
  AND pb."product_key" = 'FLEET'
  AND bp."key" = 'FLEET';

-- Published price versions are immutable (ACTIVE + published_at = published contract)
CREATE OR REPLACE FUNCTION billing_guard_published_price_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'ACTIVE' AND OLD."published_at" IS NOT NULL THEN
      IF NEW."status" = 'ARCHIVED'
         AND NEW."version_number" = OLD."version_number"
         AND NEW."price_book_id" = OLD."price_book_id"
         AND NEW."effective_from" IS NOT DISTINCT FROM OLD."effective_from"
         AND NEW."effective_to" IS NOT DISTINCT FROM OLD."effective_to"
         AND NEW."tier_mode" = OLD."tier_mode"
         AND NEW."published_at" IS NOT DISTINCT FROM OLD."published_at"
         AND NEW."published_by_user_id" IS NOT DISTINCT FROM OLD."published_by_user_id"
         AND NEW."created_by_user_id" IS NOT DISTINCT FROM OLD."created_by_user_id"
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Published billing price version % is immutable', OLD."id"
        USING ERRCODE = '23506';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'ACTIVE' AND OLD."published_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Published billing price version % cannot be deleted', OLD."id"
        USING ERRCODE = '23506';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_price_versions_immutable_guard ON "billing_price_versions";
CREATE TRIGGER billing_price_versions_immutable_guard
  BEFORE UPDATE OR DELETE ON "billing_price_versions"
  FOR EACH ROW
  EXECUTE FUNCTION billing_guard_published_price_version();

CREATE OR REPLACE FUNCTION billing_guard_published_price_tier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "BillingPriceVersionStatus";
  parent_published_at TIMESTAMP(3);
  parent_id TEXT;
BEGIN
  parent_id := COALESCE(NEW."price_version_id", OLD."price_version_id");
  SELECT "status", "published_at"
    INTO parent_status, parent_published_at
  FROM "billing_price_versions"
  WHERE "id" = parent_id;

  IF parent_status = 'ACTIVE' AND parent_published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tiers of published billing price version % are immutable', parent_id
      USING ERRCODE = '23506';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_price_tiers_immutable_guard ON "billing_price_tiers";
CREATE TRIGGER billing_price_tiers_immutable_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "billing_price_tiers"
  FOR EACH ROW
  EXECUTE FUNCTION billing_guard_published_price_tier();
