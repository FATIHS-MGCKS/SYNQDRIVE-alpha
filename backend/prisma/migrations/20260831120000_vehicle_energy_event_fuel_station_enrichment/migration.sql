-- CreateEnum
CREATE TYPE "FuelStationEnrichmentProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FuelStationEnrichmentResolutionStatus" AS ENUM ('MATCHED', 'AMBIGUOUS', 'NOT_FOUND', 'NO_COORDINATES', 'INVALID_COORDINATES', 'ERROR');

-- CreateEnum
CREATE TYPE "FuelStationMatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "vehicle_energy_event_fuel_station_enrichments" (
    "id" TEXT NOT NULL,
    "energy_event_id" TEXT NOT NULL,
    "processing_status" "FuelStationEnrichmentProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "resolution_status" "FuelStationEnrichmentResolutionStatus",
    "match_confidence" "FuelStationMatchConfidence",
    "match_score" DOUBLE PRECISION,
    "osm_type" TEXT,
    "osm_id" TEXT,
    "station_name" TEXT,
    "brand" TEXT,
    "operator" TEXT,
    "address" TEXT,
    "station_latitude" DOUBLE PRECISION,
    "station_longitude" DOUBLE PRECISION,
    "distance_meters" DOUBLE PRECISION,
    "input_latitude" DOUBLE PRECISION,
    "input_longitude" DOUBLE PRECISION,
    "input_coordinate_source" TEXT,
    "input_fingerprint" TEXT,
    "resolver_version" TEXT,
    "osm_dataset_version" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_energy_event_fuel_station_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_energy_event_fuel_station_enrichments_energy_event_id_key" ON "vehicle_energy_event_fuel_station_enrichments"("energy_event_id");

-- CreateIndex
CREATE INDEX "vehicle_energy_event_fuel_station_enrichments_processing_status_idx" ON "vehicle_energy_event_fuel_station_enrichments"("processing_status");

-- CreateIndex
CREATE INDEX "vehicle_energy_event_fuel_station_enrichments_resolution_status_idx" ON "vehicle_energy_event_fuel_station_enrichments"("resolution_status");

-- CreateIndex
CREATE INDEX "vehicle_energy_event_fuel_station_enrichments_created_at_idx" ON "vehicle_energy_event_fuel_station_enrichments"("created_at");

-- AddForeignKey
ALTER TABLE "vehicle_energy_event_fuel_station_enrichments" ADD CONSTRAINT "vehicle_energy_event_fuel_station_enrichments_energy_event_id_fkey" FOREIGN KEY ("energy_event_id") REFERENCES "vehicle_energy_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
