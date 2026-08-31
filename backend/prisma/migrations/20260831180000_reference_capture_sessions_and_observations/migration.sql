-- Phase 3A.1 — DIMO LTE_R1 Flight Recorder reference capture (isolated from production trips).

CREATE TYPE "ReferenceCaptureSessionStatus" AS ENUM (
    'CREATED',
    'PREFLIGHT',
    'READY',
    'RECORDING',
    'STOPPING',
    'COMPLETED',
    'FAILED',
    'ABORTED'
);

CREATE TYPE "ReferenceCaptureObservationKind" AS ENUM (
    'SIGNAL_POINT',
    'NATIVE_EVENT',
    'SEGMENT',
    'SESSION_METADATA',
    'PROBE_RESULT'
);

CREATE TABLE "reference_capture_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "connection_profile" TEXT NOT NULL,
    "powertrain_profile" TEXT,
    "hardware_profile" TEXT,
    "manifest_id" TEXT NOT NULL,
    "manifest_version" TEXT NOT NULL,
    "status" "ReferenceCaptureSessionStatus" NOT NULL DEFAULT 'CREATED',
    "recorder_software_version" TEXT,
    "ground_truth_video_ref" TEXT,
    "sync_marker_json" JSONB,
    "mass_binding_json" JSONB,
    "preflight_json" JSONB,
    "broad_observation_field_count" INTEGER,
    "failure_reason" TEXT,
    "started_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_capture_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reference_capture_observations" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "envelope_version" TEXT NOT NULL,
    "observation_kind" "ReferenceCaptureObservationKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "connection_profile" TEXT NOT NULL,
    "powertrain_profile" TEXT,
    "provider_field" TEXT,
    "canonical_key" TEXT,
    "raw_identity" TEXT NOT NULL,
    "acquisition_surface" TEXT,
    "acquisition_tier" TEXT,
    "temporal_class" TEXT,
    "raw_value_json" JSONB NOT NULL,
    "raw_unit" TEXT,
    "normalized_value_json" JSONB,
    "normalized_unit" TEXT,
    "provider_timestamp" TIMESTAMP(3),
    "synq_received_at" TIMESTAMP(3) NOT NULL,
    "request_started_at" TIMESTAMP(3),
    "request_completed_at" TIMESTAMP(3),
    "request_correlation_id" TEXT,
    "sequence_number" INTEGER,
    "capability_state" TEXT,
    "provenance_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_capture_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reference_capture_sessions_organization_id_vehicle_id_status_idx"
    ON "reference_capture_sessions"("organization_id", "vehicle_id", "status");

CREATE INDEX "reference_capture_sessions_vehicle_id_created_at_idx"
    ON "reference_capture_sessions"("vehicle_id", "created_at");

CREATE INDEX "reference_capture_observations_session_id_synq_received_at_idx"
    ON "reference_capture_observations"("session_id", "synq_received_at");

CREATE INDEX "reference_capture_observations_session_id_provider_field_idx"
    ON "reference_capture_observations"("session_id", "provider_field");

CREATE INDEX "reference_capture_observations_organization_id_vehicle_id_idx"
    ON "reference_capture_observations"("organization_id", "vehicle_id");

ALTER TABLE "reference_capture_sessions"
    ADD CONSTRAINT "reference_capture_sessions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reference_capture_sessions"
    ADD CONSTRAINT "reference_capture_sessions_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reference_capture_observations"
    ADD CONSTRAINT "reference_capture_observations_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "reference_capture_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reference_capture_observations"
    ADD CONSTRAINT "reference_capture_observations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reference_capture_observations"
    ADD CONSTRAINT "reference_capture_observations_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
