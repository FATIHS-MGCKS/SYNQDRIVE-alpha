-- Workflow run / action run runtime status foundation (Phase 3 Prompt 12)

ALTER TYPE "WorkflowRuntimeRunStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE "WorkflowRuntimeRunStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_APPROVAL';
ALTER TYPE "WorkflowRuntimeRunStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "WorkflowRuntimeRunStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_COMPLETED';

ALTER TYPE "WorkflowRuntimeActionRunStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE "WorkflowRuntimeActionRunStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_APPROVAL';
ALTER TYPE "WorkflowRuntimeActionRunStatus" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
ALTER TYPE "WorkflowRuntimeActionRunStatus" ADD VALUE IF NOT EXISTS 'FAILED_RETRYABLE';
ALTER TYPE "WorkflowRuntimeActionRunStatus" ADD VALUE IF NOT EXISTS 'FAILED_PERMANENT';

CREATE TYPE "WorkflowRuntimeStatusEntityType" AS ENUM ('RUN', 'ACTION_RUN');
CREATE TYPE "WorkflowRuntimeStatusActorType" AS ENUM ('USER', 'SYSTEM', 'WORKER');

ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "lock_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "waiting_until" TIMESTAMP(3);
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "approval_id" TEXT;

ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "lock_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "waiting_until" TIMESTAMP(3);
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "approval_id" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_runs_approval_id_key" ON "workflow_runs"("approval_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_action_runs_approval_id_key" ON "workflow_action_runs"("approval_id");

CREATE TABLE IF NOT EXISTS "workflow_runtime_status_transitions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_type" "WorkflowRuntimeStatusEntityType" NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "action_run_id" TEXT,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "actor_type" "WorkflowRuntimeStatusActorType" NOT NULL,
    "actor_id" TEXT,
    "actor_source" TEXT NOT NULL,
    "reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "workflow_runtime_status_transitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_runtime_status_transitions_org_run_occurred_idx"
  ON "workflow_runtime_status_transitions"("organization_id", "workflow_run_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "workflow_runtime_status_transitions_org_action_occurred_idx"
  ON "workflow_runtime_status_transitions"("organization_id", "action_run_id", "occurred_at");

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "workflow_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_action_runs" ADD CONSTRAINT "workflow_action_runs_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "workflow_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_runtime_status_transitions" ADD CONSTRAINT "workflow_runtime_status_transitions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runtime_status_transitions" ADD CONSTRAINT "workflow_runtime_status_transitions_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_runtime_status_transitions" ADD CONSTRAINT "workflow_runtime_status_transitions_action_run_id_fkey"
  FOREIGN KEY ("action_run_id") REFERENCES "workflow_action_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
