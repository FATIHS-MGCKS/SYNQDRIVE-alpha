-- Stations V2 Prompt 33: additive vehicle station position metadata (nullable, no backfill).

CREATE TYPE "vehicle_station_position_source" AS ENUM (
  'MANUAL',
  'PICKUP',
  'RETURN',
  'TRANSFER',
  'IMPORT',
  'GEOFENCE_SHADOW',
  'GEOFENCE_CONFIRMED',
  'UNKNOWN'
);

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "current_station_source" "vehicle_station_position_source",
  ADD COLUMN IF NOT EXISTS "current_station_confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "current_station_confirmed_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "expected_station_source" "vehicle_station_position_source",
  ADD COLUMN IF NOT EXISTS "expected_station_set_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "station_position_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_current_station_confirmed_by_user_id_fkey"
  FOREIGN KEY ("current_station_confirmed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "vehicles_org_current_station_idx"
  ON "vehicles"("organization_id", "current_station_id");

CREATE INDEX IF NOT EXISTS "vehicles_org_expected_station_idx"
  ON "vehicles"("organization_id", "expected_station_id");

CREATE INDEX IF NOT EXISTS "vehicles_current_station_source_idx"
  ON "vehicles"("current_station_source");

CREATE INDEX IF NOT EXISTS "vehicles_expected_station_source_idx"
  ON "vehicles"("expected_station_source");

CREATE INDEX IF NOT EXISTS "vehicles_current_station_confirmed_by_user_id_idx"
  ON "vehicles"("current_station_confirmed_by_user_id");
