-- Rental vehicle category lifecycle (Prompt 23)
CREATE TYPE "RentalVehicleCategoryStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

ALTER TABLE "rental_vehicle_categories"
  ADD COLUMN "status" "RentalVehicleCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "status_changed_at" TIMESTAMP(3);

UPDATE "rental_vehicle_categories"
SET
  "status" = CASE WHEN "is_active" = false THEN 'INACTIVE'::"RentalVehicleCategoryStatus" ELSE 'ACTIVE'::"RentalVehicleCategoryStatus" END,
  "status_changed_at" = COALESCE("updated_at", NOW());

CREATE INDEX "rental_vehicle_categories_org_status_idx"
  ON "rental_vehicle_categories" ("organization_id", "status");
