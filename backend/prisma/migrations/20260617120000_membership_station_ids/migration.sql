-- Add multi-station scope support on organization memberships (backward-compatible with station_scope string).
ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "station_ids" JSONB;
