-- Battery V2 retention aggregates (pre-raw-delete rollups)

CREATE TYPE "BatteryRetentionAggregateBucket" AS ENUM ('SESSION', 'DAILY');

CREATE TABLE "battery_retention_aggregates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "scope" "BatteryEvidenceScope" NOT NULL,
    "bucket_type" "BatteryRetentionAggregateBucket" NOT NULL,
    "bucket_key" TEXT NOT NULL,
    "bucket_start_at" TIMESTAMP(3) NOT NULL,
    "bucket_end_at" TIMESTAMP(3),
    "summary" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "battery_retention_aggregates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battery_retention_aggregates_bucket_key" ON "battery_retention_aggregates"("vehicle_id", "bucket_type", "bucket_key");

CREATE INDEX "battery_retention_aggregates_organization_id_bucket_start_at_idx" ON "battery_retention_aggregates"("organization_id", "bucket_start_at" DESC);

CREATE INDEX "battery_retention_aggregates_vehicle_id_bucket_type_bucket_start__idx" ON "battery_retention_aggregates"("vehicle_id", "bucket_type", "bucket_start_at" DESC);

ALTER TABLE "battery_retention_aggregates" ADD CONSTRAINT "battery_retention_aggregates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_retention_aggregates" ADD CONSTRAINT "battery_retention_aggregates_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
