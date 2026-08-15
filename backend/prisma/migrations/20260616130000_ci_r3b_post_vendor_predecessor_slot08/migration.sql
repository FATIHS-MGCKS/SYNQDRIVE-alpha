-- CI-R3B historical predecessor repair slot 8
-- after: 20260616120000_station_operational_module
-- before: 20260616140000_workflow_automation_runtime

DO $$ BEGIN
    CREATE TYPE "WorkflowStatus" AS ENUM ('ACTIVE', 'DRAFT', 'DISABLED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "org_workflows" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"name" TEXT NOT NULL,
"description" TEXT,
"category" TEXT NOT NULL,
"trigger" JSONB NOT NULL,
"conditions" JSONB NOT NULL DEFAULT '[]'::jsonb,
"actions" JSONB NOT NULL,
"scope" JSONB NOT NULL DEFAULT '{"type":"organization"}'::jsonb,
"status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT'::"WorkflowStatus",
"created_by_id" TEXT,
"created_by_name" TEXT,
"updated_by_id" TEXT,
"updated_by_name" TEXT,
"last_triggered_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"trigger_count" INTEGER NOT NULL DEFAULT 0,
"is_template" BOOLEAN NOT NULL DEFAULT false,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "org_workflows_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "org_workflows_category_idx" ON "org_workflows"("category");

CREATE INDEX IF NOT EXISTS "org_workflows_organization_id_idx" ON "org_workflows"("organization_id");

CREATE INDEX IF NOT EXISTS "org_workflows_status_idx" ON "org_workflows"("status");
