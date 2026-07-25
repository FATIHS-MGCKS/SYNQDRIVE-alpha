-- Workflow maker-checker / four-eyes controls (V4.9.852)

ALTER TYPE "WorkflowStatus" ADD VALUE IF NOT EXISTS 'PENDING_ACTIVATION';

CREATE TYPE "WorkflowMakerCheckerOperation" AS ENUM (
  'WORKFLOW_PUBLISH_HIGH_CRITICAL',
  'WORKFLOW_ACTIVATE_EXTERNAL_AI',
  'WORKFLOW_APPROVE_AI_CALL',
  'WORKFLOW_BOOKING_CANCEL',
  'WORKFLOW_CUSTOMER_BLOCK',
  'WORKFLOW_PAYMENT_CHARGE',
  'WORKFLOW_SENSITIVE_POLICY_CHANGE',
  'WORKFLOW_SECRET_PROVIDER_CONFIG',
  'WORKFLOW_DEAD_LETTER_FORCE_REPLAY',
  'WORKFLOW_RUNTIME_ACTION'
);

CREATE TYPE "WorkflowChangeRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
  'CANCELLED'
);

ALTER TABLE "org_workflow_approvals"
  ADD COLUMN IF NOT EXISTS "requested_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "maker_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_editor_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "checker_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "operation_type" "WorkflowMakerCheckerOperation",
  ADD COLUMN IF NOT EXISTS "approved_workflow_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "approved_definition_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emergency_override" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emergency_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "decision_version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "org_workflow_approvals_expires_at_idx"
  ON "org_workflow_approvals"("expires_at");

CREATE TABLE IF NOT EXISTS "org_workflow_change_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "operation" "WorkflowMakerCheckerOperation" NOT NULL,
  "status" "WorkflowChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "maker_user_id" TEXT NOT NULL,
  "checker_user_id" TEXT,
  "maker_reason" TEXT NOT NULL,
  "checker_reason" TEXT,
  "proposed_definition" JSONB NOT NULL,
  "proposed_definition_hash" TEXT NOT NULL,
  "baseline_definition_hash" TEXT NOT NULL,
  "proposed_workflow_version" INTEGER NOT NULL,
  "proposed_status" "WorkflowStatus" NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "emergency_override" BOOLEAN NOT NULL DEFAULT false,
  "emergency_reason" TEXT,
  "decision_version" INTEGER NOT NULL DEFAULT 1,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "org_workflow_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "org_workflow_change_requests_organization_id_idx"
  ON "org_workflow_change_requests"("organization_id");
CREATE INDEX IF NOT EXISTS "org_workflow_change_requests_workflow_id_idx"
  ON "org_workflow_change_requests"("workflow_id");
CREATE INDEX IF NOT EXISTS "org_workflow_change_requests_organization_id_workflow_id_status_idx"
  ON "org_workflow_change_requests"("organization_id", "workflow_id", "status");
CREATE INDEX IF NOT EXISTS "org_workflow_change_requests_status_idx"
  ON "org_workflow_change_requests"("status");
CREATE INDEX IF NOT EXISTS "org_workflow_change_requests_expires_at_idx"
  ON "org_workflow_change_requests"("expires_at");

ALTER TABLE "org_workflow_change_requests"
  ADD CONSTRAINT "org_workflow_change_requests_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "org_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
