-- Billing pricebook v2: versioned per-vehicle pricing, usage snapshots, invoice lines,
-- payment methods, Stripe webhook idempotency, audit log, org price overrides.
-- Existing billing_subscriptions / billing_invoices data is preserved.

-- CreateEnum
CREATE TYPE "BillingModel" AS ENUM ('PER_CONNECTED_VEHICLE');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY');
CREATE TYPE "BillingPriceVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "BillingTierMode" AS ENUM ('VOLUME', 'GRADUATED');
CREATE TYPE "BillingUsageCalculationStatus" AS ENUM ('OK', 'PRICE_NOT_CONFIGURED', 'NO_ACTIVE_PRICE_VERSION', 'NO_BILLABLE_VEHICLES');
CREATE TYPE "BillingPaymentMethodType" AS ENUM ('CARD', 'SEPA_DEBIT', 'UNKNOWN');
CREATE TYPE "BillingPaymentMethodStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REQUIRES_ACTION', 'FAILED', 'DETACHED');
CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');
CREATE TYPE "BillingOrgPriceOverrideStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- AlterTable: optional pricebook links on existing subscriptions
ALTER TABLE "billing_subscriptions" ADD COLUMN "price_book_id" TEXT;
ALTER TABLE "billing_subscriptions" ADD COLUMN "price_version_id" TEXT;

-- CreateTable
CREATE TABLE "billing_price_books" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "billing_model" "BillingModel" NOT NULL DEFAULT 'PER_CONNECTED_VEHICLE',
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_price_books_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_price_versions" (
    "id" TEXT NOT NULL,
    "price_book_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_label" TEXT,
    "status" "BillingPriceVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "tier_mode" "BillingTierMode" NOT NULL DEFAULT 'VOLUME',
    "created_by_user_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_price_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_price_tiers" (
    "id" TEXT NOT NULL,
    "price_version_id" TEXT NOT NULL,
    "min_vehicles" INTEGER NOT NULL,
    "max_vehicles" INTEGER,
    "unit_price_cents" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_price_tiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "usage_snapshot_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_amount_cents" INTEGER,
    "subtotal_cents" INTEGER NOT NULL,
    "tax_rate_bps" INTEGER,
    "tax_cents" INTEGER,
    "total_cents" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_usage_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "connected_vehicle_count" INTEGER NOT NULL,
    "billable_vehicle_count" INTEGER NOT NULL,
    "billable_vehicle_ids" JSONB NOT NULL,
    "excluded_vehicle_ids" JSONB NOT NULL DEFAULT '[]',
    "excluded_reason_summary" JSONB,
    "price_book_id" TEXT,
    "price_version_id" TEXT,
    "price_tier_id" TEXT,
    "unit_price_cents" INTEGER,
    "subtotal_cents" INTEGER,
    "tax_cents" INTEGER,
    "total_cents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "calculation_status" "BillingUsageCalculationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_usage_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_payment_methods" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stripe_payment_method_id" TEXT,
    "type" "BillingPaymentMethodType" NOT NULL DEFAULT 'UNKNOWN',
    "brand" TEXT,
    "last4" TEXT,
    "exp_month" INTEGER,
    "exp_year" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "BillingPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload_hash" TEXT,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_organization_price_overrides" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "price_book_id" TEXT,
    "price_version_id" TEXT,
    "custom_unit_price_cents" INTEGER,
    "custom_monthly_minimum_cents" INTEGER,
    "reason" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "status" "BillingOrgPriceOverrideStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_organization_price_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_price_books_product_key_idx" ON "billing_price_books"("product_key");
CREATE INDEX "billing_price_books_is_default_idx" ON "billing_price_books"("is_default");
CREATE UNIQUE INDEX "billing_price_versions_price_book_id_version_number_key" ON "billing_price_versions"("price_book_id", "version_number");
CREATE INDEX "billing_price_versions_price_book_id_status_idx" ON "billing_price_versions"("price_book_id", "status");
CREATE INDEX "billing_price_tiers_price_version_id_sort_order_idx" ON "billing_price_tiers"("price_version_id", "sort_order");
CREATE INDEX "billing_subscriptions_price_book_id_idx" ON "billing_subscriptions"("price_book_id");
CREATE INDEX "billing_invoice_lines_invoice_id_idx" ON "billing_invoice_lines"("invoice_id");
CREATE INDEX "billing_invoice_lines_usage_snapshot_id_idx" ON "billing_invoice_lines"("usage_snapshot_id");
CREATE INDEX "billing_usage_snapshots_organization_id_period_start_idx" ON "billing_usage_snapshots"("organization_id", "period_start");
CREATE INDEX "billing_usage_snapshots_price_version_id_idx" ON "billing_usage_snapshots"("price_version_id");
CREATE INDEX "billing_payment_methods_organization_id_idx" ON "billing_payment_methods"("organization_id");
CREATE UNIQUE INDEX "billing_payment_methods_stripe_payment_method_id_key" ON "billing_payment_methods"("stripe_payment_method_id");
CREATE UNIQUE INDEX "stripe_webhook_events_stripe_event_id_key" ON "stripe_webhook_events"("stripe_event_id");
CREATE INDEX "stripe_webhook_events_status_created_at_idx" ON "stripe_webhook_events"("status", "created_at");
CREATE INDEX "billing_audit_logs_organization_id_created_at_idx" ON "billing_audit_logs"("organization_id", "created_at");
CREATE INDEX "billing_audit_logs_entity_type_entity_id_idx" ON "billing_audit_logs"("entity_type", "entity_id");
CREATE INDEX "billing_organization_price_overrides_organization_id_status_idx" ON "billing_organization_price_overrides"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "billing_price_versions" ADD CONSTRAINT "billing_price_versions_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "billing_price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_price_versions" ADD CONSTRAINT "billing_price_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_price_tiers" ADD CONSTRAINT "billing_price_tiers_price_version_id_fkey" FOREIGN KEY ("price_version_id") REFERENCES "billing_price_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "billing_price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_price_version_id_fkey" FOREIGN KEY ("price_version_id") REFERENCES "billing_price_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_usage_snapshot_id_fkey" FOREIGN KEY ("usage_snapshot_id") REFERENCES "billing_usage_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_usage_snapshots" ADD CONSTRAINT "billing_usage_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_usage_snapshots" ADD CONSTRAINT "billing_usage_snapshots_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "billing_price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_usage_snapshots" ADD CONSTRAINT "billing_usage_snapshots_price_version_id_fkey" FOREIGN KEY ("price_version_id") REFERENCES "billing_price_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_usage_snapshots" ADD CONSTRAINT "billing_usage_snapshots_price_tier_id_fkey" FOREIGN KEY ("price_tier_id") REFERENCES "billing_price_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_payment_methods" ADD CONSTRAINT "billing_payment_methods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_audit_logs" ADD CONSTRAINT "billing_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_organization_price_overrides" ADD CONSTRAINT "billing_organization_price_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_organization_price_overrides" ADD CONSTRAINT "billing_organization_price_overrides_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "billing_price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_organization_price_overrides" ADD CONSTRAINT "billing_organization_price_overrides_price_version_id_fkey" FOREIGN KEY ("price_version_id") REFERENCES "billing_price_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
