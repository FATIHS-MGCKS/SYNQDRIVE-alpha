-- Workflow automation audit trail + AI transparency (Phase 9 P43)

ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'WORKFLOW';

CREATE TYPE "WorkflowAuditEventType" AS ENUM (
  'WORKFLOW_CREATED',
  'WORKFLOW_DRAFT_CHANGED',
  'WORKFLOW_PUBLISHED',
  'WORKFLOW_ACTIVATED',
  'WORKFLOW_DEACTIVATED',
  'WORKFLOW_ARCHIVED',
  'WORKFLOW_DRY_RUN',
  'WORKFLOW_EXTERNAL_TEST',
  'WORKFLOW_RUN_STARTED',
  'WORKFLOW_CONDITION_EVALUATED',
  'WORKFLOW_ACTION_STARTED',
  'WORKFLOW_ACTION_SUCCEEDED',
  'WORKFLOW_ACTION_RETRY',
  'WORKFLOW_ERROR',
  'WORKFLOW_APPROVAL_REQUESTED',
  'WORKFLOW_APPROVAL_APPROVED',
  'WORKFLOW_APPROVAL_REJECTED',
  'WORKFLOW_APPROVAL_EXPIRED',
  'WORKFLOW_RUN_ABORTED',
  'WORKFLOW_DEAD_LETTER',
  'WORKFLOW_REPLAY',
  'WORKFLOW_POLICY_BLOCKED',
  'WORKFLOW_RECIPIENT_RESOLVED',
  'WORKFLOW_PROVIDER_STATUS'
);

CREATE TYPE "WorkflowAuditRetentionClass" AS ENUM (
  'TECHNICAL_LOG',
  'REVISION_AUDIT',
  'GOVERNANCE_AUDIT'
);

CREATE TABLE "org_workflow_audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "workflow_id" TEXT,
  "workflow_run_id" TEXT,
  "action_run_id" TEXT,
  "event_type" "WorkflowAuditEventType" NOT NULL,
  "retention_class" "WorkflowAuditRetentionClass" NOT NULL,
  "actor_user_id" TEXT,
  "correlation_id" TEXT,
  "summary" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "payload_hash" TEXT,
  "ai_transparency" JSONB,
  "legal_hold" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_workflow_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "org_workflow_audit_events_organization_id_created_at_idx"
  ON "org_workflow_audit_events"("organization_id", "created_at");
CREATE INDEX "org_workflow_audit_events_organization_id_workflow_id_idx"
  ON "org_workflow_audit_events"("organization_id", "workflow_id");
CREATE INDEX "org_workflow_audit_events_organization_id_event_type_idx"
  ON "org_workflow_audit_events"("organization_id", "event_type");
CREATE INDEX "org_workflow_audit_events_workflow_run_id_idx"
  ON "org_workflow_audit_events"("workflow_run_id");
CREATE INDEX "org_workflow_audit_events_retention_class_idx"
  ON "org_workflow_audit_events"("retention_class");

ALTER TABLE "org_workflow_audit_events"
  ADD CONSTRAINT "org_workflow_audit_events_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "org_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
