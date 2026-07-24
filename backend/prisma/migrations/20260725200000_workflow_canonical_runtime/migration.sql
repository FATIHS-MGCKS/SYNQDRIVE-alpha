-- Workflow canonical runtime (Phase 3 Prompt 10)
-- Additive only: new workflow_* tables alongside legacy org_workflow*.
-- Rollback: see docs/architecture/workflow-automation-data-model-2026-07.md §10 / §15

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "WorkflowDefinitionLifecycleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "WorkflowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED', 'INVALID');
CREATE TYPE "WorkflowScopeType" AS ENUM ('ORGANIZATION', 'STATION', 'VEHICLE');
CREATE TYPE "WorkflowScopeBindingType" AS ENUM ('STATION', 'VEHICLE');
CREATE TYPE "WorkflowConditionLogicOperator" AS ENUM ('AND', 'OR');
CREATE TYPE "WorkflowConditionOperator" AS ENUM (
  'EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GT', 'GTE', 'LT', 'LTE',
  'IS_TRUE', 'IS_FALSE', 'CONTAINS', 'STARTS_WITH'
);
CREATE TYPE "WorkflowActionCapabilityStatus" AS ENUM (
  'AVAILABLE', 'INTERNAL_ONLY', 'EXPERIMENTAL', 'DISABLED', 'UNSUPPORTED'
);
CREATE TYPE "WorkflowRuntimeRunStatus" AS ENUM (
  'PENDING', 'RUNNING', 'PAUSED', 'WAITING_APPROVAL', 'SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'
);
CREATE TYPE "WorkflowRuntimeActionRunStatus" AS ENUM (
  'PENDING', 'RUNNING', 'WAITING_APPROVAL', 'APPROVED_PENDING_EXECUTION',
  'SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'
);
CREATE TYPE "WorkflowRuntimeApprovalStatus" AS ENUM (
  'PENDING', 'APPROVED', 'APPROVED_PENDING_EXECUTION', 'REJECTED', 'EXPIRED', 'CANCELLED'
);
CREATE TYPE "WorkflowDeliveryChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'WEBHOOK', 'INTERNAL');
CREATE TYPE "WorkflowDeliveryStatus" AS ENUM (
  'PENDING', 'SUBMITTED', 'DELIVERED', 'FAILED', 'CANCELLED', 'DEAD_LETTER'
);
CREATE TYPE "WorkflowEventOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER');
CREATE TYPE "WorkflowTimerType" AS ENUM (
  'APPROVAL_EXPIRY', 'RESUME_DELAY', 'RETRY_BACKOFF', 'SCHEDULED_TRIGGER'
);
CREATE TYPE "WorkflowTimerStatus" AS ENUM ('SCHEDULED', 'CLAIMED', 'FIRED', 'CANCELLED');
CREATE TYPE "WorkflowRevisionType" AS ENUM (
  'DRAFT_SAVED', 'PUBLISHED', 'RETIRED', 'INVALIDATED', 'REMEDIATION_FLAGGED', 'RESTORED'
);
CREATE TYPE "WorkflowFeatureFlagScope" AS ENUM ('PLATFORM', 'ORGANIZATION', 'WORKFLOW_DEFINITION');
CREATE TYPE "WorkflowRolloutScopeType" AS ENUM ('STATION', 'VEHICLE', 'CATEGORY');

-- ─── Definition & version graph ───────────────────────────────────────────────

CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "lifecycle_status" "WorkflowDefinitionLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "draft_version_id" TEXT,
    "published_version_id" TEXT,
    "version_counter" INTEGER NOT NULL DEFAULT 0,
    "trigger_count" INTEGER NOT NULL DEFAULT 0,
    "last_triggered_at" TIMESTAMP(3),
    "remediation_required" BOOLEAN NOT NULL DEFAULT false,
    "remediation_reason" TEXT,
    "remediation_detected_at" TIMESTAMP(3),
    "legacy_org_workflow_id" TEXT,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_definition_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "content_hash" VARCHAR(64) NOT NULL,
    "definition_snapshot" JSONB,
    "supersedes_version_id" TEXT,
    "published_by_user_id" TEXT,
    "published_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "invalidated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_triggers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "legacy_trigger_key" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_scopes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "scope_type" "WorkflowScopeType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_scopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_scope_bindings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_scope_id" TEXT NOT NULL,
    "binding_type" "WorkflowScopeBindingType" NOT NULL,
    "binding_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_scope_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_condition_groups" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "parent_group_id" TEXT,
    "logic_operator" "WorkflowConditionLogicOperator" NOT NULL DEFAULT 'AND',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_condition_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_conditions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "condition_group_id" TEXT NOT NULL,
    "field_path" TEXT NOT NULL,
    "operator" "WorkflowConditionOperator" NOT NULL,
    "value_text" TEXT,
    "value_number" DOUBLE PRECISION,
    "value_boolean" BOOLEAN,
    "value_json" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_conditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_actions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "action_index" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "capability_status_at_publish" "WorkflowActionCapabilityStatus",
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_policy_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "capability_revision" TEXT NOT NULL,
    "approval_resume_supported" BOOLEAN NOT NULL DEFAULT false,
    "approval_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "policy_payload" JSONB NOT NULL DEFAULT '{}',
    "content_hash" VARCHAR(64) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_policy_snapshots_pkey" PRIMARY KEY ("id")
);

-- ─── Runtime tables ───────────────────────────────────────────────────────────

CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_definition_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "policy_snapshot_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "status" "WorkflowRuntimeRunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" TEXT,
    "input_payload" JSONB NOT NULL,
    "definition_snapshot" JSONB NOT NULL,
    "condition_result" JSONB,
    "error_message" TEXT,
    "triggered_by_user_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "last_resumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_action_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "workflow_definition_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "workflow_action_id" TEXT,
    "action_key" TEXT NOT NULL,
    "action_index" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "status" "WorkflowRuntimeActionRunStatus" NOT NULL DEFAULT 'PENDING',
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error_message" TEXT,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_action_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_approvals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "action_run_id" TEXT NOT NULL,
    "status" "WorkflowRuntimeApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_system" BOOLEAN NOT NULL DEFAULT true,
    "approver_role_scope" TEXT,
    "approved_by_user_id" TEXT,
    "decided_by_name" TEXT,
    "reason" TEXT,
    "requested_policy" JSONB,
    "expires_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_deliveries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action_run_id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "channel" "WorkflowDeliveryChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "WorkflowDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "external_reference" TEXT,
    "recipient_ref" TEXT,
    "notification_id" TEXT,
    "outbound_email_id" TEXT,
    "payload_ref" JSONB NOT NULL DEFAULT '{}',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "submitted_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_event_outbox" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_run_id" TEXT,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT,
    "aggregate_id" TEXT,
    "correlation_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WorkflowEventOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "dead_lettered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_timers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_run_id" TEXT,
    "action_run_id" TEXT,
    "approval_id" TEXT,
    "timer_type" "WorkflowTimerType" NOT NULL,
    "status" "WorkflowTimerStatus" NOT NULL DEFAULT 'SCHEDULED',
    "idempotency_key" TEXT NOT NULL,
    "fire_at" TIMESTAMP(3) NOT NULL,
    "fired_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_timers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_revisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_definition_id" TEXT NOT NULL,
    "workflow_version_id" TEXT,
    "revision_type" "WorkflowRevisionType" NOT NULL,
    "actor_user_id" TEXT,
    "business_audit_outbox_id" TEXT,
    "change_reason" TEXT,
    "before_hash" VARCHAR(64),
    "after_hash" VARCHAR(64),
    "diff_ref" TEXT,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_feature_flags" (
    "id" TEXT NOT NULL,
    "scope" "WorkflowFeatureFlagScope" NOT NULL,
    "organization_id" TEXT,
    "workflow_definition_id" TEXT,
    "flag_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_rollout_scopes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "feature_flag_id" TEXT NOT NULL,
    "scope_type" "WorkflowRolloutScopeType" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_rollout_scopes_pkey" PRIMARY KEY ("id")
);

