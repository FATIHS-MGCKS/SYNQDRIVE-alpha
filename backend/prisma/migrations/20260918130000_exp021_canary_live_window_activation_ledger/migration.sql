-- EXP-021 — KS MX 2024 canary-only live window activation ledger (PR-D canary slice).
-- Durable exactly-once trip binding; resumable state machine.

CREATE TYPE "Exp021CanaryLiveWindowActivationState" AS ENUM (
  'CLAIMED',
  'STUDY_RUN_RESERVED',
  'SESSION_CREATED',
  'RECORDING_STARTED',
  'TRIP_COMPLETED_SEEN',
  'FINALIZED',
  'FAILED'
);

CREATE TABLE "exp021_canary_live_window_activation_ledgers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "token_id" INTEGER NOT NULL,
  "vehicle_trip_id" UUID NOT NULL,
  "study_run_id" UUID,
  "session_id" UUID,
  "state" "Exp021CanaryLiveWindowActivationState" NOT NULL DEFAULT 'CLAIMED',
  "failure_reason" TEXT,
  "activation_not_before_at" TIMESTAMPTZ NOT NULL,
  "trip_start_time" TIMESTAMPTZ NOT NULL,
  "trip_end_time" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "exp021_canary_live_window_activation_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_canary_live_window_activation_ledgers_vehicle_trip_id_key"
  ON "exp021_canary_live_window_activation_ledgers"("vehicle_trip_id");

CREATE UNIQUE INDEX "exp021_canary_live_window_activation_ledgers_session_id_key"
  ON "exp021_canary_live_window_activation_ledgers"("session_id")
  WHERE "session_id" IS NOT NULL;

CREATE INDEX "exp021_canary_live_window_activation_ledgers_vehicle_state_idx"
  ON "exp021_canary_live_window_activation_ledgers"("vehicle_id", "state");

ALTER TABLE "exp021_canary_live_window_activation_ledgers"
  ADD CONSTRAINT "exp021_canary_live_window_activation_ledgers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_canary_live_window_activation_ledgers"
  ADD CONSTRAINT "exp021_canary_live_window_activation_ledgers_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
