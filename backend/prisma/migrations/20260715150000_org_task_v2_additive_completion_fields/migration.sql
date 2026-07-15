-- Task Domain V2 — additive OrgTask completion/lifecycle columns.
-- Additive only: no drops, no renames, no enum value changes on existing types.
-- Legacy rows remain readable with NULL in all new nullable columns.

CREATE TYPE "TaskCompletionMode" AS ENUM (
  'MANUAL',
  'AUTO_RESOLVED',
  'SUPERSEDED'
);

ALTER TABLE "org_tasks"
  ADD COLUMN "activates_at" TIMESTAMP(3),
  ADD COLUMN "completion_mode" "TaskCompletionMode",
  ADD COLUMN "resolution_code" TEXT,
  ADD COLUMN "completed_by_user_id" TEXT,
  ADD COLUMN "superseded_by_task_id" TEXT,
  ADD COLUMN "estimated_duration_minutes" INTEGER;

ALTER TABLE "org_tasks"
  ADD CONSTRAINT "org_tasks_superseded_by_task_id_fkey"
  FOREIGN KEY ("superseded_by_task_id") REFERENCES "org_tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "org_tasks_organization_id_status_activates_at_idx"
  ON "org_tasks"("organization_id", "status", "activates_at");

CREATE INDEX "org_tasks_completion_mode_idx"
  ON "org_tasks"("completion_mode");

CREATE INDEX "org_tasks_superseded_by_task_id_idx"
  ON "org_tasks"("superseded_by_task_id");
