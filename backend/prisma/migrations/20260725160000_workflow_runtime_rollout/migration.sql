-- Workflow Runtime controlled rollout — stages, channel flags, kill switches, maker-checker.

CREATE TYPE "WorkflowRuntimeRolloutStage" AS ENUM (
  'DISABLED',
  'SHADOW',
  'INTERNAL_ACTIONS_ONLY',
  'SELECTED_WORKFLOWS',
  'SELECTED_ORGANIZATIONS',
  'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL',
  'GENERAL_AVAILABILITY'
);

ALTER TYPE "WorkflowMakerCheckerOperation" ADD VALUE IF NOT EXISTS 'WORKFLOW_ROLLOUT_STAGE_PROMOTION';
ALTER TYPE "WorkflowAuditEventType" ADD VALUE IF NOT EXISTS 'WORKFLOW_ROLLOUT_STAGE_CHANGED';
ALTER TYPE "WorkflowAuditEventType" ADD VALUE IF NOT EXISTS 'WORKFLOW_KILL_SWITCH_TOGGLED';

CREATE TABLE IF NOT EXISTS "org_workflow_runtime_rollout_settings" (
  "organization_id" TEXT NOT NULL,
  "stage" "WorkflowRuntimeRolloutStage" NOT NULL DEFAULT 'DISABLED',
  "workflow_allowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "kill_switch_enabled" BOOLEAN NOT NULL DEFAULT false,
  "kill_switch_email" BOOLEAN NOT NULL DEFAULT false,
  "kill_switch_whatsapp" BOOLEAN NOT NULL DEFAULT false,
  "kill_switch_sms" BOOLEAN NOT NULL DEFAULT false,
  "kill_switch_voice" BOOLEAN NOT NULL DEFAULT false,
  "kill_switch_ai" BOOLEAN NOT NULL DEFAULT false,
  "kill_switch_critical" BOOLEAN NOT NULL DEFAULT false,
  "channel_email_enabled" BOOLEAN NOT NULL DEFAULT false,
  "channel_whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
  "channel_sms_enabled" BOOLEAN NOT NULL DEFAULT false,
  "channel_voice_enabled" BOOLEAN NOT NULL DEFAULT false,
  "channel_ai_enabled" BOOLEAN NOT NULL DEFAULT false,
  "critical_actions_enabled" BOOLEAN NOT NULL DEFAULT false,
  "monitoring_acknowledged" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "org_workflow_runtime_rollout_settings_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE IF NOT EXISTS "workflow_runtime_rollout_change_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "requested_stage" "WorkflowRuntimeRolloutStage" NOT NULL,
  "previous_stage" "WorkflowRuntimeRolloutStage" NOT NULL,
  "status" "WorkflowChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requested_by_user_id" TEXT,
  "requested_by_name" TEXT,
  "decided_by_user_id" TEXT,
  "decided_by_name" TEXT,
  "decided_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_runtime_rollout_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_runtime_rollout_change_requests_organization_id_status_idx"
  ON "workflow_runtime_rollout_change_requests"("organization_id", "status");

CREATE INDEX IF NOT EXISTS "workflow_runtime_rollout_change_requests_expires_at_idx"
  ON "workflow_runtime_rollout_change_requests"("expires_at");

ALTER TABLE "workflow_runtime_rollout_change_requests"
  ADD CONSTRAINT "workflow_runtime_rollout_change_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "org_workflow_runtime_rollout_settings"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
