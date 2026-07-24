-- Prompt 16/54: persist typed entity references for grouped insight drill-down.
ALTER TABLE "dashboard_insights"
  ADD COLUMN IF NOT EXISTS "entity_references" JSONB;
