-- Prompt 07: subscription contract fields, subscription items, formal discounts.
-- Extends billing_subscriptions in place; legacy rows preserved.

-- CreateEnum
CREATE TYPE "BillingSubscriptionItemStatus" AS ENUM ('DRAFT', 'TRIALING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ENDED');
CREATE TYPE "BillingSubscriptionItemRole" AS ENUM ('BASE_PLAN', 'ADDON');
CREATE TYPE "BillingProrationBehavior" AS ENUM ('CREATE_PRORATIONS', 'NONE', 'ALWAYS_INVOICE');
CREATE TYPE "BillingDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "BillingDiscountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- Catalog: allow multiple active add-on items when enabled
ALTER TABLE "billing_catalog_products"
  ADD COLUMN IF NOT EXISTS "allow_multiple_items" BOOLEAN NOT NULL DEFAULT false;

-- Extend organization subscription (billing_subscriptions)
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_mode" "BillingStripeMode";
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "trial_start_at" TIMESTAMP(3);
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "trial_end_at" TIMESTAMP(3);
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3);
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMP(3);
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at" TIMESTAMP(3);
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "billing_anchor_day" INTEGER;
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "currency" CHAR(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "lock_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "updated_by_user_id" TEXT;

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_billing_anchor_day_check"
  CHECK ("billing_anchor_day" IS NULL OR ("billing_anchor_day" >= 1 AND "billing_anchor_day" <= 28));

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_lock_version_check"
  CHECK ("lock_version" >= 0);

-- Backfill stripe mode for existing Stripe-linked subscriptions
UPDATE "billing_subscriptions"
SET "stripe_mode" = 'LIVE'
WHERE "stripe_mode" IS NULL
  AND ("stripe_subscription_id" IS NOT NULL OR "stripe_customer_id" IS NOT NULL);

-- Stripe IDs unique per mode (replace single-column unique on subscription id)
DROP INDEX IF EXISTS "billing_subscriptions_stripe_subscription_id_key";

CREATE UNIQUE INDEX "billing_subscriptions_stripe_subscription_id_stripe_mode_key"
  ON "billing_subscriptions"("stripe_subscription_id", "stripe_mode");

CREATE UNIQUE INDEX "billing_subscriptions_stripe_customer_id_stripe_mode_key"
  ON "billing_subscriptions"("stripe_customer_id", "stripe_mode");

CREATE INDEX "billing_subscriptions_organization_id_status_idx"
  ON "billing_subscriptions"("organization_id", "status");

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Subscription items
CREATE TABLE "billing_subscription_items" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "billing_product_id" TEXT NOT NULL,
    "item_role" "BillingSubscriptionItemRole" NOT NULL,
    "price_book_id" TEXT,
    "price_version_id" TEXT,
    "price_tier_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "status" "BillingSubscriptionItemStatus" NOT NULL DEFAULT 'DRAFT',
    "stripe_subscription_item_id" TEXT,
    "stripe_mode" "BillingStripeMode",
    "proration_behavior" "BillingProrationBehavior" NOT NULL DEFAULT 'CREATE_PRORATIONS',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_subscription_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_subscription_items_quantity_check" CHECK ("quantity" >= 0)
);

CREATE UNIQUE INDEX "billing_subscription_items_stripe_item_id_stripe_mode_key"
  ON "billing_subscription_items"("stripe_subscription_item_id", "stripe_mode");

CREATE INDEX "billing_subscription_items_subscription_id_status_idx"
  ON "billing_subscription_items"("subscription_id", "status");

CREATE INDEX "billing_subscription_items_organization_id_item_role_status_idx"
  ON "billing_subscription_items"("organization_id", "item_role", "status");

CREATE INDEX "billing_subscription_items_billing_product_id_idx"
  ON "billing_subscription_items"("billing_product_id");

CREATE INDEX "billing_subscription_items_price_version_id_idx"
  ON "billing_subscription_items"("price_version_id");

