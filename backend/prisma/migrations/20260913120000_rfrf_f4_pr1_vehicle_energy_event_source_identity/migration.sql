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

-- Canonical source-identity pairings (SQL-only; Prisma schema documents intent).
-- Legacy/native: both NULL. Explicit native: DIMO_NATIVE + NULL key. Fallback: non-NULL key required.
ALTER TABLE "vehicle_energy_events"
  ADD CONSTRAINT "vehicle_energy_events_source_identity_check"
  CHECK (
    (
      "detection_source" IS NULL
      AND "source_event_key" IS NULL
    )
    OR
    (
      "detection_source" IS NOT NULL
      AND "detection_source" = 'DIMO_NATIVE'::"VehicleEnergyEventDetectionSource"
      AND "source_event_key" IS NULL
    )
    OR
    (
      "detection_source" IS NOT NULL
      AND "detection_source" = 'SYNQDRIVE_RAW_FUEL_FALLBACK'::"VehicleEnergyEventDetectionSource"
      AND "source_event_key" IS NOT NULL
    )
  );
