-- CreateEnum
CREATE TYPE "DataAuthorizationRevocationWorkflowStatus" AS ENUM (
  'REVOCATION_REQUESTED',
  'DENY_SWITCH_ACTIVE',
  'INGESTION_STOPPED',
  'PROVIDER_ACCESS_REVOKE_PENDING',
  'PROVIDER_ACCESS_REVOKED',
  'QUEUES_CANCELLED',
  'DOWNSTREAM_NOTIFICATION_PENDING',
  'DOWNSTREAM_NOTIFIED',
  'RETENTION_DECISION_PENDING',
  'RETENTION_DECIDED',
  'DELETION_SCHEDULED',
  'VERIFICATION_PENDING',
  'REVOCATION_COMPLETE',
  'REVOCATION_FAILED'
);

-- CreateEnum
CREATE TYPE "DataAuthorizationRevocationTriggerType" AS ENUM (
  'PROCESSING_ACTIVITY_REVOKED',
  'ENFORCEMENT_POLICY_REVOKED',
  'LEGACY_ORG_AUTH_REVOKED',
  'CONSENT_WITHDRAWN',
  'PROVIDER_GRANT_REVOKED',
  'DATA_SHARING_REVOKED'
);

-- CreateTable
CREATE TABLE "data_authorization_revocation_workflows" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "trigger_type" "DataAuthorizationRevocationTriggerType" NOT NULL,
  "status" "DataAuthorizationRevocationWorkflowStatus" NOT NULL DEFAULT 'REVOCATION_REQUESTED',
  "correlation_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "reason" TEXT,
  "processing_activity_id" TEXT,
  "enforcement_policy_id" TEXT,
  "consent_id" TEXT,
  "provider_grant_id" TEXT,
  "data_sharing_auth_id" TEXT,
  "legacy_org_auth_id" TEXT,
  "data_categories" JSONB NOT NULL,
  "purposes" JSONB NOT NULL,
  "vehicle_ids" JSONB,
  "completed_steps" JSONB NOT NULL DEFAULT '[]',
  "step_errors" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 8,
  "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deny_switch_activated_at" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  "dead_lettered_at" TIMESTAMP(3),
  "retention_decision" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "data_authorization_revocation_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_authorization_revocation_step_events" (
  "id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "step_key" TEXT NOT NULL,
  "from_status" "DataAuthorizationRevocationWorkflowStatus",
  "to_status" "DataAuthorizationRevocationWorkflowStatus" NOT NULL,
  "outcome" TEXT NOT NULL,
  "error_message" TEXT,
  "correlation_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "data_authorization_revocation_step_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_authorization_revocation_workflows_idempotency_key_key"
  ON "data_authorization_revocation_workflows"("idempotency_key");

-- CreateIndex
CREATE INDEX "data_authorization_revocation_workflows_organization_id_idx"
  ON "data_authorization_revocation_workflows"("organization_id");

-- CreateIndex
CREATE INDEX "data_authorization_revocation_workflows_status_next_retry_at_idx"
  ON "data_authorization_revocation_workflows"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "data_authorization_revocation_workflows_organization_id_corre_idx"
  ON "data_authorization_revocation_workflows"("organization_id", "correlation_id");

-- CreateIndex
CREATE INDEX "data_authorization_revocation_step_events_workflow_id_idx"
  ON "data_authorization_revocation_step_events"("workflow_id");

-- CreateIndex
CREATE INDEX "data_authorization_revocation_step_events_organization_id_c_idx"
  ON "data_authorization_revocation_step_events"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "data_authorization_revocation_workflows"
  ADD CONSTRAINT "data_authorization_revocation_workflows_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_authorization_revocation_step_events"
  ADD CONSTRAINT "data_authorization_revocation_step_events_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "data_authorization_revocation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
