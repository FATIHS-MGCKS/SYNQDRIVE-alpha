-- Prompt 6/54: calculation provenance metadata for dashboard insights (nullable — legacy rows stay null).

ALTER TABLE "dashboard_insight_runs"
  ADD COLUMN IF NOT EXISTS "calculation_meta" JSONB;

ALTER TABLE "dashboard_insights"
  ADD COLUMN IF NOT EXISTS "calculation_meta" JSONB;
