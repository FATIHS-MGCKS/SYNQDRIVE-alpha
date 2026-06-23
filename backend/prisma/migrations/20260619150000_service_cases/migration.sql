-- V4.9.49 — Canonical ServiceCase model (optional task grouping; no task backfill).

CREATE TYPE "ServiceCaseCategory" AS ENUM (
  'SERVICE',
  'REPAIR',
  'INSPECTION',
  'TUV_HU',
  'TIRES',
  'BRAKES',
  'BATTERY',
  'DAMAGE',
  'DIAGNOSTIC'
);

CREATE TYPE "ServiceCaseStatus" AS ENUM (
  'OPEN',
  'SCHEDULED',
  'IN_PROGRESS',
  'WAITING_VENDOR',
  'WAITING_PARTS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "ServiceCaseSource" AS ENUM (
  'MANUAL',
  'HEALTH',
  'DTC',
  'DAMAGE',
  'BOOKING',
  'DOCUMENT',
  'SERVICE_COMPLIANCE'
);

CREATE TABLE "service_cases" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "vendor_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" "ServiceCaseCategory" NOT NULL,
  "status" "ServiceCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  "source" "ServiceCaseSource" NOT NULL DEFAULT 'MANUAL',
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduled_at" TIMESTAMP(3),
  "expected_ready_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "estimated_cost_cents" INTEGER,
  "actual_cost_cents" INTEGER,
  "downtime_start" TIMESTAMP(3),
  "downtime_end" TIMESTAMP(3),
  "blocks_rental" BOOLEAN NOT NULL DEFAULT false,
  "completion_notes" TEXT,
  "document_id" TEXT,
  "metadata" JSONB,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_case_comments" (
  "id" TEXT NOT NULL,
  "service_case_id" TEXT NOT NULL,
  "user_id" TEXT,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_case_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_case_attachments" (
  "id" TEXT NOT NULL,
  "service_case_id" TEXT NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_name" TEXT,
  "mime_type" TEXT,
  "size" INTEGER,
  "uploaded_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_case_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "org_tasks" ADD COLUMN IF NOT EXISTS "service_case_id" TEXT;

CREATE INDEX IF NOT EXISTS "service_cases_organization_id_idx" ON "service_cases"("organization_id");
CREATE INDEX IF NOT EXISTS "service_cases_vehicle_id_idx" ON "service_cases"("vehicle_id");
CREATE INDEX IF NOT EXISTS "service_cases_vendor_id_idx" ON "service_cases"("vendor_id");
CREATE INDEX IF NOT EXISTS "service_cases_status_idx" ON "service_cases"("status");
CREATE INDEX IF NOT EXISTS "service_cases_category_idx" ON "service_cases"("category");
CREATE INDEX IF NOT EXISTS "service_cases_organization_id_status_idx" ON "service_cases"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "service_cases_organization_id_vehicle_id_idx" ON "service_cases"("organization_id", "vehicle_id");
CREATE INDEX IF NOT EXISTS "service_cases_organization_id_vendor_id_idx" ON "service_cases"("organization_id", "vendor_id");

CREATE INDEX IF NOT EXISTS "service_case_comments_service_case_id_idx" ON "service_case_comments"("service_case_id");
CREATE INDEX IF NOT EXISTS "service_case_attachments_service_case_id_idx" ON "service_case_attachments"("service_case_id");
CREATE INDEX IF NOT EXISTS "org_tasks_service_case_id_idx" ON "org_tasks"("service_case_id");

ALTER TABLE "service_case_comments"
  ADD CONSTRAINT "service_case_comments_service_case_id_fkey"
  FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_case_attachments"
  ADD CONSTRAINT "service_case_attachments_service_case_id_fkey"
  FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_tasks_service_case_id_fkey'
  ) THEN
    ALTER TABLE "org_tasks"
      ADD CONSTRAINT "org_tasks_service_case_id_fkey"
      FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
