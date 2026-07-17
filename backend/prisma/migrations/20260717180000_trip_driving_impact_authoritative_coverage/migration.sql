-- Prompt 13: authoritative TripDrivingImpact coverage for brake health

CREATE TYPE "TripDrivingImpactAnalysisStatus" AS ENUM (
  'PENDING',
  'COMPLETE',
  'PARTIAL',
  'UNSUPPORTED',
  'FAILED',
  'STALE'
);

ALTER TABLE "trip_driving_impact"
  ADD COLUMN "authoritative_distance_km" DOUBLE PRECISION,
  ADD COLUMN "source_version" TEXT,
  ADD COLUMN "source_fingerprint" TEXT,
  ADD COLUMN "analysis_status" "TripDrivingImpactAnalysisStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "calculated_at" TIMESTAMPTZ,
  ADD COLUMN "source_completeness" DOUBLE PRECISION,
  ADD COLUMN "trip_distance_km_at_source" DOUBLE PRECISION,
  ADD COLUMN "distance_discrepancy_km" DOUBLE PRECISION;

UPDATE "trip_driving_impact"
SET
  "authoritative_distance_km" = "distance_km",
  "source_version" = "model_version",
  "trip_distance_km_at_source" = "distance_km",
  "calculated_at" = COALESCE("updated_at", "created_at"),
  "source_completeness" = 1.0,
  "analysis_status" = 'COMPLETE'
WHERE "authoritative_distance_km" IS NULL;

CREATE INDEX "trip_driving_impact_analysis_status_idx"
  ON "trip_driving_impact" ("analysis_status");

CREATE INDEX "trip_driving_impact_source_fingerprint_idx"
  ON "trip_driving_impact" ("source_fingerprint");