-- ─── Uniques ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "workflow_definitions_draft_version_id_key" ON "workflow_definitions"("draft_version_id");
CREATE UNIQUE INDEX "workflow_definitions_published_version_id_key" ON "workflow_definitions"("published_version_id");
CREATE UNIQUE INDEX "workflow_definitions_legacy_org_workflow_id_key" ON "workflow_definitions"("legacy_org_workflow_id");
CREATE UNIQUE INDEX "workflow_versions_definition_version_key" ON "workflow_versions"("organization_id", "workflow_definition_id", "version_number");
CREATE UNIQUE INDEX "workflow_triggers_workflow_version_id_key" ON "workflow_triggers"("workflow_version_id");
CREATE UNIQUE INDEX "workflow_scopes_workflow_version_id_key" ON "workflow_scopes"("workflow_version_id");
CREATE UNIQUE INDEX "workflow_scope_bindings_scope_binding_key" ON "workflow_scope_bindings"("workflow_scope_id", "binding_type", "binding_id");
CREATE UNIQUE INDEX "workflow_conditions_group_sort_key" ON "workflow_conditions"("condition_group_id", "sort_order");
CREATE UNIQUE INDEX "workflow_actions_version_index_key" ON "workflow_actions"("workflow_version_id", "action_index");
CREATE UNIQUE INDEX "workflow_actions_version_action_key_key" ON "workflow_actions"("workflow_version_id", "action_key");
CREATE UNIQUE INDEX "workflow_policy_snapshots_org_hash_key" ON "workflow_policy_snapshots"("organization_id", "content_hash");
CREATE UNIQUE INDEX "workflow_runs_org_idempotency_key" ON "workflow_runs"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "workflow_action_runs_run_index_key" ON "workflow_action_runs"("workflow_run_id", "action_index");
CREATE UNIQUE INDEX "workflow_action_runs_org_idempotency_key" ON "workflow_action_runs"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "workflow_approvals_action_run_id_key" ON "workflow_approvals"("action_run_id");
CREATE UNIQUE INDEX "workflow_deliveries_org_idempotency_key" ON "workflow_deliveries"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "workflow_event_outbox_org_idempotency_key" ON "workflow_event_outbox"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "workflow_timers_approval_id_key" ON "workflow_timers"("approval_id");
CREATE UNIQUE INDEX "workflow_timers_org_idempotency_key" ON "workflow_timers"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "workflow_rollout_scopes_flag_scope_key" ON "workflow_rollout_scopes"("feature_flag_id", "scope_type", "scope_id");

-- Partial uniques (Prisma cannot express — enforced in SQL)
CREATE UNIQUE INDEX "workflow_definitions_org_slug_active_key"
  ON "workflow_definitions"("organization_id", "slug")
  WHERE "slug" IS NOT NULL AND "archived_at" IS NULL;

CREATE UNIQUE INDEX "workflow_condition_groups_one_root_per_version"
  ON "workflow_condition_groups"("workflow_version_id")
  WHERE "parent_group_id" IS NULL;

CREATE UNIQUE INDEX "workflow_feature_flags_platform_key"
  ON "workflow_feature_flags"("flag_key")
  WHERE "scope" = 'PLATFORM';

CREATE UNIQUE INDEX "workflow_feature_flags_org_key"
  ON "workflow_feature_flags"("organization_id", "flag_key")
  WHERE "scope" = 'ORGANIZATION' AND "organization_id" IS NOT NULL;

CREATE UNIQUE INDEX "workflow_feature_flags_definition_key"
  ON "workflow_feature_flags"("workflow_definition_id", "flag_key")
  WHERE "scope" = 'WORKFLOW_DEFINITION' AND "workflow_definition_id" IS NOT NULL;

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX "workflow_definitions_organization_id_idx" ON "workflow_definitions"("organization_id");
CREATE INDEX "workflow_definitions_org_lifecycle_idx" ON "workflow_definitions"("organization_id", "lifecycle_status");
CREATE INDEX "workflow_definitions_org_category_idx" ON "workflow_definitions"("organization_id", "category");

