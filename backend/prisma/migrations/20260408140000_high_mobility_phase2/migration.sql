-- High Mobility Phase 2
-- Adds: registration_state, streaming_state, provider_mode, telemetry_readiness_json to high_mobility_vehicles
-- Adds: high_mobility_stream_sync_logs, high_mobility_stream_consumer_states tables
-- Adds: new enums HmRegistrationState, HmStreamingState, HmIngestStatus, HmMqttConnectionState

-- New enums
CREATE TYPE "HmRegistrationState" AS ENUM ('NOT_REGISTERED', 'REGISTRATION_PENDING', 'REGISTERED', 'REGISTRATION_FAILED');
CREATE TYPE "HmStreamingState" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR');
CREATE TYPE "HmIngestStatus" AS ENUM ('RECEIVED', 'PARSED', 'STORED', 'FAILED', 'DEDUPLICATED');
CREATE TYPE "HmMqttConnectionState" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'DISABLED');

-- Extend high_mobility_vehicles
ALTER TABLE "high_mobility_vehicles"
    ADD COLUMN "registration_state"        "HmRegistrationState" NOT NULL DEFAULT 'NOT_REGISTERED',
    ADD COLUMN "registered_at"             TIMESTAMP(3),
    ADD COLUMN "streaming_state"           "HmStreamingState" NOT NULL DEFAULT 'NOT_CONFIGURED',
    ADD COLUMN "provider_mode"             TEXT,
    ADD COLUMN "telemetry_readiness_json"  JSONB;

-- high_mobility_stream_sync_logs
CREATE TABLE "high_mobility_stream_sync_logs" (
    "id"                        TEXT NOT NULL,
    "high_mobility_vehicle_id"  TEXT,
    "vin"                       TEXT,
    "message_id"                TEXT NOT NULL,
    "topic"                     TEXT NOT NULL,
    "message_timestamp"         TIMESTAMP(3),
    "ingest_status"             "HmIngestStatus" NOT NULL DEFAULT 'RECEIVED',
    "is_duplicate"              BOOLEAN NOT NULL DEFAULT false,
    "payload_json"              JSONB,
    "normalized_summary_json"   JSONB,
    "error_message"             TEXT,
    "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "high_mobility_stream_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_hm_stream_message_id" ON "high_mobility_stream_sync_logs"("message_id");
CREATE INDEX "idx_hm_stream_logs_vehicle" ON "high_mobility_stream_sync_logs"("high_mobility_vehicle_id");
CREATE INDEX "idx_hm_stream_logs_vin" ON "high_mobility_stream_sync_logs"("vin");
CREATE INDEX "idx_hm_stream_logs_topic" ON "high_mobility_stream_sync_logs"("topic");
CREATE INDEX "idx_hm_stream_logs_created" ON "high_mobility_stream_sync_logs"("created_at");
CREATE INDEX "idx_hm_stream_logs_status" ON "high_mobility_stream_sync_logs"("ingest_status");

ALTER TABLE "high_mobility_stream_sync_logs"
    ADD CONSTRAINT "hm_stream_sync_logs_vehicle_fk"
    FOREIGN KEY ("high_mobility_vehicle_id")
    REFERENCES "high_mobility_vehicles"("id") ON DELETE SET NULL;

-- high_mobility_stream_consumer_states
CREATE TABLE "high_mobility_stream_consumer_states" (
    "id"                TEXT NOT NULL,
    "environment"       TEXT NOT NULL,
    "application_id"    TEXT NOT NULL,
    "consumer_group"    TEXT NOT NULL,
    "connection_state"  "HmMqttConnectionState" NOT NULL DEFAULT 'DISCONNECTED',
    "last_connected_at" TIMESTAMP(3),
    "last_message_at"   TIMESTAMP(3),
    "last_error_at"     TIMESTAMP(3),
    "last_error_message" TEXT,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "high_mobility_stream_consumer_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_hm_consumer_state" ON "high_mobility_stream_consumer_states"("environment", "application_id", "consumer_group");
CREATE INDEX "idx_hm_consumer_state_env" ON "high_mobility_stream_consumer_states"("environment");
