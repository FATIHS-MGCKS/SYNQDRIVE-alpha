-- Add a configurable geofence radius (in meters) to each station so that
-- the rental app can mark a vehicle as "at home" when its current GPS fix
-- is within `radius_meters` of the station's lat/lng. Existing rows get
-- a sensible default of 150m — typical small parking-lot footprint —
-- so the home-detection logic activates immediately without operator
-- intervention. Operators can tune per-station via the edit modal.

ALTER TABLE "stations"
  ADD COLUMN IF NOT EXISTS "radius_meters" INTEGER DEFAULT 150;
