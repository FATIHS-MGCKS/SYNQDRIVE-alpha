-- Component-specific brake wear minimum thresholds (Prompt 11)

CREATE TYPE "BrakeWearThresholdSource" AS ENUM (
  'MANUFACTURER_MINIMUM',
  'WORKSHOP_DOCUMENTED',
  'USER_CONFIRMED',
  'PART_CATALOG',
  'AI_ESTIMATED',
  'LEGACY_DEFAULT',
  'UNKNOWN'
);

ALTER TABLE "vehicle_brake_reference_specs"
  ADD COLUMN "front_pad_minimum_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "rear_pad_minimum_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "front_disc_minimum_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "rear_disc_minimum_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "threshold_source" "BrakeWearThresholdSource",
  ADD COLUMN "threshold_confidence" DOUBLE PRECISION,
  ADD COLUMN "threshold_confirmed_at" TIMESTAMP(3);

-- Legacy pad specs may keep modeling defaults, but they are not confirmed minimums.
UPDATE "vehicle_brake_reference_specs"
SET
  "threshold_source" = 'LEGACY_DEFAULT'::"BrakeWearThresholdSource"
WHERE "threshold_source" IS NULL
  AND (
    "front_pad_nominal_thickness_mm" IS NOT NULL
    OR "rear_pad_nominal_thickness_mm" IS NOT NULL
    OR "front_pad_thickness" IS NOT NULL
    OR "rear_pad_thickness" IS NOT NULL
  );