CREATE INDEX "workflow_versions_org_definition_status_idx" ON "workflow_versions"("organization_id", "workflow_definition_id", "status");
CREATE INDEX "workflow_versions_definition_version_number_idx" ON "workflow_versions"("workflow_definition_id", "version_number");
CREATE INDEX "workflow_versions_content_hash_idx" ON "workflow_versions"("content_hash");

CREATE INDEX "workflow_triggers_org_trigger_type_idx" ON "workflow_triggers"("organization_id", "trigger_type");

CREATE INDEX "workflow_scopes_org_scope_type_idx" ON "workflow_scopes"("organization_id", "scope_type");

CREATE INDEX "workflow_scope_bindings_org_binding_idx" ON "workflow_scope_bindings"("organization_id", "binding_type", "binding_id");

CREATE INDEX "workflow_condition_groups_version_idx" ON "workflow_condition_groups"("workflow_version_id");
CREATE INDEX "workflow_condition_groups_parent_idx" ON "workflow_condition_groups"("parent_group_id");

CREATE INDEX "workflow_conditions_org_field_operator_idx" ON "workflow_conditions"("organization_id", "field_path", "operator");

CREATE INDEX "workflow_actions_org_action_type_idx" ON "workflow_actions"("organization_id", "action_type");

CREATE INDEX "workflow_policy_snapshots_content_hash_idx" ON "workflow_policy_snapshots"("content_hash");

CREATE INDEX "workflow_runs_org_definition_created_idx" ON "workflow_runs"("organization_id", "workflow_definition_id", "created_at");
CREATE INDEX "workflow_runs_org_status_created_idx" ON "workflow_runs"("organization_id", "status", "created_at");
CREATE INDEX "workflow_runs_org_entity_idx" ON "workflow_runs"("organization_id", "entity_type", "entity_id");
CREATE INDEX "workflow_runs_version_idx" ON "workflow_runs"("workflow_version_id");
CREATE INDEX "workflow_runs_correlation_idx" ON "workflow_runs"("correlation_id");

CREATE INDEX "workflow_action_runs_org_status_idx" ON "workflow_action_runs"("organization_id", "status");
CREATE INDEX "workflow_action_runs_run_index_idx" ON "workflow_action_runs"("workflow_run_id", "action_index");
CREATE INDEX "workflow_action_runs_action_idx" ON "workflow_action_runs"("workflow_action_id");

CREATE INDEX "workflow_approvals_org_run_idx" ON "workflow_approvals"("organization_id", "workflow_run_id");
CREATE INDEX "workflow_approvals_org_status_expires_idx" ON "workflow_approvals"("organization_id", "status", "expires_at");

CREATE INDEX "workflow_approvals_pending_expiry_idx"
  ON "workflow_approvals"("organization_id", "expires_at")
  WHERE "status" = 'PENDING';

CREATE INDEX "workflow_deliveries_org_status_updated_idx" ON "workflow_deliveries"("organization_id", "status", "updated_at");
CREATE INDEX "workflow_deliveries_action_run_idx" ON "workflow_deliveries"("action_run_id");
CREATE INDEX "workflow_deliveries_external_ref_idx" ON "workflow_deliveries"("external_reference");

CREATE INDEX "workflow_event_outbox_status_available_idx" ON "workflow_event_outbox"("status", "available_at");
CREATE INDEX "workflow_event_outbox_org_event_created_idx" ON "workflow_event_outbox"("organization_id", "event_type", "created_at");
CREATE INDEX "workflow_event_outbox_correlation_idx" ON "workflow_event_outbox"("correlation_id");

CREATE INDEX "workflow_timers_status_fire_at_idx" ON "workflow_timers"("status", "fire_at");
CREATE INDEX "workflow_timers_org_run_idx" ON "workflow_timers"("organization_id", "workflow_run_id");

CREATE INDEX "workflow_revisions_org_definition_occurred_idx" ON "workflow_revisions"("organization_id", "workflow_definition_id", "occurred_at");
CREATE INDEX "workflow_revisions_correlation_idx" ON "workflow_revisions"("correlation_id");

CREATE INDEX "workflow_feature_flags_key_enabled_idx" ON "workflow_feature_flags"("flag_key", "enabled");
CREATE INDEX "workflow_feature_flags_org_key_idx" ON "workflow_feature_flags"("organization_id", "flag_key");

