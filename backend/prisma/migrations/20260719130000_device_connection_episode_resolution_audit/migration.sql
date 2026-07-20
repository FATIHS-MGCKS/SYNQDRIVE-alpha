-- CreateEnum
CREATE TYPE "DeviceConnectionEpisodeResolutionOutboxEventType" AS ENUM ('CONNECTIVITY_RUNTIME_RECALCULATE', 'DEVICE_ALERT_RESOLVE_PREPARED');

-- CreateEnum
CREATE TYPE "DeviceConnectionEpisodeResolutionOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "device_connection_episode_resolution_audits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "resolution_method" "DeviceConnectionEpisodeResolutionMethod" NOT NULL,
    "resolution_snapshot_id" TEXT NOT NULL,
    "provider_observed_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_connection_episode_resolution_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_connection_episode_resolution_outbox" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "event_type" "DeviceConnectionEpisodeResolutionOutboxEventType" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeviceConnectionEpisodeResolutionOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "device_connection_episode_resolution_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_connection_episode_resolution_audits_organization_id_idx" ON "device_connection_episode_resolution_audits"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_episode_resolution_audits_vehicle_id_idx" ON "device_connection_episode_resolution_audits"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_episode_resolution_audits_episode_id_idx" ON "device_connection_episode_resolution_audits"("episode_id");

-- CreateIndex
CREATE UNIQUE INDEX "dce_resolution_audits_episode_snapshot_key" ON "device_connection_episode_resolution_audits"("episode_id", "resolution_snapshot_id");

-- CreateIndex
CREATE INDEX "device_connection_episode_resolution_outbox_organization_id_idx" ON "device_connection_episode_resolution_outbox"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_episode_resolution_outbox_vehicle_id_idx" ON "device_connection_episode_resolution_outbox"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_episode_resolution_outbox_status_idx" ON "device_connection_episode_resolution_outbox"("status");

-- CreateIndex
CREATE UNIQUE INDEX "device_connection_episode_resolution_outbox_idempotency_key_key" ON "device_connection_episode_resolution_outbox"("idempotency_key");
