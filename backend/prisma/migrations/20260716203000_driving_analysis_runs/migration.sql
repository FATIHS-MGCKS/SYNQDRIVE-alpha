-- Driving Intelligence V2 P16 — deterministic DrivingAnalysisRun

CREATE TYPE "DrivingAnalysisType" AS ENUM (
  'TRIP_ENRICHMENT',
  'TRIP_ASSESSABILITY',
  'TRIP_DECISION_SUMMARY',
  'DRIVING_IMPACT',
  'MISUSE_DETECTION'
);

CREATE TYPE "DrivingAnalysisRunStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'SUPERSEDED'
);

CREATE TABLE "driving_analysis_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "analysis_type" "DrivingAnalysisType" NOT NULL,
  "model_version" TEXT NOT NULL,
  "input_fingerprint" TEXT NOT NULL,
  "capability_version" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "maturity" "DrivingAnalysisMaturity" NOT NULL DEFAULT 'SHADOW',
  "status" "DrivingAnalysisRunStatus" NOT NULL DEFAULT 'PENDING',
  "stage_summary_json" JSONB,
  "recompute_reason" TEXT,
  "supersedes_run_id" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driving_analysis_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driving_analysis_runs_completed_dedup_key"
  ON "driving_analysis_runs"("organization_id", "trip_id", "analysis_type", "model_version", "input_fingerprint")
  WHERE "status" = 'COMPLETED';

CREATE INDEX "driving_analysis_runs_organization_id_started_at_idx"
  ON "driving_analysis_runs"("organization_id", "started_at");

CREATE INDEX "driving_analysis_runs_trip_id_analysis_type_status_idx"
  ON "driving_analysis_runs"("trip_id", "analysis_type", "status");

CREATE INDEX "driving_analysis_runs_vehicle_id_started_at_idx"
  ON "driving_analysis_runs"("vehicle_id", "started_at");

CREATE INDEX "driving_analysis_runs_input_fingerprint_idx"
  ON "driving_analysis_runs"("input_fingerprint");

CREATE INDEX "driving_analysis_runs_supersedes_run_id_idx"
  ON "driving_analysis_runs"("supersedes_run_id");

ALTER TABLE "driving_analysis_runs"
  ADD CONSTRAINT "driving_analysis_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_analysis_runs"
  ADD CONSTRAINT "driving_analysis_runs_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_analysis_runs"
  ADD CONSTRAINT "driving_analysis_runs_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_analysis_runs"
  ADD CONSTRAINT "driving_analysis_runs_supersedes_run_id_fkey"
  FOREIGN KEY ("supersedes_run_id") REFERENCES "driving_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trip_assessabilities"
  ADD CONSTRAINT "trip_assessabilities_analysis_run_id_fkey"
  FOREIGN KEY ("analysis_run_id") REFERENCES "driving_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driving_evidence"
  ADD CONSTRAINT "driving_evidence_analysis_run_id_fkey"
  FOREIGN KEY ("analysis_run_id") REFERENCES "driving_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
