-- CreateEnum
CREATE TYPE "DimoDeviceConnectionEventType" AS ENUM ('OBD_DEVICE_UNPLUGGED', 'OBD_DEVICE_PLUGGED_IN');

-- CreateTable
CREATE TABLE "dimo_device_connection_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "token_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "event_type" "DimoDeviceConnectionEventType" NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "dedup_bucket" BIGINT NOT NULL,
    "raw_payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dimo_device_connection_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dimo_device_connection_events_provider_vehicle_id_event_type_dedup_bucket_key" ON "dimo_device_connection_events"("provider", "vehicle_id", "event_type", "dedup_bucket");

-- CreateIndex
CREATE INDEX "dimo_device_connection_events_vehicle_id_idx" ON "dimo_device_connection_events"("vehicle_id");

-- CreateIndex
CREATE INDEX "dimo_device_connection_events_organization_id_idx" ON "dimo_device_connection_events"("organization_id");

-- CreateIndex
CREATE INDEX "dimo_device_connection_events_observed_at_idx" ON "dimo_device_connection_events"("observed_at");

-- CreateIndex
CREATE INDEX "dimo_device_connection_events_event_type_idx" ON "dimo_device_connection_events"("event_type");

-- AddForeignKey
ALTER TABLE "dimo_device_connection_events" ADD CONSTRAINT "dimo_device_connection_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
