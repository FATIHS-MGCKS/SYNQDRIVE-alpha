-- Prompt 30: DPIA workflow and privacy risk assessment

CREATE TYPE "PrivacyRiskDataVolume" AS ENUM ('LIMITED', 'MODERATE', 'LARGE', 'VERY_LARGE');
CREATE TYPE "PrivacyRiskFrequency" AS ENUM ('ONE_OFF', 'OCCASIONAL', 'REGULAR', 'CONTINUOUS');
CREATE TYPE "PrivacyRiskDuration" AS ENUM ('SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'INDEFINITE');
CREATE TYPE "PrivacyRiskSubjectScale" AS ENUM ('FEW', 'MODERATE', 'MANY', 'LARGE_SCALE');
CREATE TYPE "PrivacyRiskLikelihood" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "PrivacyResidualRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');
CREATE TYPE "ProcessingActivityDpiaDecisionType" AS ENUM (
  'RISK_ASSESSED',
  'DPIA_CREATED',
  'SUBMITTED_FOR_REVIEW',
  'PRIVACY_REVIEWED',
  'SECURITY_REVIEWED',
  'RESIDUAL_RISK_ACCEPTED',
  'APPROVED',
  'REJECTED',
  'REVIEW_DUE',
  'MATERIAL_CHANGE_DETECTED'
);

-- Migrate dpia_status enum values on processing_activities
ALTER TABLE "processing_activities" ALTER COLUMN "dpia_status" DROP DEFAULT;

CREATE TYPE "ProcessingActivityDpiaStatus_new" AS ENUM (
  'DPIA_NOT_REQUIRED',
  'DPIA_REQUIRED',
  'DPIA_IN_PROGRESS',
  'DPIA_APPROVED',
  'DPIA_REJECTED',
  'DPIA_REVIEW_DUE'
);

ALTER TABLE "processing_activities"
  ALTER COLUMN "dpia_status" TYPE "ProcessingActivityDpiaStatus_new"
  USING (
    CASE "dpia_status"::text
      WHEN 'NOT_ASSESSED' THEN 'DPIA_NOT_REQUIRED'
      WHEN 'NOT_REQUIRED' THEN 'DPIA_NOT_REQUIRED'
      WHEN 'REQUIRED_PENDING' THEN 'DPIA_REQUIRED'
      WHEN 'IN_PROGRESS' THEN 'DPIA_IN_PROGRESS'
      WHEN 'COMPLETED' THEN 'DPIA_APPROVED'
      ELSE 'DPIA_NOT_REQUIRED'
    END
  )::"ProcessingActivityDpiaStatus_new";

DROP TYPE "ProcessingActivityDpiaStatus";
ALTER TYPE "ProcessingActivityDpiaStatus_new" RENAME TO "ProcessingActivityDpiaStatus";

ALTER TABLE "processing_activities"
  ALTER COLUMN "dpia_status" SET DEFAULT 'DPIA_NOT_REQUIRED';

CREATE TABLE "processing_activity_risk_assessments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "content_fingerprint" TEXT,
  "assessment_owner_user_id" TEXT,
  "data_volume_scope" "PrivacyRiskDataVolume",
  "processing_frequency" "PrivacyRiskFrequency",
  "processing_duration" "PrivacyRiskDuration",
  "data_subject_scale" "PrivacyRiskSubjectScale",
  "systematic_monitoring" BOOLEAN NOT NULL DEFAULT false,
  "location_data" BOOLEAN NOT NULL DEFAULT false,
  "profiling" BOOLEAN NOT NULL DEFAULT false,
  "automated_decision_making" BOOLEAN NOT NULL DEFAULT false,
  "vulnerable_subjects" BOOLEAN NOT NULL DEFAULT false,
  "data_combination" BOOLEAN NOT NULL DEFAULT false,
  "third_country_transfer" BOOLEAN NOT NULL DEFAULT false,
  "external_recipients" BOOLEAN NOT NULL DEFAULT false,
  "security_measures" TEXT,
  "potential_harm" TEXT,
  "likelihood" "PrivacyRiskLikelihood",
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "dpia_required" BOOLEAN NOT NULL DEFAULT false,
  "residual_risk_level" "PrivacyResidualRiskLevel",
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "processing_activity_risk_assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processing_activity_risk_assessments_org_activity_current_idx"
  ON "processing_activity_risk_assessments"("organization_id", "processing_activity_id", "is_current");

ALTER TABLE "processing_activity_risk_assessments"
  ADD CONSTRAINT "processing_activity_risk_assessments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_risk_assessments"
  ADD CONSTRAINT "processing_activity_risk_assessments_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "processing_activity_dpias" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "risk_assessment_id" TEXT,
  "assessment_owner_user_id" TEXT,
  "privacy_reviewer_user_id" TEXT,
  "security_reviewer_user_id" TEXT,
  "identified_risks" JSONB,
  "proposed_measures" JSONB,
  "approved_measures" JSONB,
  "residual_risk" "PrivacyResidualRiskLevel",
  "residual_risk_accepted" BOOLEAN NOT NULL DEFAULT false,
  "residual_risk_accepted_by_user_id" TEXT,
  "residual_risk_accepted_at" TIMESTAMP(3),
  "approval_status" "ProcessingActivityDpiaStatus" NOT NULL DEFAULT 'DPIA_REQUIRED',
  "review_date" TIMESTAMP(3),
  "evidence_reference" TEXT,
  "content_fingerprint" TEXT,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "processing_activity_dpias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processing_activity_dpias_org_activity_current_idx"
  ON "processing_activity_dpias"("organization_id", "processing_activity_id", "is_current");
CREATE INDEX "processing_activity_dpias_org_status_idx"
  ON "processing_activity_dpias"("organization_id", "approval_status");
CREATE INDEX "processing_activity_dpias_org_review_date_idx"
  ON "processing_activity_dpias"("organization_id", "review_date");

ALTER TABLE "processing_activity_dpias"
  ADD CONSTRAINT "processing_activity_dpias_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_dpias"
  ADD CONSTRAINT "processing_activity_dpias_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_dpias"
  ADD CONSTRAINT "processing_activity_dpias_risk_assessment_id_fkey"
  FOREIGN KEY ("risk_assessment_id") REFERENCES "processing_activity_risk_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "processing_activity_dpia_decisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "dpia_id" TEXT NOT NULL,
  "decision_type" "ProcessingActivityDpiaDecisionType" NOT NULL,
  "actor_user_id" TEXT,
  "outcome" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_dpia_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processing_activity_dpia_decisions_org_dpia_created_idx"
  ON "processing_activity_dpia_decisions"("organization_id", "dpia_id", "created_at");

ALTER TABLE "processing_activity_dpia_decisions"
  ADD CONSTRAINT "processing_activity_dpia_decisions_dpia_id_fkey"
  FOREIGN KEY ("dpia_id") REFERENCES "processing_activity_dpias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
