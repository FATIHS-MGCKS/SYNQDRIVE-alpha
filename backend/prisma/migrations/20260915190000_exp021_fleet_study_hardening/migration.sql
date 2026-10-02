-- EXP-021 PR-C hardening — run classification enum + scientific retention (RESTRICT on run ledger FKs)

CREATE TYPE "Exp021StudyRunClassification" AS ENUM (
  'COMPLETE_VALID',
  'PARTIAL_VALID',
  'INVALID',
  'ABORTED',
  'SKIPPED'
);

ALTER TABLE "exp021_study_runs"
  ALTER COLUMN "run_classification" TYPE "Exp021StudyRunClassification"
  USING (
    CASE
      WHEN "run_classification" IS NULL THEN NULL
      ELSE "run_classification"::"Exp021StudyRunClassification"
    END
  );

ALTER TABLE "exp021_study_runs" DROP CONSTRAINT "exp021_study_runs_study_id_fkey";
ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_study_id_fkey"
  FOREIGN KEY ("study_id") REFERENCES "exp021_studies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_study_runs" DROP CONSTRAINT "exp021_study_runs_enrollment_id_fkey";
ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "exp021_study_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_study_runs" DROP CONSTRAINT "exp021_study_runs_organization_id_fkey";
ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_study_runs" DROP CONSTRAINT "exp021_study_runs_vehicle_id_fkey";
ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
