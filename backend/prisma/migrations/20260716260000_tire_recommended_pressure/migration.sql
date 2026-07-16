-- Evidence-based recommended tire pressure on vehicle tire setups.
-- Replaces unsafe derivation from aiTireSpec.maxInflationKpa for wear modelling.

CREATE TYPE "TirePressureSpecSource" AS ENUM (
  'VEHICLE_MANUFACTURER',
  'DOOR_PLACARD',
  'OWNER_MANUAL',
  'WORKSHOP',
  'USER_CONFIRMED',
  'AI_ESTIMATED',
  'UNKNOWN'
);

ALTER TABLE "vehicle_tire_setups"
  ADD COLUMN "recommended_pressure_front_bar" DOUBLE PRECISION,
  ADD COLUMN "recommended_pressure_rear_bar" DOUBLE PRECISION,
  ADD COLUMN "recommended_pressure_loaded_front_bar" DOUBLE PRECISION,
  ADD COLUMN "recommended_pressure_loaded_rear_bar" DOUBLE PRECISION,
  ADD COLUMN "pressure_spec_source" "TirePressureSpecSource" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "pressure_spec_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "pressure_spec_confidence" DOUBLE PRECISION;
