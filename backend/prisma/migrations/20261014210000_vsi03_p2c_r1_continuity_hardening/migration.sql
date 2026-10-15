-- VSI-03 P2C-R1 — observation continuity, phases, durable counters (additive)

CREATE TYPE "VehicleProviderSourceObservationRecordPhase" AS ENUM ('PROVIDER_FETCH', 'VLS_APPLICATION');

ALTER TYPE "VehicleProviderSourceObservationOutcome" ADD VALUE IF NOT EXISTS 'PROVIDER_FETCH_RECORDED';
ALTER TYPE "VehicleProviderSourceObservationOutcome" ADD VALUE IF NOT EXISTS 'VLS_COMMITTED';
ALTER TYPE "VehicleProviderSourceObservationOutcome" ADD VALUE IF NOT EXISTS 'PERSISTENCE_FAILED';

ALTER TABLE "vehicle_provider_source_observations"
  ADD COLUMN IF NOT EXISTS "record_phase" "VehicleProviderSourceObservationRecordPhase" NOT NULL DEFAULT 'PROVIDER_FETCH',
  ADD COLUMN IF NOT EXISTS "fetch_correlation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "bullmq_attempt_number" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "vsi_p2c_obs_fetch_correlation_idx"
  ON "vehicle_provider_source_observations"("fetch_correlation_id");

CREATE TABLE IF NOT EXISTS "vehicle_provider_source_observation_counters" (
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_binding_scope_key" TEXT NOT NULL,
  "provider_token_scope_key" TEXT NOT NULL,
  "next_observation_index" BIGINT NOT NULL DEFAULT 2,
  CONSTRAINT "vehicle_provider_source_observation_counters_pkey"
    PRIMARY KEY ("organization_id", "vehicle_id", "provider", "provider_binding_scope_key", "provider_token_scope_key")
);

ALTER TABLE "vehicle_provider_source_observation_counters"
  ADD CONSTRAINT "vsi_p2c_obs_counters_org_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_provider_source_observation_counters"
  ADD CONSTRAINT "vsi_p2c_obs_counters_vehicle_fkey"
  FOREIGN KEY ("organization_id", "vehicle_id") REFERENCES "vehicles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Allow one PROVIDER_FETCH and one VLS_APPLICATION row per observation index.
DROP INDEX IF EXISTS "vsi_p2c_obs_scope_index_key";

CREATE UNIQUE INDEX "vsi_p2c_obs_scope_index_phase_key"
  ON "vehicle_provider_source_observations"(
    "organization_id",
    "vehicle_id",
    "provider",
    "provider_binding_scope_key",
    "provider_token_scope_key",
    "observation_index",
    "record_phase"
  );
