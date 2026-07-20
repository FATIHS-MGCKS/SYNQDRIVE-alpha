-- CreateEnum
CREATE TYPE "DeviceConnectionEpisodeLifecycleAction" AS ENUM ('SUPERSEDED_BY_BINDING_CHANGE', 'STALE_EVENT_IGNORED', 'REQUIRES_REVIEW_FLAGGED', 'BINDING_DRIFT_RECONCILED');

-- AlterTable
ALTER TABLE "dimo_device_connection_events" ADD COLUMN "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "dimo_device_connection_events" ADD COLUMN "processed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "device_connection_episodes" ADD COLUMN "review_reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "device_connection_episode_lifecycle_audits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "episode_id" TEXT,
    "action" "DeviceConnectionEpisodeLifecycleAction" NOT NULL,
    "reason_codes" TEXT[],
    "provider_observed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "device_connection_episode_lifecycle_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_connection_episode_lifecycle_audits_organization_id_idx" ON "device_connection_episode_lifecycle_audits"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_episode_lifecycle_audits_vehicle_id_idx" ON "device_connection_episode_lifecycle_audits"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_episode_lifecycle_audits_episode_id_idx" ON "device_connection_episode_lifecycle_audits"("episode_id");

-- AddForeignKey
ALTER TABLE "device_connection_episode_lifecycle_audits" ADD CONSTRAINT "device_connection_episode_lifecycle_audits_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "device_connection_episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
