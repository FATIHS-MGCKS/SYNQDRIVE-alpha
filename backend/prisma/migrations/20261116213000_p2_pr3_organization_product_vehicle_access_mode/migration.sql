-- CreateEnum
CREATE TYPE "OrganizationProductVehicleAccessMode" AS ENUM ('ORGANIZATION_WIDE', 'SELECTED_VEHICLES');

-- AlterTable
ALTER TABLE "organization_products" ADD COLUMN "vehicle_access_mode" "OrganizationProductVehicleAccessMode";

UPDATE "organization_products" AS op
SET "vehicle_access_mode" = CASE
  WHEN p.slug = 'VYMOD' THEN 'SELECTED_VEHICLES'::"OrganizationProductVehicleAccessMode"
  ELSE 'ORGANIZATION_WIDE'::"OrganizationProductVehicleAccessMode"
END
FROM "products" AS p
WHERE op."product_id" = p."id" AND op."vehicle_access_mode" IS NULL;

ALTER TABLE "organization_products" ALTER COLUMN "vehicle_access_mode" SET NOT NULL;