-- At most one active base plan per organization (historical ENDED/CANCELLED excluded).
-- Note: valid_to windowing is enforced in billing_validate_subscription_item trigger;
-- partial indexes cannot use CURRENT_TIMESTAMP (not IMMUTABLE in PostgreSQL).
CREATE UNIQUE INDEX "billing_subscription_items_one_active_base_plan_per_org"
  ON "billing_subscription_items"("organization_id")
  WHERE "item_role" = 'BASE_PLAN'
    AND "status" IN ('ACTIVE', 'TRIALING');

ALTER TABLE "billing_subscription_items"
  ADD CONSTRAINT "billing_subscription_items_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_subscription_items"
  ADD CONSTRAINT "billing_subscription_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_subscription_items"
  ADD CONSTRAINT "billing_subscription_items_billing_product_id_fkey"
  FOREIGN KEY ("billing_product_id") REFERENCES "billing_catalog_products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_subscription_items"
  ADD CONSTRAINT "billing_subscription_items_price_book_id_fkey"
  FOREIGN KEY ("price_book_id") REFERENCES "billing_price_books"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_subscription_items"
  ADD CONSTRAINT "billing_subscription_items_price_version_id_fkey"
  FOREIGN KEY ("price_version_id") REFERENCES "billing_price_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_subscription_items"
  ADD CONSTRAINT "billing_subscription_items_price_tier_id_fkey"
  FOREIGN KEY ("price_tier_id") REFERENCES "billing_price_tiers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Discounts
CREATE TABLE "billing_discounts" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "subscription_item_id" TEXT,
    "discount_type" "BillingDiscountType" NOT NULL,
    "percent_bps" INTEGER,
    "fixed_amount_cents" INTEGER,
    "currency" CHAR(3),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "reason" TEXT,
    "status" "BillingDiscountStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripe_mode" "BillingStripeMode",
    "stripe_coupon_id" TEXT,
    "stripe_promotion_code_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_discounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_discounts_fixed_amount_cents_check" CHECK ("fixed_amount_cents" IS NULL OR "fixed_amount_cents" >= 0),
    CONSTRAINT "billing_discounts_percent_bps_check" CHECK ("percent_bps" IS NULL OR ("percent_bps" >= 0 AND "percent_bps" <= 10000))
);

CREATE UNIQUE INDEX "billing_discounts_stripe_coupon_id_stripe_mode_key"
  ON "billing_discounts"("stripe_coupon_id", "stripe_mode");

CREATE UNIQUE INDEX "billing_discounts_stripe_promotion_code_id_stripe_mode_key"
  ON "billing_discounts"("stripe_promotion_code_id", "stripe_mode");

CREATE INDEX "billing_discounts_subscription_id_status_idx"
  ON "billing_discounts"("subscription_id", "status");

CREATE INDEX "billing_discounts_subscription_item_id_idx"
  ON "billing_discounts"("subscription_item_id");

ALTER TABLE "billing_discounts"
  ADD CONSTRAINT "billing_discounts_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_discounts"
  ADD CONSTRAINT "billing_discounts_subscription_item_id_fkey"
  FOREIGN KEY ("subscription_item_id") REFERENCES "billing_subscription_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_discounts"
  ADD CONSTRAINT "billing_discounts_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Validate subscription items: base plan must be RENTAL/FLEET; add-on multiplicity per catalog
CREATE OR REPLACE FUNCTION billing_validate_subscription_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_key TEXT;
  product_role "BillingProductRole";
  allow_multiple BOOLEAN;
  active_addon_count INTEGER;
