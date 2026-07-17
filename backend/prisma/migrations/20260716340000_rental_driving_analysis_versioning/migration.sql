-- P59: Rental Driving Analysis versioning, fingerprint idempotency, supersede chain.

CREATE TYPE "RentalDrivingAnalysisCompleteness" AS ENUM ('FULL', 'PARTIAL', 'INSUFFICIENT');

ALTER TABLE "rental_driving_analyses" DROP CONSTRAINT IF EXISTS "rental_driving_analyses_booking_id_key";

ALTER TABLE "rental_driving_analyses"
  ADD COLUMN "calculation_version" TEXT NOT NULL DEFAULT 'rental-driving-analysis-v1',
  ADD COLUMN "input_fingerprint" TEXT,
  ADD COLUMN "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "source_trips_finalized_at" TIMESTAMP(3),
  ADD COLUMN "analysis_completeness" "RentalDrivingAnalysisCompleteness" NOT NULL DEFAULT 'PARTIAL',
  ADD COLUMN "maturity" "DrivingAnalysisMaturity" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "superseded_at" TIMESTAMP(3),
  ADD COLUMN "supersedes_analysis_id" TEXT,
  ADD COLUMN "recompute_reason" TEXT,
  ADD COLUMN "attribution_summary" JSONB NOT NULL DEFAULT '{}';

UPDATE "rental_driving_analyses"
SET
  "calculation_version" = 'rental-driving-analysis-v0-legacy',
  "input_fingerprint" = 'legacy:' || "id",
  "generated_at" = "created_at",
  "source_trips_finalized_at" = "period_end",
  "analysis_completeness" = 'PARTIAL',
  "maturity" = 'PUBLISHED',
  "attribution_summary" = '{}'::jsonb
WHERE "input_fingerprint" IS NULL;

ALTER TABLE "rental_driving_analyses"
  ALTER COLUMN "input_fingerprint" SET NOT NULL;

ALTER TABLE "rental_driving_analyses"
  ADD CONSTRAINT "rental_driving_analyses_supersedes_analysis_id_fkey"
  FOREIGN KEY ("supersedes_analysis_id") REFERENCES "rental_driving_analyses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "rental_driving_analyses_booking_id_calculation_version_input_fingerprint_key"
  ON "rental_driving_analyses"("booking_id", "calculation_version", "input_fingerprint");

CREATE INDEX "rental_driving_analyses_booking_id_superseded_at_idx"
  ON "rental_driving_analyses"("booking_id", "superseded_at");

CREATE INDEX "rental_driving_analyses_input_fingerprint_idx"
  ON "rental_driving_analyses"("input_fingerprint");

CREATE INDEX "rental_driving_analyses_supersedes_analysis_id_idx"
  ON "rental_driving_analyses"("supersedes_analysis_id");
