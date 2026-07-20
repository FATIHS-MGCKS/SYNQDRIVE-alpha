-- CreateEnum
CREATE TYPE "DeviceConnectionWebhookProcessingStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'PROCESSED', 'IGNORED_BY_POLICY', 'RETRYABLE_FAILED', 'PERMANENTLY_FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "DeviceConnectionWebhookVehicleMappingStatus" AS ENUM ('PENDING', 'RESOLVED', 'UNKNOWN_VEHICLE');

-- CreateEnum
CREATE TYPE "DeviceConnectionWebhookBindingMappingStatus" AS ENUM ('PENDING', 'RESOLVED', 'UNKNOWN_BINDING');

-- CreateTable
CREATE TABLE "device_connection_webhook_inbox" (
    "id" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "event_type" "DimoDeviceConnectionEventType" NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processing_status" "DeviceConnectionWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processing_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "dead_lettered_at" TIMESTAMP(3),
    "vehicle_mapping_status" "DeviceConnectionWebhookVehicleMappingStatus" NOT NULL DEFAULT 'PENDING',
    "binding_mapping_status" "DeviceConnectionWebhookBindingMappingStatus" NOT NULL DEFAULT 'PENDING',
    "payload_hash" TEXT NOT NULL,
    "policy_ignore_reason" TEXT,
    "organization_id" TEXT,
    "vehicle_id" TEXT,
    "token_id" INTEGER NOT NULL,
    "domain_event_id" TEXT,
    "raw_payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_connection_webhook_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_connection_webhook_inbox_provider_provider_event_id_key" ON "device_connection_webhook_inbox"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_processing_status_next_retry__idx" ON "device_connection_webhook_inbox"("processing_status", "next_retry_at");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_organization_id_idx" ON "device_connection_webhook_inbox"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_vehicle_id_idx" ON "device_connection_webhook_inbox"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_received_at_idx" ON "device_connection_webhook_inbox"("received_at");
