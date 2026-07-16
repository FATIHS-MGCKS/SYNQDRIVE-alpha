-- CreateEnum
CREATE TYPE "DrivingAnalysisStageKey" AS ENUM (
  'SEGMENT_VALIDATE',
  'NATIVE_EVENTS',
  'ROUTE',
  'EVENT_CONTEXT',
  'DRIVING_IMPACT',
  'MISUSE_RECONCILE',
  'ASSESSABILITY',
  'ATTRIBUTION',
  'DECISION_SUMMARY',
  'HEALTH_IMPACT_PUBLISH'
);

-- CreateEnum
CREATE TYPE "DrivingAnalysisStageStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'SKIPPED'
);

-- CreateTable
CREATE TABLE "driving_analysis_stages" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "analysis_run_id" TEXT NOT NULL,
  "stage_key" "DrivingAnalysisStageKey" NOT NULL,
  "model_version" TEXT NOT NULL,
  "input_fingerprint" TEXT NOT NULL,
  "status" "DrivingAnalysisStageStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_code" TEXT,
  "error_message" TEXT,
  "preserved_from_stage_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driving_analysis_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driving_analysis_stages_analysis_run_id_stage_key_key"
  ON "driving_analysis_stages"("analysis_run_id", "stage_key");

-- CreateIndex
CREATE INDEX "driving_analysis_stages_organization_id_stage_key_status_idx"
  ON "driving_analysis_stages"("organization_id", "stage_key", "status");

-- CreateIndex
CREATE INDEX "driving_analysis_stages_analysis_run_id_status_idx"
  ON "driving_analysis_stages"("analysis_run_id", "status");

-- CreateIndex
CREATE INDEX "driving_analysis_stages_stage_key_model_version_input_finger_idx"
  ON "driving_analysis_stages"("stage_key", "model_version", "input_fingerprint", "status");

-- AddForeignKey
ALTER TABLE "driving_analysis_stages"
  ADD CONSTRAINT "driving_analysis_stages_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_analysis_stages"
  ADD CONSTRAINT "driving_analysis_stages_analysis_run_id_fkey"
  FOREIGN KEY ("analysis_run_id") REFERENCES "driving_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_analysis_stages"
  ADD CONSTRAINT "driving_analysis_stages_preserved_from_stage_id_fkey"
  FOREIGN KEY ("preserved_from_stage_id") REFERENCES "driving_analysis_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
