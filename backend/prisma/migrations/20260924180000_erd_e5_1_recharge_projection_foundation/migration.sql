-- ERD E5.1 — canonical VEE RECHARGE projection foundation (additive, no backfill).
-- Forward-only: nullable dimo_segment_id for telemetry-only projections; explicit HvChargeSession FK.

ALTER TYPE "VehicleEnergyEventDetectionSource" ADD VALUE IF NOT EXISTS 'SYNQDRIVE_ERD_RECHARGE_PROJECTION';

ALTER TABLE "vehicle_energy_events"
  ADD COLUMN "canonical_charge_session_id" TEXT;

ALTER TABLE "vehicle_energy_events"
  ALTER COLUMN "dimo_segment_id" DROP NOT NULL;

CREATE UNIQUE INDEX "vehicle_energy_events_canonical_charge_session_id_key"
  ON "vehicle_energy_events"("canonical_charge_session_id");

ALTER TABLE "vehicle_energy_events"
  ADD CONSTRAINT "vehicle_energy_events_canonical_charge_session_id_fkey"
  FOREIGN KEY ("canonical_charge_session_id")
  REFERENCES "hv_charge_sessions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "vehicle_energy_events"
  DROP CONSTRAINT IF EXISTS "vehicle_energy_events_source_identity_check";

ALTER TABLE "vehicle_energy_events"
  ADD CONSTRAINT "vehicle_energy_events_source_identity_check"
  CHECK (
    (
      "detection_source" IS NULL
      AND "source_event_key" IS NULL
      AND "dimo_segment_id" IS NOT NULL
    )
    OR
    (
      "detection_source" IS NOT NULL
      AND "detection_source" = 'DIMO_NATIVE'::"VehicleEnergyEventDetectionSource"
      AND "source_event_key" IS NULL
      AND "dimo_segment_id" IS NOT NULL
    )
    OR
    (
      "detection_source" IS NOT NULL
      AND "detection_source" = 'SYNQDRIVE_RAW_FUEL_FALLBACK'::"VehicleEnergyEventDetectionSource"
      AND "source_event_key" IS NOT NULL
      AND "dimo_segment_id" IS NOT NULL
    )
    OR
    (
      "detection_source" IS NOT NULL
      AND "detection_source" = 'SYNQDRIVE_ERD_RECHARGE_PROJECTION'::"VehicleEnergyEventDetectionSource"
      AND "source_event_key" IS NOT NULL
    )
  );
