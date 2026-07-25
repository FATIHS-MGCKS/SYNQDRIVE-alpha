-- Durable workflow timers: occurrenceId for replace/cancel semantics
ALTER TABLE "workflow_timers" ADD COLUMN IF NOT EXISTS "occurrence_id" TEXT;
CREATE INDEX IF NOT EXISTS "workflow_timers_organization_id_occurrence_id_idx"
  ON "workflow_timers" ("organization_id", "occurrence_id");
