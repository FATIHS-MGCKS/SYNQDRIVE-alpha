-- Task Domain V2 — assignee + status list queries (Operator/Rental filters).
CREATE INDEX IF NOT EXISTS "org_tasks_organization_id_assigned_to_status_idx"
  ON "org_tasks" ("organization_id", "assigned_to", "status");
