-- Workflow approval interim safeguards

ALTER TYPE "WorkflowApprovalStatus" ADD VALUE IF NOT EXISTS 'APPROVED_PENDING_EXECUTION';
ALTER TYPE "WorkflowActionRunStatus" ADD VALUE IF NOT EXISTS 'APPROVED_PENDING_EXECUTION';

ALTER TABLE "org_workflow_approvals" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "org_workflow_approvals" ADD COLUMN IF NOT EXISTS "decided_by_name" TEXT;

CREATE INDEX IF NOT EXISTS "org_workflow_approvals_organization_id_expires_at_idx"
  ON "org_workflow_approvals"("organization_id", "expires_at");

-- Legacy approvals that were marked APPROVED without resume should be visible as pending execution.
UPDATE "org_workflow_approvals" a
SET "status" = 'APPROVED_PENDING_EXECUTION'
FROM "org_workflow_action_runs" ar
WHERE a."action_run_id" = ar."id"
  AND a."status" = 'APPROVED'
  AND ar."status" = 'SUCCESS'
  AND (ar."output"::text LIKE '%executedAfterApproval%false%' OR ar."output"::text LIKE '%executedAfterApproval": false%');

UPDATE "org_workflow_action_runs" ar
SET "status" = 'APPROVED_PENDING_EXECUTION',
    "finished_at" = NULL
FROM "org_workflow_approvals" a
WHERE a."action_run_id" = ar."id"
  AND ar."status" = 'SUCCESS'
  AND a."status" = 'APPROVED_PENDING_EXECUTION'
  AND (ar."output"::text LIKE '%executedAfterApproval%false%' OR ar."output"::text LIKE '%executedAfterApproval": false%');
