-- M3.3A — generalized battery evidence + rest sessions (isolated; feature flag default OFF)

CREATE TYPE "BatteryGeneralizedEvidenceClass" AS ENUM (
  'DRIVING_CHARGING',
  'DRIVING_NON_CHARGING',
  'ENGINE_OFF_TRANSITION',
  'PARKED_REST_CANDIDATE',
  'REST_WAKE_VOLTAGE',
  'REST_STABLE_VOLTAGE',
  'ACTIVE_VEHICLE_CONTAMINATED',
  'CHARGING_CONTAMINATED',
  'STALE_REPLAY',
  'STATE_AMBIGUOUS',
  'UNKNOWN'
);

CREATE TYPE "BatteryGeneralizedEvidenceConfidence" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'INSUFFICIENT'
);

CREATE TYPE "BatteryRestSessionStatus" AS ENUM (
  'CANDIDATE',
  'CONFIRMED',
  'RESTING',
  'ENDED',
  'INVALIDATED'
);

CREATE TYPE "BatteryRestSessionAnchorType" AS ENUM (
  'PHYSICAL_SHUTDOWN',
  'TRIP_END_CONFIRMED'
);

CREATE TYPE "BatteryRestSessionEndReason" AS ENUM (
  'NEW_TRIP',
  'VEHICLE_ACTIVITY',
  'CHARGING_DETECTED',
  'WAKE_DETECTED',
  'SESSION_TIMEOUT',
  'INVALIDATED',
  'MANUAL'
);

CREATE TABLE "battery_rest_sessions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "anchor_type" "BatteryRestSessionAnchorType" NOT NULL,
  "anchor_at" TIMESTAMP(3) NOT NULL,
  "candidate_trip_id" TEXT,
  "confirmed_trip_id" TEXT,
  "session_status" "BatteryRestSessionStatus" NOT NULL,
  "opened_at" TIMESTAMP(3) NOT NULL,
  "confirmed_at" TIMESTAMP(3),
  "ended_at" TIMESTAMP(3),
  "end_reason" "BatteryRestSessionEndReason",
  "first_rest_observation_at" TIMESTAMP(3),
  "last_rest_observation_at" TIMESTAMP(3),
  "valid_rest_observation_count" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "battery_rest_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "battery_generalized_evidence_observations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "source_measurement_id" TEXT NOT NULL,
  "source_kind" TEXT NOT NULL DEFAULT 'LIVE_VOLTAGE_CLASSIFY',
  "voltage" DOUBLE PRECISION,
  "voltage_observed_at" TIMESTAMP(3),
  "provider_observation_at" TIMESTAMP(3),
  "provider_timestamp_source" TEXT,
  "ingested_at" TIMESTAMP(3) NOT NULL,
  "evidence_class" "BatteryGeneralizedEvidenceClass" NOT NULL,
  "evidence_confidence" "BatteryGeneralizedEvidenceConfidence" NOT NULL,
  "classification_version" TEXT NOT NULL,
  "trip_id" TEXT,
  "rest_session_id" TEXT,
  "actual_rest_age_ms" INTEGER,
  "nominal_rest_interval_index" INTEGER,
  "tolerance_policy_version" TEXT,
  "speed_kmh" DOUBLE PRECISION,
  "ignition_on" BOOLEAN,
  "engine_running" BOOLEAN,
  "is_lv_charging" BOOLEAN,
  "is_hv_charging" BOOLEAN,
  "vehicle_online" BOOLEAN,
  "temperature_c" DOUBLE PRECISION,
  "temperature_observed_at" TIMESTAMP(3),
  "state_observed_at" TIMESTAMP(3),
  "state_timestamp_source" TEXT,
  "state_timestamp_skew_ms" INTEGER,
  "max_field_timestamp_skew_ms" INTEGER,
  "state_completeness" "BatteryShutdownStateCompleteness" NOT NULL,
  "state_alignment_class" "BatteryShutdownStateAlignmentClass" NOT NULL,
  "atomic_claim" BOOLEAN NOT NULL DEFAULT false,
  "field_provenance" JSONB,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_generalized_evidence_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battery_rest_session_idempotency"
  ON "battery_rest_sessions"("organization_id", "vehicle_id", "idempotency_key");

CREATE INDEX "battery_rest_sessions_vehicle_id_session_status_idx"
  ON "battery_rest_sessions"("vehicle_id", "session_status");

CREATE INDEX "battery_rest_sessions_vehicle_id_anchor_at_idx"
  ON "battery_rest_sessions"("vehicle_id", "anchor_at" DESC);

CREATE UNIQUE INDEX "battery_gen_evidence_idempotency"
  ON "battery_generalized_evidence_observations"("organization_id", "vehicle_id", "idempotency_key");

CREATE INDEX "battery_gen_evidence_vehicle_voltage_obs_idx"
  ON "battery_generalized_evidence_observations"("vehicle_id", "voltage_observed_at" DESC);

CREATE INDEX "battery_gen_evidence_rest_session_idx"
  ON "battery_generalized_evidence_observations"("rest_session_id", "voltage_observed_at" DESC);

CREATE INDEX "battery_gen_evidence_trip_idx"
  ON "battery_generalized_evidence_observations"("trip_id", "voltage_observed_at" DESC);

CREATE INDEX "battery_gen_evidence_evidence_class_idx"
  ON "battery_generalized_evidence_observations"("evidence_class");

ALTER TABLE "battery_rest_sessions"
  ADD CONSTRAINT "battery_rest_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_rest_sessions"
  ADD CONSTRAINT "battery_rest_sessions_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_rest_sessions"
  ADD CONSTRAINT "battery_rest_sessions_candidate_trip_id_fkey"
  FOREIGN KEY ("candidate_trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "battery_rest_sessions"
  ADD CONSTRAINT "battery_rest_sessions_confirmed_trip_id_fkey"
  FOREIGN KEY ("confirmed_trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "battery_generalized_evidence_observations"
  ADD CONSTRAINT "battery_gen_evidence_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_generalized_evidence_observations"
  ADD CONSTRAINT "battery_gen_evidence_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_generalized_evidence_observations"
  ADD CONSTRAINT "battery_gen_evidence_source_measurement_id_fkey"
  FOREIGN KEY ("source_measurement_id") REFERENCES "battery_measurements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_generalized_evidence_observations"
  ADD CONSTRAINT "battery_gen_evidence_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "battery_generalized_evidence_observations"
  ADD CONSTRAINT "battery_gen_evidence_rest_session_id_fkey"
  FOREIGN KEY ("rest_session_id") REFERENCES "battery_rest_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
