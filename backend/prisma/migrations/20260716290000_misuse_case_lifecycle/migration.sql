-- CreateEnum
CREATE TYPE "MisuseCaseStatus" AS ENUM ('CANDIDATE', 'ACTIVE', 'REVIEW_REQUIRED', 'CONFIRMED', 'DISMISSED', 'RESOLVED', 'SUPERSEDED', 'NOT_ASSESSABLE');

-- CreateEnum
CREATE TYPE "MisuseCaseDecisionEligibility" AS ENUM ('INFORMATIONAL_ONLY', 'REVIEW_ONLY', 'MANUAL_CONFIRMATION_ONLY', 'OPERATIONAL_ELIGIBLE', 'NOT_ELIGIBLE');

-- AlterEnum
ALTER TYPE "MisuseEvidenceSourceType" ADD VALUE 'MANUAL_VERIFICATION';

-- AlterTable
ALTER TABLE "misuse_cases" ADD COLUMN     "status" "MisuseCaseStatus" NOT NULL DEFAULT 'CANDIDATE',
ADD COLUMN     "model_version" TEXT NOT NULL DEFAULT 'misuse-case-lifecycle-v1',
ADD COLUMN     "input_fingerprint" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "analysis_run_id" TEXT,
ADD COLUMN     "evidence_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "attribution_confidence" "DrivingAttributionConfidence",
ADD COLUMN     "decision_eligibility" "MisuseCaseDecisionEligibility" NOT NULL DEFAULT 'INFORMATIONAL_ONLY',
ADD COLUMN     "supersedes_case_id" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolution_reason" TEXT;

-- Backfill existing rows: telemetry cases remain informational, map to CANDIDATE + REVIEW_ONLY when severity warrants review
UPDATE "misuse_cases"
SET
  "status" = CASE
    WHEN "informational_only" = true AND "severity" IN ('SEVERE', 'CRITICAL') THEN 'REVIEW_REQUIRED'::"MisuseCaseStatus"
    ELSE 'CANDIDATE'::"MisuseCaseStatus"
  END,
  "input_fingerprint" = "fingerprint",
  "evidence_count" = GREATEST("event_count", 0),
  "decision_eligibility" = 'INFORMATIONAL_ONLY'::"MisuseCaseDecisionEligibility"
WHERE "input_fingerprint" = '';

-- CreateIndex
CREATE INDEX "misuse_cases_status_idx" ON "misuse_cases"("status");

-- CreateIndex
CREATE INDEX "misuse_cases_decision_eligibility_idx" ON "misuse_cases"("decision_eligibility");

-- CreateIndex
CREATE INDEX "misuse_cases_analysis_run_id_idx" ON "misuse_cases"("analysis_run_id");

-- CreateIndex
CREATE INDEX "misuse_cases_input_fingerprint_idx" ON "misuse_cases"("input_fingerprint");

-- CreateIndex
CREATE INDEX "misuse_cases_supersedes_case_id_idx" ON "misuse_cases"("supersedes_case_id");

-- AddForeignKey
ALTER TABLE "misuse_cases" ADD CONSTRAINT "misuse_cases_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "driving_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "misuse_cases" ADD CONSTRAINT "misuse_cases_supersedes_case_id_fkey" FOREIGN KEY ("supersedes_case_id") REFERENCES "misuse_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
