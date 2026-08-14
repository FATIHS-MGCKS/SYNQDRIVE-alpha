-- CI-R3B historical predecessor repair slot 1
-- after: 20260412020000_hm_latest_state_tables
-- before: 20260412030000_platform_hardening_phase1

DO $$ BEGIN
    CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "org_tasks" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"title" TEXT NOT NULL,
"description" TEXT,
"category" TEXT,
"status" "TaskStatus" NOT NULL DEFAULT 'OPEN'::"TaskStatus",
"priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM'::"TaskPriority",
"vehicle_id" TEXT,
"fine_id" TEXT,
"invoice_id" TEXT,
"assigned_to" TEXT,
"due_date" TIMESTAMP(3) WITHOUT TIME ZONE,
"completed_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "org_tasks_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "org_tasks_organization_id_idx" ON "org_tasks"("organization_id");

CREATE INDEX IF NOT EXISTS "org_tasks_status_idx" ON "org_tasks"("status");

CREATE INDEX IF NOT EXISTS "org_tasks_fine_id_idx" ON "org_tasks"("fine_id");

CREATE INDEX IF NOT EXISTS "org_tasks_invoice_id_idx" ON "org_tasks"("invoice_id");
