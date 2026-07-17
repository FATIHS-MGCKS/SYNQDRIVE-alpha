-- Stations V2 Prompt 20: archive capabilities snapshot + lifecycle metadata for restore context
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "archived_capabilities_snapshot" JSONB;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "lifecycle_metadata" JSONB;
