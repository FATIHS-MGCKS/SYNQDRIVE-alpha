-- CreateEnum
CREATE TYPE "ChargingStationEnrichmentProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChargingStationEnrichmentResolutionStatus" AS ENUM ('MATCHED', 'AMBIGUOUS', 'NOT_FOUND', 'NO_COORDINATES', 'INCONSISTENT_COORDINATES', 'INVALID_COORDINATES', 'ERROR');

-- CreateEnum
CREATE TYPE "ChargingStationMatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "vehicle_energy_event_charging_station_enrichments" (
    "id" TEXT NOT NULL,
    "energy_event_id" TEXT NOT NULL,
    "processing_status" "ChargingStationEnrichmentProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "resolution_status" "ChargingStationEnrichmentResolutionStatus",
    "match_confidence" "ChargingStationMatchConfidence",
    "match_score" DOUBLE PRECISION,
    "osm_type" TEXT,
    "osm_id" TEXT,
    "station_name" TEXT,
    "brand" TEXT,
    "operator" TEXT,
    "network" TEXT,
    "address" TEXT,
    "station_latitude" DOUBLE PRECISION,
    "station_longitude" DOUBLE PRECISION,
    "geometry_distance_meters" DOUBLE PRECISION,
    "point_distance_meters" DOUBLE PRECISION,
    "access" TEXT,
    "fee" TEXT,
    "capacity" TEXT,
    "connectors" JSONB,
    "station_max_output_kw" DOUBLE PRECISION,
    "input_latitude" DOUBLE PRECISION,
    "input_longitude" DOUBLE PRECISION,
    "input_coordinate_source" TEXT,
    "input_coordinate_selector_version" TEXT,
    "input_fingerprint" TEXT,
    "resolver_version" TEXT,
    "osm_dataset_version" TEXT,
    "resolver_diagnostics" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_energy_event_charging_station_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_energy_event_charging_station_enrichments_energy_event_id_key" ON "vehicle_energy_event_charging_station_enrichments"("energy_event_id");

-- CreateIndex
CREATE INDEX "vehicle_energy_event_charging_station_enrichments_processing_status_idx" ON "vehicle_energy_event_charging_station_enrichments"("processing_status");

-- CreateIndex
CREATE INDEX "vehicle_energy_event_charging_station_enrichments_resolution_status_idx" ON "vehicle_energy_event_charging_station_enrichments"("resolution_status");

-- CreateIndex
CREATE INDEX "vehicle_energy_event_charging_station_enrichments_created_at_idx" ON "vehicle_energy_event_charging_station_enrichments"("created_at");

-- AddForeignKey
ALTER TABLE "vehicle_energy_event_charging_station_enrichments" ADD CONSTRAINT "vehicle_energy_event_charging_station_enrichments_energy_event_id_fkey" FOREIGN KEY ("energy_event_id") REFERENCES "vehicle_energy_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
