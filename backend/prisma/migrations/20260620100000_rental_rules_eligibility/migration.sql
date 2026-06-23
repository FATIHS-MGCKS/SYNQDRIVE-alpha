-- Rental Rules & Vehicle Eligibility Center (org defaults, categories, vehicle overrides)

CREATE TYPE "RentalForeignTravelPolicy" AS ENUM ('ALLOWED', 'APPROVAL_REQUIRED', 'NOT_ALLOWED');
CREATE TYPE "RentalAdditionalDriverPolicy" AS ENUM ('ALLOWED', 'APPROVAL_REQUIRED', 'NOT_ALLOWED');
CREATE TYPE "RentalYoungDriverPolicy" AS ENUM ('ALLOWED', 'FEE_REQUIRED', 'NOT_ALLOWED');
CREATE TYPE "RentalVehicleCategoryType" AS ENUM (
  'ECONOMY',
  'COMPACT',
  'TRANSPORTER',
  'PREMIUM',
  'PERFORMANCE',
  'LUXURY',
  'EV_PERFORMANCE',
  'CUSTOM'
);

CREATE TABLE "organization_rental_rules" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "minimum_age_years" INTEGER,
  "minimum_license_holding_months" INTEGER,
  "deposit_amount_cents" INTEGER,
  "deposit_currency" TEXT NOT NULL DEFAULT 'EUR',
  "credit_card_required" BOOLEAN,
  "foreign_travel_policy" "RentalForeignTravelPolicy",
  "additional_driver_policy" "RentalAdditionalDriverPolicy",
  "young_driver_policy" "RentalYoungDriverPolicy",
  "insurance_requirement" TEXT,
  "manual_approval_required" BOOLEAN,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_rental_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_rental_rules_organization_id_key" ON "organization_rental_rules"("organization_id");

CREATE TABLE "rental_vehicle_categories" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "RentalVehicleCategoryType",
  "color" TEXT,
  "icon" TEXT,
  "minimum_age_years" INTEGER,
  "minimum_license_holding_months" INTEGER,
  "deposit_amount_cents" INTEGER,
  "deposit_currency" TEXT,
  "credit_card_required" BOOLEAN,
  "foreign_travel_policy" "RentalForeignTravelPolicy",
  "additional_driver_policy" "RentalAdditionalDriverPolicy",
  "young_driver_policy" "RentalYoungDriverPolicy",
  "insurance_requirement" TEXT,
  "manual_approval_required" BOOLEAN,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rental_vehicle_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rental_vehicle_categories_organization_id_idx" ON "rental_vehicle_categories"("organization_id");
CREATE INDEX "rental_vehicle_categories_organization_id_is_active_idx" ON "rental_vehicle_categories"("organization_id", "is_active");

CREATE TABLE "vehicle_rental_requirement_overrides" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "minimum_age_years" INTEGER,
  "minimum_license_holding_months" INTEGER,
  "deposit_amount_cents" INTEGER,
  "deposit_currency" TEXT,
  "credit_card_required" BOOLEAN,
  "foreign_travel_policy" "RentalForeignTravelPolicy",
  "additional_driver_policy" "RentalAdditionalDriverPolicy",
  "young_driver_policy" "RentalYoungDriverPolicy",
  "insurance_requirement" TEXT,
  "manual_approval_required" BOOLEAN,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vehicle_rental_requirement_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_rental_requirement_overrides_vehicle_id_key" ON "vehicle_rental_requirement_overrides"("vehicle_id");
CREATE INDEX "vehicle_rental_requirement_overrides_organization_id_idx" ON "vehicle_rental_requirement_overrides"("organization_id");

ALTER TABLE "vehicles" ADD COLUMN "rental_category_id" TEXT;
CREATE INDEX "vehicles_rental_category_id_idx" ON "vehicles"("rental_category_id");

ALTER TABLE "organization_rental_rules"
  ADD CONSTRAINT "organization_rental_rules_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_vehicle_categories"
  ADD CONSTRAINT "rental_vehicle_categories_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_rental_requirement_overrides"
  ADD CONSTRAINT "vehicle_rental_requirement_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_rental_requirement_overrides"
  ADD CONSTRAINT "vehicle_rental_requirement_overrides_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_rental_category_id_fkey"
  FOREIGN KEY ("rental_category_id") REFERENCES "rental_vehicle_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
