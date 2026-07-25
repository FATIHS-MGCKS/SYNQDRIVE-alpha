ALTER TABLE "org_workflows"
  ADD COLUMN IF NOT EXISTS "system_metadata" JSONB;

CREATE INDEX IF NOT EXISTS "org_workflows_system_metadata_catalog_key_idx"
  ON "org_workflows" ((system_metadata->>'catalogKey'))
  WHERE "is_template" = true AND "category" = 'task_automation_system';

CREATE TYPE "TaskAutomationWorkflowMigrationStatus" AS ENUM (
  'MIGRATED',
  'ALREADY_MIGRATED',
  'SKIPPED_CUSTOMIZED',
  'REQUIRES_REMEDIATION',
  'FAILED'
);

CREATE TYPE "TaskAutomationWorkflowMigrationMode" AS ENUM (
  'DRY_RUN',
  'EXECUTE'
);

CREATE TABLE "task_automation_workflow_migration_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "mode" "TaskAutomationWorkflowMigrationMode" NOT NULL,
  "stats" JSONB NOT NULL,
  "details" JSONB NOT NULL DEFAULT '[]',
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_automation_workflow_migration_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_automation_workflow_migration_records" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "legacy_rule_id" TEXT NOT NULL,
  "catalog_key" TEXT,
  "workflow_id" TEXT,
  "status" "TaskAutomationWorkflowMigrationStatus" NOT NULL,
  "override_snapshot" JSONB,
  "remediation_reason" TEXT,
  "rollback_workflow_version" INTEGER,
  "migration_run_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "task_automation_workflow_migration_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_automation_workflow_migration_records_org_legacy_key"
  ON "task_automation_workflow_migration_records"("organization_id", "legacy_rule_id");

CREATE INDEX "task_automation_workflow_migration_records_org_idx"
  ON "task_automation_workflow_migration_records"("organization_id");

CREATE INDEX "task_automation_workflow_migration_records_run_idx"
  ON "task_automation_workflow_migration_records"("migration_run_id");

CREATE INDEX "task_automation_workflow_migration_runs_org_idx"
  ON "task_automation_workflow_migration_runs"("organization_id");

ALTER TABLE "task_automation_workflow_migration_records"
  ADD CONSTRAINT "task_automation_workflow_migration_records_run_fkey"
  FOREIGN KEY ("migration_run_id") REFERENCES "task_automation_workflow_migration_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
