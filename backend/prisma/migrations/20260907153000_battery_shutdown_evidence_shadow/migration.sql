-- M3.2B — shadow shutdown evidence acquisition (observability only; no authoritative battery state)

CREATE TYPE "BatteryShutdownEvidenceClass" AS ENUM (
  'ACTIVE_ALTERNATOR',
  'ACTIVE_NON_CHARGING',
  'SHUTDOWN_TRANSITION',
  'POST_ENGINE_OFF_PRE_SLEEP',
  'UNKNOWN_STATE',
  'STALE_OR_SKEWED_STATE'
);

CREATE TYPE "BatteryShutdownEvidenceConfidenceClass" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'INSUFFICIENT'
);

CREATE TYPE "BatteryShutdownStateAlignmentClass" AS ENUM (
  'ALIGNED',
  'PARTIAL',
  'SKEWED',
  'UNKNOWN'
);

CREATE TYPE "BatteryShutdownStateCompleteness" AS ENUM (
  'COMPLETE',
  'PARTIAL',
  'MISSING'
);

CREATE TABLE "battery_shutdown_evidence_observations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "trip_id" UUID,
  "provider" TEXT NOT NULL DEFAULT 'DIMO',
  "provider_observation_at" TIMESTAMPTZ,
  "effective_capture_reference_at" TIMESTAMPTZ NOT NULL,
  "provider_response_at" TIMESTAMPTZ NOT NULL,
  "ingested_at" TIMESTAMPTZ NOT NULL,
  "voltage" DOUBLE PRECISION,
  "voltage_observed_at" TIMESTAMPTZ,
  "speed_kmh" DOUBLE PRECISION,
  "speed_observed_at" TIMESTAMPTZ,
  "speed_timestamp_source" TEXT,
  "ignition_on" BOOLEAN,
  "ignition_observed_at" TIMESTAMPTZ,
  "ignition_timestamp_source" TEXT,
  "engine_running" BOOLEAN,
  "engine_running_observed_at" TIMESTAMPTZ,
  "engine_running_timestamp_source" TEXT,
  "is_lv_charging" BOOLEAN,
  "is_hv_charging" BOOLEAN,
  "charging_context_observed_at" TIMESTAMPTZ,
  "charging_context_timestamp_source" TEXT,
  "active_trip" BOOLEAN,
  "active_trip_observed_at" TIMESTAMPTZ,
  "active_trip_timestamp_source" TEXT,
  "trip_started_at" TIMESTAMPTZ,
  "trip_ended_at" TIMESTAMPTZ,
  "relative_to_trip_end_ms" INTEGER,
  "vehicle_online" BOOLEAN,
  "vehicle_online_observed_at" TIMESTAMPTZ,
  "provider_last_seen_at" TIMESTAMPTZ,
  "source_observation_id" TEXT,
  "source_snapshot_id" TEXT,
  "source_kind" TEXT NOT NULL DEFAULT 'LIVE_VOLTAGE_CLASSIFY',
  "state_timestamp_skew_ms" INTEGER,
  "max_field_timestamp_skew_ms" INTEGER,
  "state_completeness" "BatteryShutdownStateCompleteness" NOT NULL,
  "state_alignment_class" "BatteryShutdownStateAlignmentClass" NOT NULL,
  "evidence_class" "BatteryShutdownEvidenceClass" NOT NULL,
  "confidence_class" "BatteryShutdownEvidenceConfidenceClass" NOT NULL,
  "field_provenance" JSONB,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "battery_shutdown_evidence_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "battery_trip_shutdown_contexts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "trip_id" UUID NOT NULL,
  "trip_ended_at" TIMESTAMPTZ NOT NULL,
  "snapshot" JSONB NOT NULL,
  "state_timestamp_skew_ms" INTEGER,
  "max_field_timestamp_skew_ms" INTEGER,
  "state_completeness" "BatteryShutdownStateCompleteness" NOT NULL,
  "state_alignment_class" "BatteryShutdownStateAlignmentClass" NOT NULL,
  "post_trip_observation_present_at_capture" BOOLEAN NOT NULL DEFAULT false,
  "first_observation_after_trip_end_at_at_capture" TIMESTAMPTZ,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "battery_trip_shutdown_contexts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battery_shutdown_evidence_obs_idempotency"
  ON "battery_shutdown_evidence_observations" ("organization_id", "vehicle_id", "idempotency_key");

CREATE INDEX "battery_shutdown_evidence_obs_vehicle_eff_capture_idx"
  ON "battery_shutdown_evidence_observations" ("vehicle_id", "effective_capture_reference_at" DESC);

CREATE INDEX "battery_shutdown_evidence_obs_trip_eff_capture_idx"
  ON "battery_shutdown_evidence_observations" ("trip_id", "effective_capture_reference_at" DESC);

CREATE INDEX "battery_shutdown_evidence_obs_org_created_idx"
  ON "battery_shutdown_evidence_observations" ("organization_id", "created_at" DESC);

CREATE INDEX "battery_shutdown_evidence_obs_evidence_class_idx"
  ON "battery_shutdown_evidence_observations" ("evidence_class");

CREATE UNIQUE INDEX "battery_trip_shutdown_contexts_trip_id_key"
  ON "battery_trip_shutdown_contexts" ("trip_id");

CREATE UNIQUE INDEX "battery_trip_shutdown_ctx_idempotency"
  ON "battery_trip_shutdown_contexts" ("organization_id", "vehicle_id", "idempotency_key");

CREATE INDEX "battery_trip_shutdown_contexts_vehicle_ended_idx"
  ON "battery_trip_shutdown_contexts" ("vehicle_id", "trip_ended_at" DESC);

ALTER TABLE "battery_shutdown_evidence_observations"
  ADD CONSTRAINT "battery_shutdown_evidence_observations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_shutdown_evidence_observations"
  ADD CONSTRAINT "battery_shutdown_evidence_observations_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_shutdown_evidence_observations"
  ADD CONSTRAINT "battery_shutdown_evidence_observations_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "battery_trip_shutdown_contexts"
  ADD CONSTRAINT "battery_trip_shutdown_contexts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_trip_shutdown_contexts"
  ADD CONSTRAINT "battery_trip_shutdown_contexts_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_trip_shutdown_contexts"
  ADD CONSTRAINT "battery_trip_shutdown_contexts_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
