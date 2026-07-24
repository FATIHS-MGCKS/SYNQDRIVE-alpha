-- Prompt 15/54: support priority-ordered analytics list queries on active insights.
CREATE INDEX IF NOT EXISTS "dashboard_insights_organization_id_is_active_priority_idx"
  ON "dashboard_insights" ("organization_id", "is_active", "priority" DESC);
