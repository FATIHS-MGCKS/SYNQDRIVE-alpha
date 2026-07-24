-- Workflow lifecycle: PUBLISHED + ARCHIVED states, audit fields, protect run history from cascade delete

ALTER TYPE "WorkflowStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';
ALTER TYPE "WorkflowStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "published_by_id" TEXT;
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "published_by_name" TEXT;
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "archived_by_id" TEXT;
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "archived_by_name" TEXT;
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "archive_reason" TEXT;

-- Workflows that were active or executed are considered published for audit purposes.
UPDATE "org_workflows"
SET "published_at" = COALESCE("last_triggered_at", "updated_at", "created_at")
WHERE "published_at" IS NULL
  AND (
    "status" IN ('ACTIVE', 'DISABLED', 'INVALID')
    OR "trigger_count" > 0
    OR "enabled" = true
  );

CREATE INDEX IF NOT EXISTS "org_workflows_organization_id_archived_at_idx"
  ON "org_workflows"("organization_id", "archived_at");

-- Prevent workflow hard-delete from cascading away audit run history.
ALTER TABLE "org_workflow_runs" DROP CONSTRAINT IF EXISTS "org_workflow_runs_workflow_id_fkey";
ALTER TABLE "org_workflow_runs"
  ADD CONSTRAINT "org_workflow_runs_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "org_workflows"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
