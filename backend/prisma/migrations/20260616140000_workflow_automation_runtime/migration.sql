-- Workflow automation runtime: enabled/version on definitions + run/action/approval tables

-- WorkflowStatus: INVALID
ALTER TYPE "WorkflowStatus" ADD VALUE IF NOT EXISTS 'INVALID';

-- OrgWorkflow columns
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "org_workflows" SET "enabled" = true WHERE "status" = 'ACTIVE' AND "enabled" = false;

CREATE INDEX IF NOT EXISTS "org_workflows_organization_id_status_idx" ON "org_workflows"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "org_workflows_organization_id_enabled_idx" ON "org_workflows"("organization_id", "enabled");

-- Run / action / approval enums
CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED', 'WAITING_APPROVAL');
CREATE TYPE "WorkflowActionRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED', 'WAITING_APPROVAL');
CREATE TYPE "WorkflowApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

CREATE TABLE "org_workflow_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_version" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "input_payload" JSONB NOT NULL,
    "condition_result" JSONB,
    "error_message" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_workflow_action_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "action_index" INTEGER NOT NULL,
    "status" "WorkflowActionRunStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error_message" TEXT,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_workflow_action_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_workflow_approvals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "action_run_id" TEXT NOT NULL,
    "status" "WorkflowApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_system" BOOLEAN NOT NULL DEFAULT true,
    "approved_by_user_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    CONSTRAINT "org_workflow_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_workflow_runs_organization_id_idempotency_key_key" ON "org_workflow_runs"("organization_id", "idempotency_key");
CREATE INDEX "org_workflow_runs_organization_id_idx" ON "org_workflow_runs"("organization_id");
CREATE INDEX "org_workflow_runs_workflow_id_idx" ON "org_workflow_runs"("workflow_id");
CREATE INDEX "org_workflow_runs_organization_id_workflow_id_idx" ON "org_workflow_runs"("organization_id", "workflow_id");
CREATE INDEX "org_workflow_runs_status_idx" ON "org_workflow_runs"("status");
CREATE INDEX "org_workflow_runs_created_at_idx" ON "org_workflow_runs"("created_at");

CREATE INDEX "org_workflow_action_runs_organization_id_idx" ON "org_workflow_action_runs"("organization_id");
CREATE INDEX "org_workflow_action_runs_workflow_run_id_idx" ON "org_workflow_action_runs"("workflow_run_id");
CREATE INDEX "org_workflow_action_runs_workflow_id_idx" ON "org_workflow_action_runs"("workflow_id");
CREATE INDEX "org_workflow_action_runs_status_idx" ON "org_workflow_action_runs"("status");

CREATE INDEX "org_workflow_approvals_organization_id_idx" ON "org_workflow_approvals"("organization_id");
CREATE INDEX "org_workflow_approvals_workflow_run_id_idx" ON "org_workflow_approvals"("workflow_run_id");
CREATE INDEX "org_workflow_approvals_action_run_id_idx" ON "org_workflow_approvals"("action_run_id");
CREATE INDEX "org_workflow_approvals_status_idx" ON "org_workflow_approvals"("status");

ALTER TABLE "org_workflow_runs" ADD CONSTRAINT "org_workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "org_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_workflow_action_runs" ADD CONSTRAINT "org_workflow_action_runs_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "org_workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_workflow_approvals" ADD CONSTRAINT "org_workflow_approvals_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "org_workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