BEGIN
  SELECT "key", "product_role", "allow_multiple_items"
    INTO product_key, product_role, allow_multiple
  FROM "billing_catalog_products"
  WHERE "id" = NEW."billing_product_id";

  IF product_role IS NULL THEN
    RAISE EXCEPTION 'Unknown billing product %', NEW."billing_product_id";
  END IF;

  IF NEW."item_role" = 'BASE_PLAN' THEN
    IF product_role <> 'BASE_PLAN' THEN
      RAISE EXCEPTION 'Base plan item requires BASE_PLAN product, got %', product_role;
    END IF;
    IF product_key NOT IN ('RENTAL', 'FLEET') THEN
      RAISE EXCEPTION 'Base plan must be RENTAL or FLEET, got %', product_key;
    END IF;
  ELSIF NEW."item_role" = 'ADDON' THEN
    IF product_role <> 'ADDON' THEN
      RAISE EXCEPTION 'Add-on item requires ADDON product, got %', product_role;
    END IF;
    IF NEW."status" IN ('ACTIVE', 'TRIALING')
       AND (NEW."valid_to" IS NULL OR NEW."valid_to" > CURRENT_TIMESTAMP)
       AND allow_multiple = false THEN
      SELECT COUNT(*) INTO active_addon_count
      FROM "billing_subscription_items"
      WHERE "organization_id" = NEW."organization_id"
        AND "billing_product_id" = NEW."billing_product_id"
        AND "item_role" = 'ADDON'
        AND "status" IN ('ACTIVE', 'TRIALING')
        AND ("valid_to" IS NULL OR "valid_to" > CURRENT_TIMESTAMP)
        AND ("id" IS DISTINCT FROM NEW."id");

      IF active_addon_count > 0 THEN
        RAISE EXCEPTION 'Add-on product % does not allow multiple active items', product_key;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_subscription_items_validate ON "billing_subscription_items";
CREATE TRIGGER billing_subscription_items_validate
  BEFORE INSERT OR UPDATE ON "billing_subscription_items"
  FOR EACH ROW
  EXECUTE FUNCTION billing_validate_subscription_item();

-- Validate discount shape
CREATE OR REPLACE FUNCTION billing_validate_discount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."discount_type" = 'PERCENTAGE' THEN
    IF NEW."percent_bps" IS NULL THEN
      RAISE EXCEPTION 'Percentage discount requires percent_bps';
    END IF;
    IF NEW."percent_bps" < 0 OR NEW."percent_bps" > 10000 THEN
      RAISE EXCEPTION 'percent_bps must be between 0 and 10000';
    END IF;
  ELSIF NEW."discount_type" = 'FIXED_AMOUNT' THEN
    IF NEW."fixed_amount_cents" IS NULL THEN
      RAISE EXCEPTION 'Fixed amount discount requires fixed_amount_cents';
    END IF;
    IF NEW."fixed_amount_cents" < 0 THEN
      RAISE EXCEPTION 'fixed_amount_cents cannot be negative';
    END IF;
    IF NEW."currency" IS NULL THEN
      RAISE EXCEPTION 'Fixed amount discount requires currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_discounts_validate ON "billing_discounts";
CREATE TRIGGER billing_discounts_validate
  BEFORE INSERT OR UPDATE ON "billing_discounts"
  FOR EACH ROW
  EXECUTE FUNCTION billing_validate_discount();

-- Denormalized organization_id must match parent subscription
CREATE OR REPLACE FUNCTION billing_sync_subscription_item_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_org_id TEXT;
BEGIN
  SELECT "organization_id" INTO parent_org_id
  FROM "billing_subscriptions"
  WHERE "id" = NEW."subscription_id";

  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'Subscription % not found', NEW."subscription_id";
  END IF;

  IF NEW."organization_id" IS DISTINCT FROM parent_org_id THEN
    RAISE EXCEPTION 'subscription_item organization_id must match subscription organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_subscription_items_sync_org ON "billing_subscription_items";
CREATE TRIGGER billing_subscription_items_sync_org
  BEFORE INSERT OR UPDATE ON "billing_subscription_items"
  FOR EACH ROW
  EXECUTE FUNCTION billing_sync_subscription_item_organization();
