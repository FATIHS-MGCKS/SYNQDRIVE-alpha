-- CreateEnum
CREATE TYPE "R9ProviderWakeForensicClassification" AS ENUM ('ADMITTED', 'IGNORED_SIGNAL', 'IGNORED_FSM_ACTIVE', 'IGNORED_BINDING', 'IGNORED_STALE', 'ALREADY_COVERED', 'COALESCED', 'QUEUE_FAILED', 'PERSIST_FAILED', 'INVALID_SIGNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "R9ProviderWakeForensicLineageRole" AS ENUM ('WAKE_CREATED_NEW_SNAPSHOT', 'WAKE_COALESCED_INTO_QUEUED_SNAPSHOT', 'WAKE_COALESCED_INTO_ACTIVE_SNAPSHOT', 'WAKE_SCHEDULED_SUCCESSOR');

-- CreateEnum
CREATE TYPE "R9ProviderWakeForensicSnapshotStatus" AS ENUM ('SUCCESS', 'FAILURE', 'SKIPPED');

-- CreateTable
CREATE TABLE "r9_provider_wake_forensics" (
    "id" TEXT NOT NULL,
    "wake_correlation_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "dimo_token_id" INTEGER,
    "signal_name" TEXT NOT NULL,
    "wake_reason" TEXT NOT NULL,
    "provider_observed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL,
    "fsm_state_at_intake" "TripDetectionState",
    "classification" "R9ProviderWakeForensicClassification" NOT NULL,
    "lineage_role" "R9ProviderWakeForensicLineageRole",
    "coalesce_count" INTEGER NOT NULL DEFAULT 0,
    "snapshot_job_id" TEXT,
    "snapshot_requested_at" TIMESTAMP(3),
    "snapshot_started_at" TIMESTAMP(3),
    "snapshot_finished_at" TIMESTAMP(3),
    "provider_fetched_at" TIMESTAMP(3),
    "snapshot_source_timestamp" TIMESTAMP(3),
    "snapshot_status" "R9ProviderWakeForensicSnapshotStatus",
    "fsm_state_after_evaluation" "TripDetectionState",
    "trip_evaluation_result" TEXT,
    "possible_start_at" TIMESTAMP(3),
    "active_trip_at" TIMESTAMP(3),
    "vehicle_trip_id" TEXT,
    "provider_delivery_id" TEXT,
    "payload_fingerprint" TEXT,
    "wake_correlation_version" TEXT NOT NULL DEFAULT 'R9_WAKE_CORRELATION_V1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "r9_provider_wake_forensics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "r9_provider_wake_forensics_wake_correlation_id_key" ON "r9_provider_wake_forensics"("wake_correlation_id");

-- CreateIndex
CREATE INDEX "r9_provider_wake_forensics_organization_id_vehicle_id_received_idx" ON "r9_provider_wake_forensics"("organization_id", "vehicle_id", "received_at");

-- CreateIndex
CREATE INDEX "r9_provider_wake_forensics_received_at_idx" ON "r9_provider_wake_forensics"("received_at");

-- CreateIndex
CREATE INDEX "r9_provider_wake_forensics_vehicle_trip_id_idx" ON "r9_provider_wake_forensics"("vehicle_trip_id");

-- AddForeignKey
ALTER TABLE "r9_provider_wake_forensics" ADD CONSTRAINT "r9_provider_wake_forensics_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
