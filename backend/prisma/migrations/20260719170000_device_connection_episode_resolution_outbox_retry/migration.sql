-- AlterEnum
ALTER TYPE "DeviceConnectionEpisodeResolutionOutboxStatus" ADD VALUE 'RETRYABLE_FAILED';
ALTER TYPE "DeviceConnectionEpisodeResolutionOutboxStatus" ADD VALUE 'DEAD_LETTER';

-- AlterTable
ALTER TABLE "device_connection_episode_resolution_outbox"
ADD COLUMN "processing_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_error_code" TEXT,
ADD COLUMN "last_error_at" TIMESTAMP(3),
ADD COLUMN "next_retry_at" TIMESTAMP(3),
ADD COLUMN "dead_lettered_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "device_connection_episode_resolution_outbox"
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "device_connection_episode_resolution_outbox_status_next_retry_at_idx"
ON "device_connection_episode_resolution_outbox"("status", "next_retry_at");
