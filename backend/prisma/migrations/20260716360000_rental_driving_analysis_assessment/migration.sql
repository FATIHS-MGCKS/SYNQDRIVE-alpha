-- P61: Rental driving analysis assessment completeness (COMPLETE/PARTIAL/PROVISIONAL/NOT_ASSESSABLE/FAILED).

CREATE TYPE "RentalDrivingAnalysisAssessmentStatus" AS ENUM (
  'COMPLETE',
  'PARTIAL',
  'PROVISIONAL',
  'NOT_ASSESSABLE',
  'FAILED'
);

ALTER TABLE "rental_driving_analyses"
  ADD COLUMN "assessment_status" "RentalDrivingAnalysisAssessmentStatus" NOT NULL DEFAULT 'PROVISIONAL',
  ADD COLUMN "assessment_summary" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "rental_driving_analyses_booking_id_assessment_status_idx"
  ON "rental_driving_analyses" ("booking_id", "assessment_status");
