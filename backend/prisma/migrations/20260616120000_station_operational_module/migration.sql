-- Station operational module: extend stations, vehicle station semantics, booking station links

-- Enums
CREATE TYPE "StationType" AS ENUM ('MAIN', 'BRANCH', 'PARKING', 'PARTNER', 'TEMPORARY');
ALTER TYPE "StationStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- Station columns
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "type" "StationType" NOT NULL DEFAULT 'BRANCH';
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "address_line2" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'Europe/Berlin';
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "pickup_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "return_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "after_hours_return_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "key_box_available" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "holiday_rules" JSONB;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "handover_instructions" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "return_instructions" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "internal_notes" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- Migrate opening_hours text → jsonb when still text type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stations' AND column_name = 'opening_hours' AND data_type = 'text'
  ) THEN
    ALTER TABLE "stations" ALTER COLUMN "opening_hours" DROP DEFAULT;
    ALTER TABLE "stations"
      ALTER COLUMN "opening_hours" TYPE JSONB
      USING (
        CASE
          WHEN "opening_hours" IS NULL OR trim("opening_hours") = '' THEN NULL
          WHEN trim("opening_hours") ~ '^\s*\{' THEN "opening_hours"::jsonb
          ELSE jsonb_build_object('legacyText', "opening_hours")
        END
      );
  END IF;
END $$;

-- Default geofence radius for new rows (existing values preserved)
ALTER TABLE "stations" ALTER COLUMN "radius_meters" SET DEFAULT 100;

CREATE UNIQUE INDEX IF NOT EXISTS "stations_organization_id_code_key"
  ON "stations"("organization_id", "code")
  WHERE "code" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "stations_organization_id_status_idx"
  ON "stations"("organization_id", "status");

-- Vehicle station semantics
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "current_station_id" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "expected_station_id" TEXT;

UPDATE "vehicles"
SET "current_station_id" = "station_id"
WHERE "current_station_id" IS NULL AND "station_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "vehicles_current_station_id_idx" ON "vehicles"("current_station_id");
CREATE INDEX IF NOT EXISTS "vehicles_expected_station_id_idx" ON "vehicles"("expected_station_id");

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_current_station_id_fkey"
  FOREIGN KEY ("current_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_expected_station_id_fkey"
  FOREIGN KEY ("expected_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Booking station fields
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "actual_pickup_station_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "actual_return_station_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pickup_address_override" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "return_address_override" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "is_one_way_rental" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "station_transfer_fee_cents" INTEGER;

UPDATE "bookings"
SET "is_one_way_rental" = true
WHERE "pickup_station_id" IS NOT NULL
  AND "return_station_id" IS NOT NULL
  AND "pickup_station_id" <> "return_station_id";

CREATE INDEX IF NOT EXISTS "bookings_pickup_station_id_idx" ON "bookings"("pickup_station_id");
CREATE INDEX IF NOT EXISTS "bookings_return_station_id_idx" ON "bookings"("return_station_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_pickup_station_id_fkey"
  FOREIGN KEY ("pickup_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_return_station_id_fkey"
  FOREIGN KEY ("return_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_actual_pickup_station_id_fkey"
  FOREIGN KEY ("actual_pickup_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_actual_return_station_id_fkey"
  FOREIGN KEY ("actual_return_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed a primary MAIN station for orgs that have none (from company profile)
INSERT INTO "stations" (
  "id", "organization_id", "name", "type", "is_primary", "status",
  "address", "city", "postal_code", "country", "phone", "email",
  "timezone", "pickup_enabled", "return_enabled", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  o."id",
  COALESCE(NULLIF(trim(o."company_name"), ''), 'Hauptstandort'),
  'MAIN'::"StationType",
  true,
  'ACTIVE'::"StationStatus",
  o."address",
  o."city",
  o."zip",
  o."country",
  o."phone",
  o."email",
  COALESCE(o."timezone", 'Europe/Berlin'),
  true,
  true,
  NOW(),
  NOW()
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "stations" s WHERE s."organization_id" = o."id"
);

-- Mark first existing station as primary when none flagged
UPDATE "stations" s
SET "is_primary" = true
WHERE s."is_primary" = false
  AND NOT EXISTS (
    SELECT 1 FROM "stations" s2
    WHERE s2."organization_id" = s."organization_id" AND s2."is_primary" = true
  )
  AND s."id" = (
    SELECT s3."id" FROM "stations" s3
    WHERE s3."organization_id" = s."organization_id"
    ORDER BY s3."created_at" ASC
    LIMIT 1
  );
