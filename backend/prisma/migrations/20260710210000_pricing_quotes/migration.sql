-- Pricing quotes: short-lived price locks between simulation and booking create.

CREATE TYPE "PricingQuoteStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED');

CREATE TABLE "pricing_quotes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "vehicle_id" TEXT NOT NULL,
    "pickup_at" TIMESTAMP(3) NOT NULL,
    "return_at" TIMESTAMP(3) NOT NULL,
    "tariff_version_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PricingQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "calculated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_booking_id" TEXT,
    "pricing_context_json" JSONB NOT NULL,
    "pricing_input_json" JSONB NOT NULL,
    "line_items_json" JSONB NOT NULL,
    "totals_json" JSONB NOT NULL,
    "integrity_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_quotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_quotes_consumed_by_booking_id_key" ON "pricing_quotes"("consumed_by_booking_id");
CREATE INDEX "pricing_quotes_organization_id_status_expires_at_idx" ON "pricing_quotes"("organization_id", "status", "expires_at");
CREATE INDEX "pricing_quotes_vehicle_id_idx" ON "pricing_quotes"("vehicle_id");
CREATE INDEX "pricing_quotes_created_by_user_id_idx" ON "pricing_quotes"("created_by_user_id");

ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_consumed_by_booking_id_fkey" FOREIGN KEY ("consumed_by_booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "price_tariff_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
