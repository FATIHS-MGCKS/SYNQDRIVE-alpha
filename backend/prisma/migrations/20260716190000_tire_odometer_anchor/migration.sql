-- Tire setup odometer anchor provenance + revision-safe mount periods (Prompt 6)

CREATE TYPE "TireOdometerAnchorSource" AS ENUM (
  'MANUAL_CONFIRMED',
  'PROVIDER_DIMO',
  'PROVIDER_HIGH_MOBILITY',
  'VEHICLE_LATEST_STATE',
  'DOCUMENTED',
  'HISTORICAL_INFERRED',
  'UNKNOWN'
);

CREATE TYPE "TireOdometerAnchorStatus" AS ENUM (
  'ANCHORED',
  'ANCHOR_REQUIRED',
  'MEASUREMENT_REQUIRED'
);

ALTER TABLE "vehicle_tire_setups"
  ADD COLUMN "installed_odometer_source" "TireOdometerAnchorSource",
  ADD COLUMN "installed_odometer_captured_at" TIMESTAMP(3),
  ADD COLUMN "installed_odometer_evidence_id" TEXT,
  ADD COLUMN "odometer_anchor_status" "TireOdometerAnchorStatus",
  ADD COLUMN "odometer_anchor_confidence" DOUBLE PRECISION;

CREATE INDEX "vehicle_tire_setups_odometer_anchor_status_idx"
  ON "vehicle_tire_setups" ("odometer_anchor_status");

CREATE TABLE "vehicle_tire_setup_mount_periods" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "tire_setup_id" TEXT NOT NULL,
  "installed_at" TIMESTAMP(3) NOT NULL,
  "removed_at" TIMESTAMP(3),
  "installed_odometer_km" DOUBLE PRECISION,
  "installed_odometer_source" "TireOdometerAnchorSource",
  "installed_odometer_captured_at" TIMESTAMP(3),
  "installed_odometer_evidence_id" TEXT,
  "removed_odometer_km" DOUBLE PRECISION,
  "odometer_anchor_status" "TireOdometerAnchorStatus",
  "odometer_anchor_confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vehicle_tire_setup_mount_periods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_tire_setup_mount_periods_tire_setup_id_idx"
  ON "vehicle_tire_setup_mount_periods" ("tire_setup_id");

CREATE INDEX "vehicle_tire_setup_mount_periods_org_setup_idx"
  ON "vehicle_tire_setup_mount_periods" ("organization_id", "tire_setup_id");

CREATE INDEX "vehicle_tire_setup_mount_periods_installed_at_idx"
  ON "vehicle_tire_setup_mount_periods" ("installed_at");

ALTER TABLE "vehicle_tire_setup_mount_periods"
  ADD CONSTRAINT "vehicle_tire_setup_mount_periods_tire_setup_id_fkey"
  FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
