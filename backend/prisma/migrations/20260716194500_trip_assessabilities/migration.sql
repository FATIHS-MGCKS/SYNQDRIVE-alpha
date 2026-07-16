-- Driving Intelligence V2 P14 — TripAssessability per-dimension model (additive)

CREATE TYPE "TripAssessabilityDimension" AS ENUM (
  'TRIP_BOUNDARY',
  'ROUTE',
  'VEHICLE_LOAD',
  'NATIVE_BEHAVIOR',
  'RECONSTRUCTED_BEHAVIOR',
  'ENGINE_MISUSE',
  'BRAKING_INTENSITY',
  'CORNERING',
  'DAMAGE_RISK',
  'DRIVER_CONDUCT',
  'ATTRIBUTION'
);

CREATE TYPE "TripAssessabilityDimensionStatus" AS ENUM (
  'ASSESSABLE',
  'LIMITED',
  'INSUFFICIENT_DATA',
  'UNSUPPORTED',
  'PROVIDER_ERROR',
  'NOT_APPLICABLE'
);

CREATE TABLE "trip_assessabilities" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "dimension" "TripAssessabilityDimension" NOT NULL,
  "status" "TripAssessabilityDimensionStatus" NOT NULL,
  "reasons_json" JSONB NOT NULL DEFAULT '[]',
  "coverage" DOUBLE PRECISION,
  "effective_cadence_ms" INTEGER,
  "p95_cadence_ms" INTEGER,
  "capability_version" TEXT NOT NULL,
  "input_window_start" TIMESTAMP(3) NOT NULL,
  "input_window_end" TIMESTAMP(3),
  "calculated_at" TIMESTAMP(3) NOT NULL,
  "policy_version" TEXT NOT NULL,
  "analysis_run_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "trip_assessabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_assessabilities_organization_id_trip_id_dimension_key"
  ON "trip_assessabilities"("organization_id", "trip_id", "dimension");

CREATE INDEX "trip_assessabilities_organization_id_idx"
  ON "trip_assessabilities"("organization_id");

CREATE INDEX "trip_assessabilities_vehicle_id_calculated_at_idx"
  ON "trip_assessabilities"("vehicle_id", "calculated_at");

CREATE INDEX "trip_assessabilities_trip_id_dimension_idx"
  ON "trip_assessabilities"("trip_id", "dimension");

CREATE INDEX "trip_assessabilities_trip_id_status_idx"
  ON "trip_assessabilities"("trip_id", "status");

ALTER TABLE "trip_assessabilities"
  ADD CONSTRAINT "trip_assessabilities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trip_assessabilities"
  ADD CONSTRAINT "trip_assessabilities_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trip_assessabilities"
  ADD CONSTRAINT "trip_assessabilities_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
