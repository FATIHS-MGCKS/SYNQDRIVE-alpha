-- CI-R3B historical predecessor repair slot 15
-- after: 20260723240000_rental_rule_revisions_one_draft_per_scope
-- before: 20260724130000_dashboard_insight_calculation_meta

DO $$ BEGIN
    CREATE TYPE "InsightEntityScope" AS ENUM ('VEHICLE', 'STATION', 'VEHICLE_GROUP', 'FLEET');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "InsightSeverity" AS ENUM ('CRITICAL', 'WARNING', 'OPPORTUNITY', 'INFO');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "InsightType" AS ENUM ('TIGHT_HANDOVER', 'RETURN_NEEDS_INSPECTION', 'STATION_SHORTAGE', 'LOW_UTILIZATION', 'SERVICE_WINDOW', 'SERVICE_BEFORE_BOOKING', 'BATTERY_CRITICAL', 'TIRE_CRITICAL', 'BRAKE_CRITICAL', 'SERVICE_OVERDUE', 'PICKUP_OVERDUE', 'TUV_OVERDUE', 'BOKRAFT_OVERDUE', 'HM_SERVICE_NO_TRACKING', 'DRIVING_ASSESSMENT_DEVICE_QUALITY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "dashboard_insight_runs" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"trigger" TEXT NOT NULL,
"started_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
"finished_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"duration_ms" INTEGER,
"candidate_count" INTEGER NOT NULL DEFAULT 0,
"published_count" INTEGER NOT NULL DEFAULT 0,
"error_message" TEXT,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "dashboard_insight_runs_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "dashboard_insights" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"run_id" TEXT NOT NULL,
"type" "InsightType" NOT NULL,
"severity" "InsightSeverity" NOT NULL,
"priority" INTEGER NOT NULL DEFAULT 0,
"title" TEXT NOT NULL,
"message" TEXT NOT NULL,
"action_label" TEXT,
"action_type" TEXT,
"entity_scope" "InsightEntityScope" NOT NULL,
"entity_ids" JSONB,
"time_context" JSONB,
"metrics" JSONB,
"reasons" JSONB,
"confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"dedupe_key" TEXT NOT NULL,
"group_key" TEXT,
"is_grouped" BOOLEAN NOT NULL DEFAULT false,
"group_count" INTEGER NOT NULL DEFAULT 1,
"is_active" BOOLEAN NOT NULL DEFAULT true,
"expires_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "dashboard_insights_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_insight_runs_organization_id_fkey'
    ) THEN
        ALTER TABLE "dashboard_insight_runs"
            ADD CONSTRAINT "dashboard_insight_runs_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_insights_organization_id_fkey'
    ) THEN
        ALTER TABLE "dashboard_insights"
            ADD CONSTRAINT "dashboard_insights_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_insights_run_id_fkey'
    ) THEN
        ALTER TABLE "dashboard_insights"
            ADD CONSTRAINT "dashboard_insights_run_id_fkey"
            FOREIGN KEY ("run_id") REFERENCES "dashboard_insight_runs"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "dashboard_insight_runs_created_at_idx" ON "dashboard_insight_runs"("created_at");

CREATE INDEX IF NOT EXISTS "dashboard_insight_runs_organization_id_idx" ON "dashboard_insight_runs"("organization_id");

CREATE INDEX IF NOT EXISTS "dashboard_insights_dedupe_key_idx" ON "dashboard_insights"("dedupe_key");

CREATE INDEX IF NOT EXISTS "dashboard_insights_organization_id_is_active_idx" ON "dashboard_insights"("organization_id", "is_active");

CREATE INDEX IF NOT EXISTS "dashboard_insights_run_id_idx" ON "dashboard_insights"("run_id");

CREATE INDEX IF NOT EXISTS "dashboard_insights_type_idx" ON "dashboard_insights"("type");
