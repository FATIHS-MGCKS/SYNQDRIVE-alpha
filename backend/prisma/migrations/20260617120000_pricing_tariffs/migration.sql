-- CreateEnum
CREATE TYPE "PriceTariffVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "PriceOptionPricingType" AS ENUM ('PER_DAY', 'PER_BOOKING');
CREATE TYPE "BookingPriceLineItemType" AS ENUM ('BASE_RENTAL', 'INSURANCE', 'EXTRA', 'MILEAGE_PACKAGE', 'DISCOUNT', 'TAX', 'DEPOSIT', 'MANUAL_ADJUSTMENT', 'EXTRA_KM');

-- CreateTable
CREATE TABLE "price_books" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "tax_rate_percent" INTEGER NOT NULL DEFAULT 19,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_books_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_tariff_groups" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "price_book_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_tariff_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_tariff_versions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "price_book_id" TEXT NOT NULL,
    "tariff_group_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "PriceTariffVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_tariff_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tariff_rates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tariff_version_id" TEXT NOT NULL,
    "daily_rate_cents" INTEGER NOT NULL,
    "weekly_rate_cents" INTEGER NOT NULL DEFAULT 0,
    "monthly_rate_cents" INTEGER NOT NULL DEFAULT 0,
    "included_km_per_day" INTEGER NOT NULL DEFAULT 200,
    "extra_km_price_cents" INTEGER NOT NULL DEFAULT 0,
    "deposit_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "minimum_rental_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mileage_packages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tariff_version_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "included_km" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mileage_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tariff_insurance_options" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tariff_version_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "pricing_type" "PriceOptionPricingType" NOT NULL DEFAULT 'PER_DAY',
    "deductible_cents" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_insurance_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tariff_extra_options" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tariff_version_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "pricing_type" "PriceOptionPricingType" NOT NULL DEFAULT 'PER_DAY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_extra_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_tariff_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "tariff_group_id" TEXT NOT NULL,
    "price_book_id" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_tariff_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_price_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "price_book_id" TEXT,
    "tariff_group_id" TEXT,
    "tariff_version_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "tax_rate_percent" INTEGER NOT NULL,
    "rental_days" INTEGER NOT NULL,
    "included_km" INTEGER NOT NULL,
    "extra_km_price_cents" INTEGER NOT NULL,
    "deposit_amount_cents" INTEGER NOT NULL,
    "subtotal_net_cents" INTEGER NOT NULL,
    "tax_amount_cents" INTEGER NOT NULL,
    "total_gross_cents" INTEGER NOT NULL,
    "total_due_now_cents" INTEGER,
    "pricing_input_json" JSONB,
    "pricing_warnings_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_price_line_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_price_snapshot_id" TEXT NOT NULL,
    "type" "BookingPriceLineItemType" NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "total_net_cents" INTEGER NOT NULL,
    "tax_rate_percent" INTEGER NOT NULL,
    "total_gross_cents" INTEGER NOT NULL,
    "metadata_json" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_price_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_tariff_versions_tariff_group_id_version_number_key" ON "price_tariff_versions"("tariff_group_id", "version_number");
CREATE UNIQUE INDEX "tariff_rates_tariff_version_id_key" ON "tariff_rates"("tariff_version_id");
CREATE UNIQUE INDEX "booking_price_snapshots_booking_id_key" ON "booking_price_snapshots"("booking_id");

CREATE INDEX "price_books_organization_id_idx" ON "price_books"("organization_id");
CREATE INDEX "price_tariff_groups_organization_id_idx" ON "price_tariff_groups"("organization_id");
CREATE INDEX "price_tariff_groups_price_book_id_idx" ON "price_tariff_groups"("price_book_id");
CREATE INDEX "price_tariff_versions_organization_id_idx" ON "price_tariff_versions"("organization_id");
CREATE INDEX "price_tariff_versions_tariff_group_id_status_idx" ON "price_tariff_versions"("tariff_group_id", "status");
CREATE INDEX "tariff_rates_organization_id_idx" ON "tariff_rates"("organization_id");
CREATE INDEX "mileage_packages_organization_id_idx" ON "mileage_packages"("organization_id");
CREATE INDEX "mileage_packages_tariff_version_id_idx" ON "mileage_packages"("tariff_version_id");
CREATE INDEX "tariff_insurance_options_organization_id_idx" ON "tariff_insurance_options"("organization_id");
CREATE INDEX "tariff_insurance_options_tariff_version_id_idx" ON "tariff_insurance_options"("tariff_version_id");
CREATE INDEX "tariff_extra_options_organization_id_idx" ON "tariff_extra_options"("organization_id");
CREATE INDEX "tariff_extra_options_tariff_version_id_idx" ON "tariff_extra_options"("tariff_version_id");
CREATE INDEX "vehicle_tariff_assignments_organization_id_idx" ON "vehicle_tariff_assignments"("organization_id");
CREATE INDEX "vehicle_tariff_assignments_vehicle_id_is_active_idx" ON "vehicle_tariff_assignments"("vehicle_id", "is_active");
CREATE INDEX "vehicle_tariff_assignments_tariff_group_id_idx" ON "vehicle_tariff_assignments"("tariff_group_id");
CREATE INDEX "booking_price_snapshots_organization_id_idx" ON "booking_price_snapshots"("organization_id");
CREATE INDEX "booking_price_line_items_organization_id_idx" ON "booking_price_line_items"("organization_id");
CREATE INDEX "booking_price_line_items_booking_price_snapshot_id_idx" ON "booking_price_line_items"("booking_price_snapshot_id");

-- AddForeignKey
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_tariff_groups" ADD CONSTRAINT "price_tariff_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_tariff_groups" ADD CONSTRAINT "price_tariff_groups_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_tariff_versions" ADD CONSTRAINT "price_tariff_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_tariff_versions" ADD CONSTRAINT "price_tariff_versions_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_tariff_versions" ADD CONSTRAINT "price_tariff_versions_tariff_group_id_fkey" FOREIGN KEY ("tariff_group_id") REFERENCES "price_tariff_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "price_tariff_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mileage_packages" ADD CONSTRAINT "mileage_packages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mileage_packages" ADD CONSTRAINT "mileage_packages_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "price_tariff_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tariff_insurance_options" ADD CONSTRAINT "tariff_insurance_options_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tariff_insurance_options" ADD CONSTRAINT "tariff_insurance_options_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "price_tariff_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tariff_extra_options" ADD CONSTRAINT "tariff_extra_options_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tariff_extra_options" ADD CONSTRAINT "tariff_extra_options_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "price_tariff_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_tariff_assignments" ADD CONSTRAINT "vehicle_tariff_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_tariff_assignments" ADD CONSTRAINT "vehicle_tariff_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_tariff_assignments" ADD CONSTRAINT "vehicle_tariff_assignments_tariff_group_id_fkey" FOREIGN KEY ("tariff_group_id") REFERENCES "price_tariff_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_tariff_assignments" ADD CONSTRAINT "vehicle_tariff_assignments_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_tariff_group_id_fkey" FOREIGN KEY ("tariff_group_id") REFERENCES "price_tariff_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "price_tariff_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_price_line_items" ADD CONSTRAINT "booking_price_line_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_price_line_items" ADD CONSTRAINT "booking_price_line_items_booking_price_snapshot_id_fkey" FOREIGN KEY ("booking_price_snapshot_id") REFERENCES "booking_price_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
