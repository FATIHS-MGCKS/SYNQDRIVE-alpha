-- Prompt 20: explicit Stripe catalog mapping per billing product + price version.

ALTER TYPE "BillingStripeMappingStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

CREATE TABLE "billing_stripe_catalog_mappings" (
  "id" TEXT NOT NULL,
  "billing_product_id" TEXT NOT NULL,
  "price_version_id" TEXT NOT NULL,
  "price_book_id" TEXT NOT NULL,
  "stripe_mode" "BillingStripeMode" NOT NULL,
  "stripe_product_id" TEXT NOT NULL,
  "stripe_price_id" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "billing_interval" "BillingInterval" NOT NULL,
  "billing_model" "BillingModel" NOT NULL DEFAULT 'PER_CONNECTED_VEHICLE',
  "stripe_presentation" TEXT NOT NULL DEFAULT 'recurring_per_unit',
  "mapping_status" "BillingStripeMappingStatus" NOT NULL DEFAULT 'PENDING',
  "last_verified_at" TIMESTAMP(3),
  "last_error" TEXT,
  "disabled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_stripe_catalog_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_stripe_catalog_mappings_price_version_id_stripe_mode_key"
  ON "billing_stripe_catalog_mappings"("price_version_id", "stripe_mode");

CREATE UNIQUE INDEX "billing_stripe_catalog_mappings_stripe_price_id_stripe_mode_key"
  ON "billing_stripe_catalog_mappings"("stripe_price_id", "stripe_mode");

CREATE INDEX "billing_stripe_catalog_mappings_billing_product_id_stripe_mode_idx"
  ON "billing_stripe_catalog_mappings"("billing_product_id", "stripe_mode");

CREATE INDEX "billing_stripe_catalog_mappings_price_book_id_stripe_mode_idx"
  ON "billing_stripe_catalog_mappings"("price_book_id", "stripe_mode");

CREATE INDEX "billing_stripe_catalog_mappings_mapping_status_idx"
  ON "billing_stripe_catalog_mappings"("mapping_status");

ALTER TABLE "billing_stripe_catalog_mappings"
  ADD CONSTRAINT "billing_stripe_catalog_mappings_billing_product_id_fkey"
  FOREIGN KEY ("billing_product_id") REFERENCES "billing_catalog_products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_stripe_catalog_mappings"
  ADD CONSTRAINT "billing_stripe_catalog_mappings_price_version_id_fkey"
  FOREIGN KEY ("price_version_id") REFERENCES "billing_price_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_stripe_catalog_mappings"
  ADD CONSTRAINT "billing_stripe_catalog_mappings_price_book_id_fkey"
  FOREIGN KEY ("price_book_id") REFERENCES "billing_price_books"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