CREATE INDEX "workflow_rollout_scopes_org_scope_idx" ON "workflow_rollout_scopes"("organization_id", "scope_type", "scope_id");

-- ─── Foreign keys (no CASCADE on runtime/revision lineage) ───────────────────

ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_definition_id_fkey"
  FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_published_by_user_id_fkey"
  FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_supersedes_version_id_fkey"
  FOREIGN KEY ("supersedes_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_draft_version_id_fkey"
  FOREIGN KEY ("draft_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_published_version_id_fkey"
  FOREIGN KEY ("published_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_scopes" ADD CONSTRAINT "workflow_scopes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_scopes" ADD CONSTRAINT "workflow_scopes_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_scope_bindings" ADD CONSTRAINT "workflow_scope_bindings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_scope_bindings" ADD CONSTRAINT "workflow_scope_bindings_workflow_scope_id_fkey"
  FOREIGN KEY ("workflow_scope_id") REFERENCES "workflow_scopes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_condition_groups" ADD CONSTRAINT "workflow_condition_groups_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_condition_groups" ADD CONSTRAINT "workflow_condition_groups_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_condition_groups" ADD CONSTRAINT "workflow_condition_groups_parent_group_id_fkey"
  FOREIGN KEY ("parent_group_id") REFERENCES "workflow_condition_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_conditions" ADD CONSTRAINT "workflow_conditions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_conditions" ADD CONSTRAINT "workflow_conditions_condition_group_id_fkey"
  FOREIGN KEY ("condition_group_id") REFERENCES "workflow_condition_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_policy_snapshots" ADD CONSTRAINT "workflow_policy_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_definition_id_fkey"
  FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_policy_snapshot_id_fkey"
  FOREIGN KEY ("policy_snapshot_id") REFERENCES "workflow_policy_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_triggered_by_user_id_fkey"
  FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_action_runs" ADD CONSTRAINT "workflow_action_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_action_runs" ADD CONSTRAINT "workflow_action_runs_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_action_runs" ADD CONSTRAINT "workflow_action_runs_workflow_action_id_fkey"
  FOREIGN KEY ("workflow_action_id") REFERENCES "workflow_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_action_run_id_fkey"
  FOREIGN KEY ("action_run_id") REFERENCES "workflow_action_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_deliveries" ADD CONSTRAINT "workflow_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_deliveries" ADD CONSTRAINT "workflow_deliveries_action_run_id_fkey"
  FOREIGN KEY ("action_run_id") REFERENCES "workflow_action_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_deliveries" ADD CONSTRAINT "workflow_deliveries_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_event_outbox" ADD CONSTRAINT "workflow_event_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_event_outbox" ADD CONSTRAINT "workflow_event_outbox_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_timers" ADD CONSTRAINT "workflow_timers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_timers" ADD CONSTRAINT "workflow_timers_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_timers" ADD CONSTRAINT "workflow_timers_action_run_id_fkey"
  FOREIGN KEY ("action_run_id") REFERENCES "workflow_action_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_timers" ADD CONSTRAINT "workflow_timers_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "workflow_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_revisions" ADD CONSTRAINT "workflow_revisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_revisions" ADD CONSTRAINT "workflow_revisions_workflow_definition_id_fkey"
  FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_revisions" ADD CONSTRAINT "workflow_revisions_workflow_version_id_fkey"
  FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_revisions" ADD CONSTRAINT "workflow_revisions_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_revisions" ADD CONSTRAINT "workflow_revisions_business_audit_outbox_id_fkey"
  FOREIGN KEY ("business_audit_outbox_id") REFERENCES "business_audit_outbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_feature_flags" ADD CONSTRAINT "workflow_feature_flags_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_feature_flags" ADD CONSTRAINT "workflow_feature_flags_workflow_definition_id_fkey"
  FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_rollout_scopes" ADD CONSTRAINT "workflow_rollout_scopes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_rollout_scopes" ADD CONSTRAINT "workflow_rollout_scopes_feature_flag_id_fkey"
  FOREIGN KEY ("feature_flag_id") REFERENCES "workflow_feature_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
