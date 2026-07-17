-- Additive Voice AI usage, event, tool, and audit models (Prompt 2B).
-- Rollback: DROP tables/enums in reverse dependency order.

CREATE TYPE "VoiceProviderWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');
CREATE TYPE "VoiceUsageEventType" AS ENUM (
  'CONVERSATION_MINUTE',
  'INBOUND_CALL',
  'OUTBOUND_CALL',
  'NUMBER_RENTAL',
  'AGENT_SESSION',
  'ADJUSTMENT'
);
CREATE TYPE "VoiceUsageCostStatus" AS ENUM ('ESTIMATED', 'FINAL');
CREATE TYPE "VoiceBillingPeriodStatus" AS ENUM ('OPEN', 'FINALIZED', 'INVOICED');
CREATE TYPE "VoiceBudgetOverflowBehavior" AS ENUM ('WARN', 'HARD_STOP', 'ALLOW_OVERAGE');
CREATE TYPE "VoiceToolRiskClass" AS ENUM (
  'READ_ONLY',
  'CONFIRMATION_REQUIRED',
  'STAFF_APPROVAL_REQUIRED',
  'PROHIBITED'
);
CREATE TYPE "VoiceToolExecutionStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'DENIED',
  'CANCELLED'
);
CREATE TYPE "VoiceApprovalConfirmationType" AS ENUM ('CUSTOMER', 'STAFF');
CREATE TYPE "VoiceApprovalRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
);
CREATE TYPE "VoiceTestRunStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED');

CREATE TABLE "voice_provider_webhook_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "provider" "VoiceControlPlaneProvider" NOT NULL,
  "external_event_id" TEXT NOT NULL,
  "event_type" TEXT,
  "payload_hash" TEXT NOT NULL,
  "redacted_payload" JSONB NOT NULL,
  "status" "VoiceProviderWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_provider_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_usage_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "voice_conversation_id" TEXT,
  "provider" "VoiceControlPlaneProvider" NOT NULL,
  "event_type" "VoiceUsageEventType" NOT NULL,
  "billable_seconds" INTEGER,
  "billable_minutes" INTEGER,
  "provider_cost_cents" INTEGER,
  "internal_cost_cents" INTEGER,
  "customer_price_cents" INTEGER,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "external_usage_ref" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "cost_status" "VoiceUsageCostStatus" NOT NULL DEFAULT 'ESTIMATED',
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_billing_periods" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "included_minutes" INTEGER NOT NULL DEFAULT 0,
  "consumed_minutes" INTEGER NOT NULL DEFAULT 0,
  "overage_minutes" INTEGER NOT NULL DEFAULT 0,
  "provider_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "revenue_cents" INTEGER NOT NULL DEFAULT 0,
  "margin_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "status" "VoiceBillingPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "finalized_at" TIMESTAMP(3),
  "invoiced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_billing_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_budget_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "monthly_budget_cents" INTEGER,
  "daily_limit_cents" INTEGER,
  "max_conversation_duration_seconds" INTEGER,
  "max_concurrent_calls" INTEGER,
  "allowed_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "warn_threshold_pct" INTEGER,
  "hard_limit_threshold_pct" INTEGER,
  "overflow_behavior" "VoiceBudgetOverflowBehavior" NOT NULL DEFAULT 'WARN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_budget_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_tool_executions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "voice_conversation_id" TEXT NOT NULL,
  "tool_name" TEXT NOT NULL,
  "risk_class" "VoiceToolRiskClass" NOT NULL,
  "request_hash" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" "VoiceToolExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "redacted_input" JSONB,
  "redacted_output" JSONB,
  "duration_ms" INTEGER,
  "error_code" TEXT,
  "error_message" TEXT,
  "audit_user_id" TEXT,
  "audit_agent_ref" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_tool_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_approval_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "tool_execution_id" TEXT NOT NULL,
  "confirmation_type" "VoiceApprovalConfirmationType" NOT NULL,
  "status" "VoiceApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3),
  "decided_by_user_id" TEXT,
  "decision_reason" TEXT,
  "protected_decision_token_ref" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_test_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agent_deployment_id" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "status" "VoiceTestRunStatus" NOT NULL DEFAULT 'PENDING',
  "assertions" JSONB NOT NULL DEFAULT '[]',
  "redacted_result" JSONB,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_test_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_provider_webhook_events_provider_external_event_id_key"
  ON "voice_provider_webhook_events"("provider", "external_event_id");
