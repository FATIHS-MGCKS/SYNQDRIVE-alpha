-- RFRF F4-PR1 — additive VehicleEnergyEvent source identity substrate.
-- Forward-only: no backfill, no table rewrite, no production mutation in this PR.
-- PostgreSQL NULL semantics: multiple legacy rows with source_event_key NULL remain valid.

CREATE TYPE "VehicleEnergyEventDetectionSource" AS ENUM (
  'DIMO_NATIVE',
  'SYNQDRIVE_RAW_FUEL_FALLBACK'
);

ALTER TABLE "vehicle_energy_events"
  ADD COLUMN "detection_source" "VehicleEnergyEventDetectionSource",
  ADD COLUMN "source_event_key" VARCHAR(512);

CREATE INDEX "vehicle_energy_events_detection_source_idx"
  ON "vehicle_energy_events"("detection_source");

CREATE UNIQUE INDEX "vehicle_energy_events_vehicle_id_source_event_key_key"
  ON "vehicle_energy_events"("vehicle_id", "source_event_key");
