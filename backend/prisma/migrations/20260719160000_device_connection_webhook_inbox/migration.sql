-- CreateEnum
CREATE TYPE "DeviceConnectionWebhookInboxStatus" AS ENUM (
  'RECEIVED',
  'VALIDATED',
  'PROCESSED',
  'IGNORED_BY_POLICY',
  'RETRYABLE_FAILED',
  'PERMANENTLY_FAILED',
  'DEAD_LETTER'
);

-- CreateEnum
CREATE TYPE "DeviceConnectionWebhookMappingStatus" AS ENUM (
  'UNKNOWN',
  'MAPPED',
  'UNMAPPED_VEHICLE',
  'UNMAPPED_BINDING',
  'PARSE_FAILED'
);

-- CreateTable
CREATE TABLE "device_connection_webhook_inbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "vehicle_id" TEXT,
  "token_id" INTEGER,
  "provider" TEXT NOT NULL DEFAULT 'DIMO',
  "provider_event_id" TEXT NOT NULL,
  "event_type" "DimoDeviceConnectionEventType",
  "raw_payload_hash" TEXT NOT NULL,
  "redacted_payload_json" JSONB NOT NULL,
  "observed_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "processing_status" "DeviceConnectionWebhookInboxStatus" NOT NULL DEFAULT 'RECEIVED',
  "processing_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "next_retry_at" TIMESTAMP(3),
  "vehicle_mapping_status" "DeviceConnectionWebhookMappingStatus" NOT NULL DEFAULT 'UNKNOWN',
  "binding_mapping_status" "DeviceConnectionWebhookMappingStatus" NOT NULL DEFAULT 'UNKNOWN',
  "policy_ignore_reason" TEXT,
  "connection_event_id" TEXT,
  "dedup_bucket" BIGINT,
  "device_binding_id" TEXT,
  "provider_device_id_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "device_connection_webhook_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_connection_webhook_inbox_provider_provider_event_id_key"
  ON "device_connection_webhook_inbox"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_organization_id_received_at_idx"
  ON "device_connection_webhook_inbox"("organization_id", "received_at");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_processing_status_next_retry_at_idx"
  ON "device_connection_webhook_inbox"("processing_status", "next_retry_at");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_vehicle_id_observed_at_idx"
  ON "device_connection_webhook_inbox"("vehicle_id", "observed_at");

-- CreateIndex
CREATE INDEX "device_connection_webhook_inbox_raw_payload_hash_idx"
  ON "device_connection_webhook_inbox"("raw_payload_hash");

-- AddForeignKey
ALTER TABLE "device_connection_webhook_inbox"
  ADD CONSTRAINT "device_connection_webhook_inbox_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
