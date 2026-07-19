-- CreateTable
CREATE TABLE "device_connection_telemetry_recovery_observations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "snapshot_reference_id" TEXT NOT NULL,
    "provider_observed_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "has_operational_signal" BOOLEAN NOT NULL,
    "connection_status_active" BOOLEAN NOT NULL,
    "provider_binding_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_connection_telemetry_recovery_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_connection_telemetry_recovery_observations_organization_idx" ON "device_connection_telemetry_recovery_observations"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_telemetry_recovery_observations_vehicle_id_idx" ON "device_connection_telemetry_recovery_observations"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_telemetry_recovery_observations_episode_id_pro_idx" ON "device_connection_telemetry_recovery_observations"("episode_id", "provider_observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "dce_telemetry_recovery_episode_snapshot_key" ON "device_connection_telemetry_recovery_observations"("episode_id", "snapshot_reference_id");

-- AddForeignKey
ALTER TABLE "device_connection_telemetry_recovery_observations" ADD CONSTRAINT "device_connection_telemetry_recovery_observations_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "device_connection_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
