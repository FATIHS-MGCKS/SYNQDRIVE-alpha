-- Workflow action error strategies (Phase 5 Prompt 24)

CREATE TYPE "WorkflowActionErrorStrategy" AS ENUM (
  'STOP_WORKFLOW',
  'CONTINUE',
  'SKIP_ACTION',
  'REQUEST_APPROVAL',
  'EXECUTE_FALLBACK',
  'RETRY',
  'MARK_PARTIAL',
  'COMPENSATE_PREVIOUS'
);

ALTER TYPE "WorkflowRuntimeRunStatus" ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_FALLBACK';

ALTER TABLE "workflow_actions" ADD COLUMN IF NOT EXISTS "error_strategy" "WorkflowActionErrorStrategy" NOT NULL DEFAULT 'STOP_WORKFLOW';
ALTER TABLE "workflow_actions" ADD COLUMN IF NOT EXISTS "fallback_action_key" TEXT;
ALTER TABLE "workflow_actions" ADD COLUMN IF NOT EXISTS "compensate_action_key" TEXT;
ALTER TABLE "workflow_actions" ADD COLUMN IF NOT EXISTS "compensatable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "error_strategy" "WorkflowActionErrorStrategy" NOT NULL DEFAULT 'STOP_WORKFLOW';
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "fallback_action_key" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "compensate_action_key" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "compensatable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "applied_error_strategy" "WorkflowActionErrorStrategy";
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "parent_action_run_id" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "is_fallback_run" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "fallback_depth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "partial_failure" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "workflow_action_runs_parent_action_run_id_idx"
  ON "workflow_action_runs"("parent_action_run_id");

ALTER TABLE "workflow_action_runs" ADD CONSTRAINT "workflow_action_runs_parent_action_run_id_fkey"
  FOREIGN KEY ("parent_action_run_id") REFERENCES "workflow_action_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
