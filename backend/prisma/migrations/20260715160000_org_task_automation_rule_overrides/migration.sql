-- Org-scoped overrides for canonical task automation catalog rules.

CREATE TYPE "TaskAutomationRuleOverrideChangeType" AS ENUM ('CREATE', 'UPDATE', 'RESET');

CREATE TABLE "org_task_automation_rule_overrides" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "enabled" BOOLEAN,
    "activation_offset_minutes" INTEGER,
    "due_offset_minutes" INTEGER,
    "priority" "TaskPriority",
    "assignment_strategy" TEXT,
    "assigned_user_id" TEXT,
    "assigned_role_key" TEXT,
    "station_scope" TEXT,
    "escalation_config" JSONB,
    "notification_config" JSONB,
    "checklist_overrides" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_task_automation_rule_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_task_automation_rule_override_revisions" (
    "id" TEXT NOT NULL,
    "override_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "override_version" INTEGER NOT NULL,
    "change_type" "TaskAutomationRuleOverrideChangeType" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_task_automation_rule_override_revisions_pkey" PRIMARY KEY ("id")
);

ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'TASK_AUTOMATION_RULE';

CREATE UNIQUE INDEX "org_task_automation_rule_overrides_organization_id_rule_id_key"
  ON "org_task_automation_rule_overrides"("organization_id", "rule_id");

CREATE INDEX "org_task_automation_rule_overrides_organization_id_idx"
  ON "org_task_automation_rule_overrides"("organization_id");

CREATE INDEX "org_task_automation_rule_override_revisions_organization_id_rule_id_idx"
  ON "org_task_automation_rule_override_revisions"("organization_id", "rule_id");

CREATE INDEX "org_task_automation_rule_override_revisions_override_id_created_at_idx"
  ON "org_task_automation_rule_override_revisions"("override_id", "created_at");

ALTER TABLE "org_task_automation_rule_overrides"
  ADD CONSTRAINT "org_task_automation_rule_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_task_automation_rule_overrides"
  ADD CONSTRAINT "org_task_automation_rule_overrides_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_task_automation_rule_overrides"
  ADD CONSTRAINT "org_task_automation_rule_overrides_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_task_automation_rule_override_revisions"
  ADD CONSTRAINT "org_task_automation_rule_override_revisions_override_id_fkey"
  FOREIGN KEY ("override_id") REFERENCES "org_task_automation_rule_overrides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_task_automation_rule_override_revisions"
  ADD CONSTRAINT "org_task_automation_rule_override_revisions_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
