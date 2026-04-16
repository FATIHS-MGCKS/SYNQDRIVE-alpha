-- CreateEnum
CREATE TYPE "BrakeServiceKind" AS ENUM (
  'INSPECTION_ONLY',
  'PADS_SERVICE',
  'DISCS_SERVICE',
  'BRAKE_FLUID_SERVICE',
  'FULL_BRAKE_SERVICE'
);

-- CreateEnum
CREATE TYPE "BrakeServiceSource" AS ENUM (
  'MANUAL',
  'AI_DOCUMENT',
  'API'
);

-- AlterTable
ALTER TABLE "vehicle_service_events"
  ADD COLUMN "brake_service_kind" "BrakeServiceKind",
  ADD COLUMN "brake_service_source" "BrakeServiceSource",
  ADD COLUMN "brake_service_scope" JSONB,
  ADD COLUMN "brake_measured_snapshot" JSONB,
  ADD COLUMN "brake_lifecycle_applied" BOOLEAN,
  ADD COLUMN "brake_lifecycle_note" TEXT;

-- AlterTable
ALTER TABLE "brake_health_current"
  ADD COLUMN "state_class" TEXT,
  ADD COLUMN "anchor_validation_status" TEXT,
  ADD COLUMN "model_coverage_ratio" DOUBLE PRECISION,
  ADD COLUMN "modeled_distance_km" DOUBLE PRECISION,
  ADD COLUMN "modeled_trip_count" INTEGER,
  ADD COLUMN "modeling_source" TEXT,
  ADD COLUMN "baseline_warnings" JSONB;
