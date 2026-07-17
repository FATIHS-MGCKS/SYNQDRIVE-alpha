-- P54: materialized DriverAttribution records (additive snapshot — does not alter trip detection)

CREATE TYPE "DriverAttributionType" AS ENUM (
  'CONFIRMED_DRIVER',
  'ASSIGNED_DRIVER',
  'BOOKING_CUSTOMER_ONLY',
  'VEHICLE_ONLY',
  'TIME_WINDOW_MATCH',
  'STAFF_MOVEMENT',
  'PRIVATE',
  'UNKNOWN'
);

CREATE TYPE "DriverAttributionSource" AS ENUM (
  'PIPELINE_SNAPSHOT',
  'TRIP_ASSIGNMENT',
  'EXPLICIT_BOOKING_LINK',
  'TIME_WINDOW_OVERLAP',
  'MANUAL_RESOLUTION'
);

CREATE TABLE "driver_attributions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "analysis_run_id" TEXT,
  "booking_id" TEXT,
  "customer_id" TEXT,
  "driver_id" TEXT,
  "attribution_type" "DriverAttributionType" NOT NULL,
  "confidence" "DrivingAttributionConfidence" NOT NULL,
  "source" "DriverAttributionSource" NOT NULL,
  "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_until" TIMESTAMP(3),
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "resolved_by_user_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "model_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driver_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_attributions_org_trip_run_model_source_key"
  ON "driver_attributions"("organization_id", "trip_id", "analysis_run_id", "model_version", "source");

CREATE INDEX "driver_attributions_organization_id_idx" ON "driver_attributions"("organization_id");
CREATE INDEX "driver_attributions_trip_id_idx" ON "driver_attributions"("trip_id");
CREATE INDEX "driver_attributions_vehicle_id_idx" ON "driver_attributions"("vehicle_id");
CREATE INDEX "driver_attributions_booking_id_idx" ON "driver_attributions"("booking_id");
CREATE INDEX "driver_attributions_customer_id_idx" ON "driver_attributions"("customer_id");
CREATE INDEX "driver_attributions_driver_id_idx" ON "driver_attributions"("driver_id");
CREATE INDEX "driver_attributions_org_trip_type_idx"
  ON "driver_attributions"("organization_id", "trip_id", "attribution_type");

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_analysis_run_id_fkey"
  FOREIGN KEY ("analysis_run_id") REFERENCES "driving_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_attributions"
  ADD CONSTRAINT "driver_attributions_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