CREATE INDEX "voice_provider_webhook_events_organization_id_received_at_idx"
  ON "voice_provider_webhook_events"("organization_id", "received_at");
CREATE INDEX "voice_provider_webhook_events_status_received_at_idx"
  ON "voice_provider_webhook_events"("status", "received_at");
CREATE INDEX "voice_provider_webhook_events_provider_event_type_idx"
  ON "voice_provider_webhook_events"("provider", "event_type");

CREATE UNIQUE INDEX "voice_usage_events_organization_id_idempotency_key_key"
  ON "voice_usage_events"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "voice_usage_events_provider_external_usage_ref_key"
  ON "voice_usage_events"("provider", "external_usage_ref");
CREATE INDEX "voice_usage_events_organization_id_occurred_at_idx"
  ON "voice_usage_events"("organization_id", "occurred_at");
CREATE INDEX "voice_usage_events_voice_conversation_id_idx"
  ON "voice_usage_events"("voice_conversation_id");
CREATE INDEX "voice_usage_events_organization_id_cost_status_idx"
  ON "voice_usage_events"("organization_id", "cost_status");

CREATE UNIQUE INDEX "voice_billing_periods_organization_id_period_start_period_end_key"
  ON "voice_billing_periods"("organization_id", "period_start", "period_end");
CREATE INDEX "voice_billing_periods_organization_id_status_idx"
  ON "voice_billing_periods"("organization_id", "status");
CREATE INDEX "voice_billing_periods_period_end_idx" ON "voice_billing_periods"("period_end");

CREATE UNIQUE INDEX "voice_budget_policies_organization_id_key"
  ON "voice_budget_policies"("organization_id");

CREATE UNIQUE INDEX "voice_tool_executions_organization_id_idempotency_key_key"
  ON "voice_tool_executions"("organization_id", "idempotency_key");
CREATE INDEX "voice_tool_executions_organization_id_voice_conversation_id_idx"
  ON "voice_tool_executions"("organization_id", "voice_conversation_id");
CREATE INDEX "voice_tool_executions_voice_conversation_id_tool_name_idx"
  ON "voice_tool_executions"("voice_conversation_id", "tool_name");
CREATE INDEX "voice_tool_executions_organization_id_status_idx"
  ON "voice_tool_executions"("organization_id", "status");

CREATE INDEX "voice_approval_requests_organization_id_status_idx"
  ON "voice_approval_requests"("organization_id", "status");
CREATE INDEX "voice_approval_requests_tool_execution_id_idx"
  ON "voice_approval_requests"("tool_execution_id");
CREATE INDEX "voice_approval_requests_expires_at_idx" ON "voice_approval_requests"("expires_at");

CREATE INDEX "voice_test_runs_organization_id_status_idx"
  ON "voice_test_runs"("organization_id", "status");
CREATE INDEX "voice_test_runs_agent_deployment_id_created_at_idx"
  ON "voice_test_runs"("agent_deployment_id", "created_at");

ALTER TABLE "voice_provider_webhook_events"
  ADD CONSTRAINT "voice_provider_webhook_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_usage_events"
  ADD CONSTRAINT "voice_usage_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_usage_events"
  ADD CONSTRAINT "voice_usage_events_voice_conversation_id_fkey"
  FOREIGN KEY ("voice_conversation_id") REFERENCES "voice_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_billing_periods"
  ADD CONSTRAINT "voice_billing_periods_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_budget_policies"
  ADD CONSTRAINT "voice_budget_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_tool_executions"
  ADD CONSTRAINT "voice_tool_executions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_tool_executions"
  ADD CONSTRAINT "voice_tool_executions_voice_conversation_id_fkey"
  FOREIGN KEY ("voice_conversation_id") REFERENCES "voice_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_approval_requests"
  ADD CONSTRAINT "voice_approval_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_approval_requests"
  ADD CONSTRAINT "voice_approval_requests_tool_execution_id_fkey"
  FOREIGN KEY ("tool_execution_id") REFERENCES "voice_tool_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_test_runs"
  ADD CONSTRAINT "voice_test_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_test_runs"
  ADD CONSTRAINT "voice_test_runs_agent_deployment_id_fkey"
  FOREIGN KEY ("agent_deployment_id") REFERENCES "voice_agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
