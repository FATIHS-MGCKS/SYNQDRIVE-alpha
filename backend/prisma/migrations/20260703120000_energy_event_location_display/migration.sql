-- Add persisted location display fields for refuel/recharge timeline cards.
ALTER TABLE "vehicle_energy_events"
  ADD COLUMN IF NOT EXISTS "location_display_name" TEXT,
  ADD COLUMN IF NOT EXISTS "location_source" TEXT,
  ADD COLUMN IF NOT EXISTS "location_confidence" TEXT;
