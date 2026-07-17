-- P60: Rental driving analysis stability (PROVISIONAL/STABLE) + one current row per booking.

CREATE TYPE "RentalDrivingAnalysisStability" AS ENUM ('PROVISIONAL', 'STABLE');

ALTER TABLE "rental_driving_analyses"
  ADD COLUMN "stability_status" "RentalDrivingAnalysisStability" NOT NULL DEFAULT 'PROVISIONAL';

UPDATE "rental_driving_analyses"
SET "stability_status" = 'STABLE'
WHERE "superseded_at" IS NULL
  AND "analysis_completeness" = 'FULL';

CREATE UNIQUE INDEX "rental_driving_analyses_booking_id_current_key"
  ON "rental_driving_analyses" ("booking_id")
  WHERE "superseded_at" IS NULL;

CREATE INDEX "rental_driving_analyses_booking_id_stability_status_idx"
  ON "rental_driving_analyses" ("booking_id", "stability_status");
