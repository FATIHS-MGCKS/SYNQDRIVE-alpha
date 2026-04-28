-- Add operational fields to stations so the Stations tab can be used
-- beyond a bare name + address. Covers contact, opening hours, manager
-- info and a Google Place identifier for idempotent autocomplete.

ALTER TABLE "stations"
  ADD COLUMN IF NOT EXISTS "postal_code"     TEXT,
  ADD COLUMN IF NOT EXISTS "phone"           TEXT,
  ADD COLUMN IF NOT EXISTS "email"           TEXT,
  ADD COLUMN IF NOT EXISTS "manager_name"    TEXT,
  ADD COLUMN IF NOT EXISTS "opening_hours"   TEXT,
  ADD COLUMN IF NOT EXISTS "notes"           TEXT,
  ADD COLUMN IF NOT EXISTS "google_place_id" TEXT;
