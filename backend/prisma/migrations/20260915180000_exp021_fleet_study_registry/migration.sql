-- EXP-021 PR-C — durable fleet study registry, enrollment allowlist, run ledger foundation

CREATE TYPE "Exp021StudyStatus" AS ENUM (
  'COLLECTING',
  'PAUSED',
  'MINIMUM_MATRIX_MET',
  'PROVISIONAL_DECISION_READY',
  'HIGH_CONFIDENCE_READY',
  'CLOSED'
);

CREATE TYPE "Exp021StudyRunState" AS ENUM (
  'PLANNED',
  'ARMING',
  'WAIT_TELEMETRY',
  'WAIT_MOVEMENT',
  'RUNNING',
  'FINALIZING',
  'COMPLETED',
  'PARTIAL',
  'INVALID',
  'ABORTED',
  'SKIPPED'
);

CREATE TABLE "exp021_studies" (
  "id" TEXT NOT NULL,
  "study_key" TEXT NOT NULL,
  "status" "Exp021StudyStatus" NOT NULL DEFAULT 'COLLECTING',
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "config_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exp021_studies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_studies_study_key_key" ON "exp021_studies"("study_key");

CREATE TABLE "exp021_study_enrollments" (
  "id" TEXT NOT NULL,
  "study_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "enrolled_token_id" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "allowed_plans" TEXT[] NOT NULL,
  "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enrolled_by" TEXT,
  "last_run_at" TIMESTAMP(3),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exp021_study_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_study_enrollments_study_id_organization_id_vehicle_id_key"
  ON "exp021_study_enrollments"("study_id", "organization_id", "vehicle_id");
CREATE INDEX "exp021_study_enrollments_study_id_enabled_idx"
  ON "exp021_study_enrollments"("study_id", "enabled");
CREATE INDEX "exp021_study_enrollments_organization_id_vehicle_id_idx"
  ON "exp021_study_enrollments"("organization_id", "vehicle_id");

CREATE TABLE "exp021_study_runs" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "study_id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "token_id" INTEGER NOT NULL,
  "session_id" TEXT,
  "production_sha" TEXT,
  "assigned_phase_order_ms" JSONB NOT NULL,
  "plan_id" TEXT NOT NULL,
  "plan_version" TEXT NOT NULL,
  "state" "Exp021StudyRunState" NOT NULL DEFAULT 'PLANNED',
  "run_classification" TEXT,
  "canonical_t0_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "terminal_reason" TEXT,
  "raw_evidence_hash" TEXT,
  "evidence_location" TEXT,
  "scientific_eligibility" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exp021_study_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_study_runs_run_id_key" ON "exp021_study_runs"("run_id");
CREATE INDEX "exp021_study_runs_study_id_state_idx" ON "exp021_study_runs"("study_id", "state");
CREATE INDEX "exp021_study_runs_enrollment_id_idx" ON "exp021_study_runs"("enrollment_id");
CREATE INDEX "exp021_study_runs_organization_id_vehicle_id_idx"
  ON "exp021_study_runs"("organization_id", "vehicle_id");

CREATE TABLE "exp021_study_order_balances" (
  "id" TEXT NOT NULL,
  "study_id" TEXT NOT NULL,
  "phase_order_key" TEXT NOT NULL,
  "committed_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exp021_study_order_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_study_order_balances_study_id_phase_order_key_key"
  ON "exp021_study_order_balances"("study_id", "phase_order_key");

CREATE TABLE "exp021_study_vehicle_order_balances" (
  "id" TEXT NOT NULL,
  "study_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "phase_order_key" TEXT NOT NULL,
  "committed_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exp021_study_vehicle_order_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_study_vehicle_order_balances_study_id_vehicle_id_phase_order_key_key"
  ON "exp021_study_vehicle_order_balances"("study_id", "vehicle_id", "phase_order_key");

ALTER TABLE "exp021_study_enrollments"
  ADD CONSTRAINT "exp021_study_enrollments_study_id_fkey"
  FOREIGN KEY ("study_id") REFERENCES "exp021_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_enrollments"
  ADD CONSTRAINT "exp021_study_enrollments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_enrollments"
  ADD CONSTRAINT "exp021_study_enrollments_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_study_id_fkey"
  FOREIGN KEY ("study_id") REFERENCES "exp021_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "exp021_study_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_runs"
  ADD CONSTRAINT "exp021_study_runs_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_order_balances"
  ADD CONSTRAINT "exp021_study_order_balances_study_id_fkey"
  FOREIGN KEY ("study_id") REFERENCES "exp021_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_vehicle_order_balances"
  ADD CONSTRAINT "exp021_study_vehicle_order_balances_study_id_fkey"
  FOREIGN KEY ("study_id") REFERENCES "exp021_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exp021_study_vehicle_order_balances"
  ADD CONSTRAINT "exp021_study_vehicle_order_balances_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
