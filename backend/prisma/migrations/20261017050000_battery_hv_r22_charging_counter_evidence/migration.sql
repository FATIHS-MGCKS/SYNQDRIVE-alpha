-- M3.3-HV-R22-P1 — durable DIMO charging-added-energy interval bucket evidence (sidecar).

CREATE TABLE "battery_hv_charging_counter_ingestion_batches" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "segment_fingerprint" TEXT NOT NULL,
  "source_hv_charge_session_id" TEXT,
  "dimo_token_id" INTEGER,
  "evidence_contract_version" TEXT NOT NULL,
  "query_window_from" TIMESTAMP(3) NOT NULL,
  "query_window_to" TIMESTAMP(3) NOT NULL,
  "segment_start_at" TIMESTAMP(3) NOT NULL,
  "segment_end_at" TIMESTAMP(3),
  "provider_observed_at" TIMESTAMP(3),
  "observation_set_fingerprint" CHAR(64) NOT NULL,
  "bucket_width" TEXT NOT NULL,
  "aggregation_mode" TEXT NOT NULL,
  "bucket_count" INTEGER NOT NULL,
  "available_bucket_count" INTEGER NOT NULL,
  "missing_bucket_count" INTEGER NOT NULL,
  "dimo_query_kind" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_hv_charging_counter_ingestion_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "battery_hv_charging_counter_observations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "segment_fingerprint" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "bucket_start_at" TIMESTAMP(3) NOT NULL,
  "bucket_end_at" TIMESTAMP(3),
  "bucket_width" TEXT NOT NULL,
  "aggregation_mode" TEXT NOT NULL,
  "signal_name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'kWh',
  "value_kwh" DOUBLE PRECISION,
  "min_kwh" DOUBLE PRECISION,
  "max_kwh" DOUBLE PRECISION,
  "availability" TEXT NOT NULL,
  "evidence_contract_version" TEXT NOT NULL,
  "provider_source" TEXT NOT NULL DEFAULT 'DIMO',
  "provider_timestamp_uncertainty" BOOLEAN NOT NULL DEFAULT true,
  "provenance" JSONB NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "supersedes_observation_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_hv_charging_counter_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battery_hv_cc_batch_tenant_idempotency"
  ON "battery_hv_charging_counter_ingestion_batches"("organization_id", "vehicle_id", "idempotency_key");

CREATE INDEX "battery_hv_cc_batch_segment_idx"
  ON "battery_hv_charging_counter_ingestion_batches"("organization_id", "vehicle_id", "segment_fingerprint", "created_at" DESC);

CREATE UNIQUE INDEX "battery_hv_cc_obs_tenant_idempotency"
  ON "battery_hv_charging_counter_observations"("organization_id", "vehicle_id", "idempotency_key");

CREATE UNIQUE INDEX "battery_hv_cc_obs_slot_revision"
  ON "battery_hv_charging_counter_observations"("organization_id", "vehicle_id", "segment_fingerprint", "bucket_start_at", "revision_number");

CREATE INDEX "battery_hv_cc_obs_batch_idx"
  ON "battery_hv_charging_counter_observations"("batch_id");

CREATE INDEX "battery_hv_cc_obs_segment_bucket_idx"
  ON "battery_hv_charging_counter_observations"("organization_id", "vehicle_id", "segment_fingerprint", "bucket_start_at");

ALTER TABLE "battery_hv_charging_counter_ingestion_batches"
  ADD CONSTRAINT "battery_hv_charging_counter_ingestion_batches_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charging_counter_ingestion_batches"
  ADD CONSTRAINT "battery_hv_charging_counter_ingestion_batches_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charging_counter_observations"
  ADD CONSTRAINT "battery_hv_charging_counter_observations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charging_counter_observations"
  ADD CONSTRAINT "battery_hv_charging_counter_observations_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charging_counter_observations"
  ADD CONSTRAINT "battery_hv_charging_counter_observations_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "battery_hv_charging_counter_ingestion_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charging_counter_observations"
  ADD CONSTRAINT "battery_hv_charging_counter_observations_supersedes_observation_id_fkey"
  FOREIGN KEY ("supersedes_observation_id") REFERENCES "battery_hv_charging_counter_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
