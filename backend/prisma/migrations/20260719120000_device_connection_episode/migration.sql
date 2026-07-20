-- CreateEnum
CREATE TYPE "DeviceConnectionEpisodeStatus" AS ENUM ('OPEN', 'RESOLVED', 'SUPERSEDED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "DeviceConnectionEpisodeOpenedReason" AS ENUM ('OBD_DEVICE_UNPLUGGED_WEBHOOK', 'MANUAL', 'DATA_RECONCILIATION');

-- CreateEnum
CREATE TYPE "DeviceConnectionEpisodeResolutionMethod" AS ENUM ('EXPLICIT_PLUG_WEBHOOK', 'SNAPSHOT_PLUG_SIGNAL', 'TELEMETRY_RESUMED', 'DEVICE_BINDING_CHANGED', 'MANUAL_REVIEW', 'DATA_RECONCILIATION');

-- CreateTable
CREATE TABLE "device_connection_episodes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "device_binding_id" TEXT,
    "provider_device_id_hash" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "opened_by_event_id" TEXT,
    "opened_reason" "DeviceConnectionEpisodeOpenedReason" NOT NULL,
    "status" "DeviceConnectionEpisodeStatus" NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution_method" "DeviceConnectionEpisodeResolutionMethod",
    "resolution_evidence_at" TIMESTAMP(3),
    "resolution_event_id" TEXT,
    "resolution_snapshot_id" TEXT,
    "state_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_connection_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_connection_episodes_organization_id_idx" ON "device_connection_episodes"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_episodes_vehicle_id_idx" ON "device_connection_episodes"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_episodes_provider_idx" ON "device_connection_episodes"("provider");

-- CreateIndex
CREATE INDEX "device_connection_episodes_device_binding_id_idx" ON "device_connection_episodes"("device_binding_id");

-- CreateIndex
CREATE INDEX "device_connection_episodes_status_idx" ON "device_connection_episodes"("status");

-- CreateIndex
CREATE INDEX "device_connection_episodes_opened_at_idx" ON "device_connection_episodes"("opened_at");

-- CreateIndex
CREATE INDEX "device_connection_episodes_vehicle_id_provider_status_idx" ON "device_connection_episodes"("vehicle_id", "provider", "status");

-- At most one OPEN episode per org + vehicle + provider + binding scope
CREATE UNIQUE INDEX "device_connection_episodes_one_open_per_binding"
ON "device_connection_episodes" (
  "organization_id",
  "vehicle_id",
  "provider",
  COALESCE("device_binding_id", '__none__')
)
WHERE "status" = 'OPEN';

-- AddForeignKey
ALTER TABLE "device_connection_episodes" ADD CONSTRAINT "device_connection_episodes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_connection_episodes" ADD CONSTRAINT "device_connection_episodes_opened_by_event_id_fkey" FOREIGN KEY ("opened_by_event_id") REFERENCES "dimo_device_connection_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_connection_episodes" ADD CONSTRAINT "device_connection_episodes_resolution_event_id_fkey" FOREIGN KEY ("resolution_event_id") REFERENCES "dimo_device_connection_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
