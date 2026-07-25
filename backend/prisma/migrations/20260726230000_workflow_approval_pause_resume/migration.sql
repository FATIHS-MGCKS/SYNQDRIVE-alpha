-- Workflow approval pause-and-resume (Phase 5 Prompt 22)

CREATE TYPE "WorkflowApprovalRejectionStrategy" AS ENUM ('CANCEL_RUN', 'SKIP_ACTION', 'EXECUTE_FALLBACK');

ALTER TABLE "workflow_approvals" ADD COLUMN IF NOT EXISTS "workflow_version_id" TEXT;
ALTER TABLE "workflow_approvals" ADD COLUMN IF NOT EXISTS "requested_by_user_id" TEXT;
ALTER TABLE "workflow_approvals" ADD COLUMN IF NOT EXISTS "rejection_strategy" "WorkflowApprovalRejectionStrategy" NOT NULL DEFAULT 'CANCEL_RUN';
ALTER TABLE "workflow_approvals" ADD COLUMN IF NOT EXISTS "maker_checker_required" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workflow_approvals" ADD COLUMN IF NOT EXISTS "notification_prepared_at" TIMESTAMP(3);
ALTER TABLE "workflow_approvals" ADD COLUMN IF NOT EXISTS "legacy_org_workflow_approval_id" TEXT;

UPDATE "workflow_approvals" wa
SET "workflow_version_id" = wr."workflow_version_id"
FROM "workflow_runs" wr
WHERE wa."workflow_run_id" = wr."id" AND wa."workflow_version_id" IS NULL;

ALTER TABLE "workflow_approvals" ALTER COLUMN "workflow_version_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_approvals_legacy_org_workflow_approval_id_key"
  ON "workflow_approvals"("legacy_org_workflow_approval_id");

CREATE INDEX IF NOT EXISTS "workflow_approvals_workflow_version_id_idx"
  ON "workflow_approvals"("workflow_version_id");

ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "workflow_approval_comments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "approval_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_approval_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_approval_comments_org_approval_created_idx"
  ON "workflow_approval_comments"("organization_id", "approval_id", "created_at");

ALTER TABLE "workflow_approval_comments" ADD CONSTRAINT "workflow_approval_comments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_approval_comments" ADD CONSTRAINT "workflow_approval_comments_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "workflow_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
