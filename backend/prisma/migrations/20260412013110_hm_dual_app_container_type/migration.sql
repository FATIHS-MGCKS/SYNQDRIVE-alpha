-- HM Dual-App Split: additive migration for app_container_type separation
-- Safe: all new columns are nullable; existing rows get null (treated as HM_HEALTH_APP)

-- CreateEnum
CREATE TYPE "HmAppContainerType" AS ENUM ('HM_HEALTH_APP', 'HM_TELEMETRY_APP');

-- AlterTable: HighMobilityVehicle
ALTER TABLE "high_mobility_vehicles" ADD COLUMN "app_container_type" "HmAppContainerType";

-- AlterTable: HighMobilityStreamSyncLog
ALTER TABLE "high_mobility_stream_sync_logs" ADD COLUMN "app_container_type" "HmAppContainerType";

-- AlterTable: HighMobilityStreamConsumerState
ALTER TABLE "high_mobility_stream_consumer_states" ADD COLUMN "app_container_type" "HmAppContainerType";

-- Indexes
CREATE INDEX "high_mobility_vehicles_app_container_type_idx" ON "high_mobility_vehicles"("app_container_type");
CREATE INDEX "high_mobility_vehicles_vin_app_container_type_idx" ON "high_mobility_vehicles"("vin", "app_container_type");
CREATE INDEX "high_mobility_stream_sync_logs_app_container_type_idx" ON "high_mobility_stream_sync_logs"("app_container_type");
CREATE INDEX "high_mobility_stream_consumer_states_app_container_type_idx" ON "high_mobility_stream_consumer_states"("app_container_type");

-- Backfill: existing HEALTH package vehicles ? HM_HEALTH_APP, FULL_TELEMETRY ? HM_TELEMETRY_APP
UPDATE "high_mobility_vehicles"
SET "app_container_type" = 'HM_HEALTH_APP'
WHERE "app_container_type" IS NULL AND "package_type" = 'HEALTH';

UPDATE "high_mobility_vehicles"
SET "app_container_type" = 'HM_TELEMETRY_APP'
WHERE "app_container_type" IS NULL AND "package_type" = 'FULL_TELEMETRY';
