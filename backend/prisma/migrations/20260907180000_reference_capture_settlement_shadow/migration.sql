-- EXP-021A — Reference Capture settlement shadow (forensic experiment-only)

CREATE TYPE "ReferenceCaptureSettlementShadowScheduleStatus" AS ENUM (
  'PENDING',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'SKIPPED'
);

CREATE TYPE "ReferenceCaptureSettlementShadowProbeType" AS ENUM (
  'FIXED_INTERVAL',
  'WHOLE_TRIP'
);

CREATE TABLE "reference_capture_settlement_shadow_experiments" (
  "id" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "token_id" INTEGER NOT NULL,
  "calibration_series_id" TEXT,
  "vehicle_trip_id" TEXT,
  "trip_start_time" TIMESTAMP(3),
  "trip_end_time" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "last_synced_phase_count" INTEGER NOT NULL DEFAULT 0,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reference_capture_settlement_shadow_experiments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_capture_settlement_shadow_experiments_experiment_id_key"
  ON "reference_capture_settlement_shadow_experiments"("experiment_id");
CREATE UNIQUE INDEX "reference_capture_settlement_shadow_experiments_session_id_key"
  ON "reference_capture_settlement_shadow_experiments"("session_id");
CREATE INDEX "reference_capture_settlement_shadow_experiments_org_vehicle_idx"
  ON "reference_capture_settlement_shadow_experiments"("organization_id", "vehicle_id");

CREATE TABLE "reference_capture_settlement_shadow_schedules" (
  "id" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "token_id" INTEGER NOT NULL,
  "probe_id" TEXT NOT NULL,
  "probe_type" "ReferenceCaptureSettlementShadowProbeType" NOT NULL,
  "phase" TEXT,
  "source_interval_start" TIMESTAMP(3) NOT NULL,
  "source_interval_end" TIMESTAMP(3) NOT NULL,
  "query_from" TIMESTAMP(3) NOT NULL,
  "query_to" TIMESTAMP(3) NOT NULL,
  "aggregation_interval" TEXT NOT NULL DEFAULT '1s',
  "scheduled_age_ms" INTEGER NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "status" "ReferenceCaptureSettlementShadowScheduleStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "executed_at" TIMESTAMP(3),
  "bull_job_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reference_capture_settlement_shadow_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_capture_settlement_shadow_schedules_idempotency_key_key"
  ON "reference_capture_settlement_shadow_schedules"("idempotency_key");
CREATE INDEX "reference_capture_settlement_shadow_schedules_status_scheduled_at_idx"
  ON "reference_capture_settlement_shadow_schedules"("status", "scheduled_at");
CREATE INDEX "reference_capture_settlement_shadow_schedules_experiment_id_idx"
  ON "reference_capture_settlement_shadow_schedules"("experiment_id");
CREATE INDEX "reference_capture_settlement_shadow_schedules_session_id_idx"
  ON "reference_capture_settlement_shadow_schedules"("session_id");

CREATE TABLE "reference_capture_settlement_shadow_observations" (
  "id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "token_id" INTEGER NOT NULL,
  "probe_id" TEXT NOT NULL,
  "probe_type" "ReferenceCaptureSettlementShadowProbeType" NOT NULL,
  "phase" TEXT,
  "source_interval_start" TIMESTAMP(3) NOT NULL,
  "source_interval_end" TIMESTAMP(3) NOT NULL,
  "scheduled_age_ms" INTEGER NOT NULL,
  "actual_age_ms" INTEGER NOT NULL,
  "schedule_drift_ms" INTEGER NOT NULL,
  "request_started_at" TIMESTAMP(3) NOT NULL,
  "request_completed_at" TIMESTAMP(3) NOT NULL,
  "query_from" TIMESTAMP(3) NOT NULL,
  "query_to" TIMESTAMP(3) NOT NULL,
  "aggregation_interval" TEXT NOT NULL,
  "provider_request_status" TEXT NOT NULL,
  "provider_error" TEXT,
  "raw_row_count" INTEGER NOT NULL,
  "response_hash" TEXT NOT NULL,
  "observation_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reference_capture_settlement_shadow_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_capture_settlement_shadow_observations_schedule_id_key"
  ON "reference_capture_settlement_shadow_observations"("schedule_id");
CREATE INDEX "reference_capture_settlement_shadow_observations_experiment_id_idx"
  ON "reference_capture_settlement_shadow_observations"("experiment_id");

ALTER TABLE "reference_capture_settlement_shadow_experiments"
  ADD CONSTRAINT "reference_capture_settlement_shadow_experiments_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "reference_capture_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reference_capture_settlement_shadow_schedules"
  ADD CONSTRAINT "reference_capture_settlement_shadow_schedules_experiment_id_fkey"
  FOREIGN KEY ("experiment_id") REFERENCES "reference_capture_settlement_shadow_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reference_capture_settlement_shadow_observations"
  ADD CONSTRAINT "reference_capture_settlement_shadow_observations_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "reference_capture_settlement_shadow_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
