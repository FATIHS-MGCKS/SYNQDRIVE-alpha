-- Notification-task provenance columns (Prompt 25)

ALTER TABLE "org_tasks"
  ADD COLUMN IF NOT EXISTS "notification_id" TEXT,
  ADD COLUMN IF NOT EXISTS "workflow_run_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_event_type" TEXT;

CREATE INDEX IF NOT EXISTS "org_tasks_organization_id_notification_id_idx"
  ON "org_tasks"("organization_id", "notification_id");

CREATE INDEX IF NOT EXISTS "org_tasks_organization_id_workflow_run_id_idx"
  ON "org_tasks"("organization_id", "workflow_run_id");
