-- Data Processing Review & Four-Eyes Workflow (Prompt 14)

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "data_processing_four_eyes_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "DataProcessingReviewStepType" AS ENUM (
  'BUSINESS_OWNER',
  'PRIVACY_REVIEW',
  'SECURITY_REVIEW',
  'FINAL_APPROVAL'
);

CREATE TYPE "DataProcessingReviewDecisionOutcome" AS ENUM (
  'APPROVED',
  'REJECTED',
  'REQUESTED_CHANGES'
);

CREATE TYPE "DataProcessingReviewCycleStatus" AS ENUM (
  'OPEN',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "DataProcessingReviewEntityType" AS ENUM (
  'PROCESSING_ACTIVITY',
  'LEGAL_BASIS_ASSESSMENT',
  'ENFORCEMENT_POLICY'
);

ALTER TABLE "processing_activities"
  ADD COLUMN IF NOT EXISTS "submitted_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "risk_level" "DataAuthorizationRiskLevel",
  ADD COLUMN IF NOT EXISTS "content_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "active_review_cycle_id" TEXT;

CREATE TABLE "data_processing_review_cycles" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "entity_type" "DataProcessingReviewEntityType" NOT NULL,
  "entity_id" TEXT NOT NULL,
  "entity_version_number" INTEGER NOT NULL,
  "entity_content_fingerprint" TEXT NOT NULL,
  "risk_level" "DataAuthorizationRiskLevel" NOT NULL,
  "status" "DataProcessingReviewCycleStatus" NOT NULL DEFAULT 'OPEN',
  "required_steps" "DataProcessingReviewStepType"[] NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "superseded_at" TIMESTAMP(3),
  "superseded_by_cycle_id" TEXT,
  "processing_activity_id" TEXT,
  CONSTRAINT "data_processing_review_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_processing_review_decisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "review_cycle_id" TEXT NOT NULL,
  "step_type" "DataProcessingReviewStepType" NOT NULL,
  "decision" "DataProcessingReviewDecisionOutcome" NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "reason" TEXT,
  "entity_version_number" INTEGER NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_processing_review_decisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "data_processing_review_cycles"
  ADD CONSTRAINT "data_processing_review_cycles_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_review_cycles"
  ADD CONSTRAINT "data_processing_review_cycles_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_processing_review_cycles"
  ADD CONSTRAINT "data_processing_review_cycles_superseded_by_cycle_id_fkey"
  FOREIGN KEY ("superseded_by_cycle_id") REFERENCES "data_processing_review_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_processing_review_decisions"
  ADD CONSTRAINT "data_processing_review_decisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_review_decisions"
  ADD CONSTRAINT "data_processing_review_decisions_review_cycle_id_fkey"
  FOREIGN KEY ("review_cycle_id") REFERENCES "data_processing_review_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "data_processing_review_cycles_organization_id_entity_type_entity_id_idx"
  ON "data_processing_review_cycles"("organization_id", "entity_type", "entity_id");

CREATE INDEX "data_processing_review_cycles_organization_id_status_idx"
  ON "data_processing_review_cycles"("organization_id", "status");

CREATE INDEX "data_processing_review_cycles_processing_activity_id_idx"
  ON "data_processing_review_cycles"("processing_activity_id");

CREATE INDEX "data_processing_review_decisions_review_cycle_id_step_type_idx"
  ON "data_processing_review_decisions"("review_cycle_id", "step_type");

CREATE INDEX "data_processing_review_decisions_organization_id_decided_at_idx"
  ON "data_processing_review_decisions"("organization_id", "decided_at");
