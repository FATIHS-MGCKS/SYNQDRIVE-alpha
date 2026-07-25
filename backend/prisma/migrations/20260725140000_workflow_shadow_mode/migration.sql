-- Workflow Runtime shadow mode — separate evaluation storage + legacy comparison.

ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "shadow_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "WorkflowShadowRunStatus" AS ENUM (
  'PLANNED',
  'SKIPPED_SCOPE',
  'SKIPPED_CONDITIONS',
  'POLICY_BLOCKED',
  'ERROR'
);

CREATE TABLE IF NOT EXISTS "org_workflow_shadow_settings" (
  "organization_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "legacy_compare_enabled" BOOLEAN NOT NULL DEFAULT true,
  "retention_days" INTEGER NOT NULL DEFAULT 30,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "org_workflow_shadow_settings_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE IF NOT EXISTS "org_workflow_shadow_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "workflow_version" INTEGER NOT NULL,
  "event_type" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "event_idempotency_key" TEXT NOT NULL,
  "status" "WorkflowShadowRunStatus" NOT NULL,
  "would_trigger" BOOLEAN NOT NULL DEFAULT false,
  "would_create_approvals" BOOLEAN NOT NULL DEFAULT false,
  "planned_action_count" INTEGER NOT NULL DEFAULT 0,
  "policy_blocker_count" INTEGER NOT NULL DEFAULT 0,
  "execution_plan" JSONB NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_workflow_shadow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "org_workflow_shadow_comparisons" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "shadow_run_id" TEXT NOT NULL,
  "catalog_key" TEXT,
  "legacy_rule_id" TEXT,
  "dedup_key" TEXT,
  "legacy_task_id" TEXT,
  "workflow_would_trigger" BOOLEAN NOT NULL DEFAULT false,
  "legacy_did_execute" BOOLEAN NOT NULL DEFAULT false,
  "has_deviation" BOOLEAN NOT NULL DEFAULT false,
  "deviation_reasons" JSONB NOT NULL DEFAULT '[]',
  "comparison" JSONB NOT NULL DEFAULT '{}',
  "trigger_at_delta_ms" INTEGER,
  "due_at_delta_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_workflow_shadow_comparisons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_workflow_shadow_runs_organization_id_event_idempotency_key_workflow_id_key"
  ON "org_workflow_shadow_runs"("organization_id", "event_idempotency_key", "workflow_id");

CREATE INDEX IF NOT EXISTS "org_workflow_shadow_runs_organization_id_created_at_idx"
  ON "org_workflow_shadow_runs"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "org_workflow_shadow_runs_organization_id_would_trigger_idx"
  ON "org_workflow_shadow_runs"("organization_id", "would_trigger");

CREATE INDEX IF NOT EXISTS "org_workflow_shadow_runs_expires_at_idx"
  ON "org_workflow_shadow_runs"("expires_at");

CREATE INDEX IF NOT EXISTS "org_workflow_shadow_comparisons_organization_id_has_deviation_idx"
  ON "org_workflow_shadow_comparisons"("organization_id", "has_deviation");

CREATE INDEX IF NOT EXISTS "org_workflow_shadow_comparisons_organization_id_created_at_idx"
  ON "org_workflow_shadow_comparisons"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "org_workflow_shadow_comparisons_shadow_run_id_idx"
  ON "org_workflow_shadow_comparisons"("shadow_run_id");

ALTER TABLE "org_workflow_shadow_comparisons"
  ADD CONSTRAINT "org_workflow_shadow_comparisons_shadow_run_id_fkey"
  FOREIGN KEY ("shadow_run_id") REFERENCES "org_workflow_shadow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
