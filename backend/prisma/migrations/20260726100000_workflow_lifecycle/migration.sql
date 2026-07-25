-- Workflow definition/version lifecycle (Phase 3 Prompt 11)

ALTER TYPE "WorkflowVersionStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "WorkflowVersionStatus" ADD VALUE IF NOT EXISTS 'DISABLED';
ALTER TYPE "WorkflowVersionStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TYPE "WorkflowRevisionType" ADD VALUE IF NOT EXISTS 'ACTIVATED';
ALTER TYPE "WorkflowRevisionType" ADD VALUE IF NOT EXISTS 'DEACTIVATED';
ALTER TYPE "WorkflowRevisionType" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "active_version_id" TEXT;
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "lock_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "workflow_versions" ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3);
ALTER TABLE "workflow_versions" ADD COLUMN IF NOT EXISTS "disabled_at" TIMESTAMP(3);
ALTER TABLE "workflow_versions" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_definitions_active_version_id_key"
  ON "workflow_definitions"("active_version_id");

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_versions_one_active_per_definition"
  ON "workflow_versions"("workflow_definition_id")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_active_version_id_fkey"
  FOREIGN KEY ("active_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
