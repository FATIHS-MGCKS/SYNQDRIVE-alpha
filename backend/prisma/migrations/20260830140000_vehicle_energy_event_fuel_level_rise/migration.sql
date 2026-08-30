-- Additive REFUEL observation fields (P1.3-S5).
-- duration_seconds retains DIMO detection-envelope semantics.

ALTER TABLE "vehicle_energy_events"
  ADD COLUMN "fuel_level_rise_start" TIMESTAMP(3),
  ADD COLUMN "fuel_level_rise_end" TIMESTAMP(3),
  ADD COLUMN "fuel_level_rise_duration_seconds" INTEGER;
