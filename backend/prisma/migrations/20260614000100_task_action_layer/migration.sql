-- V4.8.3 Task Action Layer
-- Extends OrgTask into a central operational task model and adds the child
-- resources (checklist / comments / attachments / timeline). Additive only —
-- no existing column is dropped, so legacy tasks keep working.

-- ── New enums ────────────────────────────────────────────────────────────
CREATE TYPE "TaskType" AS ENUM (
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_CLEANING',
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'DOCUMENT_REVIEW',
  'INVOICE_REQUIRED',
  'CUSTOMER_FOLLOWUP',
  'REPAIR',
  'CUSTOM'
);

CREATE TYPE "TaskSource" AS ENUM (
  'MANUAL',
  'SYSTEM',
  'ALERT',
  'HEALTH',
  'BOOKING',
  'DOCUMENT',
  'VENDOR'
);

-- ── OrgTask new columns ──────────────────────────────────────────────────
ALTER TABLE "org_tasks"
  ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "source_type" "TaskSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "booking_id" TEXT,
  ADD COLUMN "customer_id" TEXT,
  ADD COLUMN "vendor_id" TEXT,
  ADD COLUMN "alert_id" TEXT,
  ADD COLUMN "document_id" TEXT,
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "estimated_cost_cents" INTEGER,
  ADD COLUMN "actual_cost_cents" INTEGER,
  ADD COLUMN "resolution_note" TEXT,
  ADD COLUMN "metadata" JSONB;

-- ── Backfill legacy rows ─────────────────────────────────────────────────
-- Map known auto-task provenance onto the typed columns. Operator tasks keep
-- the CUSTOM / MANUAL defaults.
UPDATE "org_tasks" SET "source_type" = 'SYSTEM'
  WHERE "source" IS NOT NULL AND "source" LIKE 'INSIGHT_%';
UPDATE "org_tasks" SET "type" = 'VEHICLE_SERVICE'
  WHERE "source" = 'INSIGHT_SERVICE';
UPDATE "org_tasks" SET "type" = 'VEHICLE_INSPECTION'
  WHERE "source" = 'INSIGHT_COMPLIANCE';

-- ── OrgTask new indexes ──────────────────────────────────────────────────
CREATE INDEX "org_tasks_priority_idx" ON "org_tasks"("priority");
CREATE INDEX "org_tasks_type_idx" ON "org_tasks"("type");
CREATE INDEX "org_tasks_source_type_idx" ON "org_tasks"("source_type");
CREATE INDEX "org_tasks_due_date_idx" ON "org_tasks"("due_date");
CREATE INDEX "org_tasks_vehicle_id_idx" ON "org_tasks"("vehicle_id");
CREATE INDEX "org_tasks_booking_id_idx" ON "org_tasks"("booking_id");
CREATE INDEX "org_tasks_customer_id_idx" ON "org_tasks"("customer_id");
CREATE INDEX "org_tasks_vendor_id_idx" ON "org_tasks"("vendor_id");
CREATE INDEX "org_tasks_alert_id_idx" ON "org_tasks"("alert_id");
CREATE INDEX "org_tasks_document_id_idx" ON "org_tasks"("document_id");
CREATE INDEX "org_tasks_assigned_to_idx" ON "org_tasks"("assigned_to");
CREATE INDEX "org_tasks_organization_id_assigned_to_idx" ON "org_tasks"("organization_id", "assigned_to");

-- ── Child tables ─────────────────────────────────────────────────────────
CREATE TABLE "task_checklist_items" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_done" BOOLEAN NOT NULL DEFAULT false,
  "completed_at" TIMESTAMP(3),
  "completed_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_checklist_items_task_id_idx" ON "task_checklist_items"("task_id");

CREATE TABLE "task_comments" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "user_id" TEXT,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_comments_task_id_idx" ON "task_comments"("task_id");

CREATE TABLE "task_attachments" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_name" TEXT,
  "mime_type" TEXT,
  "size" INTEGER,
  "uploaded_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_attachments_task_id_idx" ON "task_attachments"("task_id");

CREATE TABLE "task_events" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "old_value" TEXT,
  "new_value" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_events_task_id_idx" ON "task_events"("task_id");

-- ── Foreign keys ─────────────────────────────────────────────────────────
ALTER TABLE "task_checklist_items"
  ADD CONSTRAINT "task_checklist_items_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "org_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments"
  ADD CONSTRAINT "task_comments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "org_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments"
  ADD CONSTRAINT "task_attachments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "org_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_events"
  ADD CONSTRAINT "task_events_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "org_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
