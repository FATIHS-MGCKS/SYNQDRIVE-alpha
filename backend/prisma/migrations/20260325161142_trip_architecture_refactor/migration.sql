-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ONGOING', 'COMPLETED');

-- AlterTable: Add new columns to vehicle_trips
ALTER TABLE "vehicle_trips"
  ADD COLUMN "trip_status" "TripStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "avg_consumption_l_per_100km" DOUBLE PRECISION,
  ADD COLUMN "fuel_confidence" TEXT,
  ADD COLUMN "energy_used_kwh" DOUBLE PRECISION,
  ADD COLUMN "avg_consumption_kwh_per_100km" DOUBLE PRECISION,
  ADD COLUMN "energy_confidence" TEXT,
  ADD COLUMN "outside_temperature_start_c" DOUBLE PRECISION,
  ADD COLUMN "engine_temp_start_c" DOUBLE PRECISION,
  ADD COLUMN "engine_temp_end_c" DOUBLE PRECISION,
  ADD COLUMN "avg_rpm" DOUBLE PRECISION,
  ADD COLUMN "avg_throttle_position" DOUBLE PRECISION,
  ADD COLUMN "avg_engine_load" DOUBLE PRECISION,
  ADD COLUMN "gap_ended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "enriched_at" TIMESTAMP(3);

-- Make speeding columns nullable (they may already exist as non-nullable)
-- Use DO blocks for safe ALTER in case columns don't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'speeding_percent'
  ) THEN
    ALTER TABLE "vehicle_trips" ADD COLUMN "speeding_percent" DOUBLE PRECISION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'max_over_speed_kmh'
  ) THEN
    ALTER TABLE "vehicle_trips" ADD COLUMN "max_over_speed_kmh" DOUBLE PRECISION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'speeding_segments'
  ) THEN
    ALTER TABLE "vehicle_trips" ADD COLUMN "speeding_segments" INTEGER;
  END IF;
END $$;

-- Drop removed columns (safe: only if they exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'dimo_mechanism'
  ) THEN
    ALTER TABLE "vehicle_trips" DROP COLUMN "dimo_mechanism";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'road_surface_type'
  ) THEN
    ALTER TABLE "vehicle_trips" DROP COLUMN "road_surface_type";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'road_surface_score'
  ) THEN
    ALTER TABLE "vehicle_trips" DROP COLUMN "road_surface_score";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'climate_factor'
  ) THEN
    ALTER TABLE "vehicle_trips" DROP COLUMN "climate_factor";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'tire_wear_contrib_km'
  ) THEN
    ALTER TABLE "vehicle_trips" DROP COLUMN "tire_wear_contrib_km";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'dtc_codes_found'
  ) THEN
    ALTER TABLE "vehicle_trips" DROP COLUMN "dtc_codes_found";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_trips' AND column_name = 'avg_temperature_c'
  ) THEN
    ALTER TABLE "vehicle_trips" DROP COLUMN "avg_temperature_c";
  END IF;
END $$;

-- Add index on trip_status
CREATE INDEX "vehicle_trips_trip_status_idx" ON "vehicle_trips"("trip_status");

-- AlterTable: Add isIgnitionOn to vehicle_latest_states
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_latest_states' AND column_name = 'is_ignition_on'
  ) THEN
    ALTER TABLE "vehicle_latest_states" ADD COLUMN "is_ignition_on" BOOLEAN;
  END IF;
END $$;
