-- Prompt 29: Art. 30-oriented processing activity register fields

CREATE TYPE "ProcessingActivityDpiaStatus" AS ENUM (
  'NOT_ASSESSED',
  'NOT_REQUIRED',
  'REQUIRED_PENDING',
  'IN_PROGRESS',
  'COMPLETED'
);

CREATE TYPE "ProcessingActivityDeletionStatus" AS ENUM (
  'ACTIVE',
  'DELETION_SCHEDULED',
  'DELETED',
  'RETAINED_LEGAL_HOLD'
);

CREATE TYPE "ProcessingActivityRegisterExportFormat" AS ENUM ('CSV', 'PDF');

CREATE TYPE "ProcessingActivityRegisterAuditAction" AS ENUM (
  'VIEW_LIST',
  'VIEW_DETAIL',
  'UPDATE',
  'EXPORT_CREATED',
  'EXPORT_DOWNLOADED'
);

ALTER TABLE "processing_activities"
  ADD COLUMN IF NOT EXISTS "purpose_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "recipient_categories_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "retention_description" TEXT,
  ADD COLUMN IF NOT EXISTS "retention_period_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "technical_organizational_measures" TEXT,
  ADD COLUMN IF NOT EXISTS "controller_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "joint_controller_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "next_review_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dpia_status" "ProcessingActivityDpiaStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  ADD COLUMN IF NOT EXISTS "deletion_status" "ProcessingActivityDeletionStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "processing_activity_data_subject_types" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "subject_type" "DataSubjectType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_data_subject_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processing_activity_data_subject_types_processing_activity_id_subject_type_key"
  ON "processing_activity_data_subject_types"("processing_activity_id", "subject_type");
CREATE INDEX "processing_activity_data_subject_types_organization_id_idx"
  ON "processing_activity_data_subject_types"("organization_id");

ALTER TABLE "processing_activity_data_subject_types"
  ADD CONSTRAINT "processing_activity_data_subject_types_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "processing_activity_register_exports" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT,
  "format" "ProcessingActivityRegisterExportFormat" NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "data_snapshot_at" TIMESTAMP(3) NOT NULL,
  "activity_count" INTEGER NOT NULL,
  "record_version" TEXT NOT NULL,
  "checksum_sha256" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "processing_activity_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_register_exports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processing_activity_register_exports_organization_id_created_at_idx"
  ON "processing_activity_register_exports"("organization_id", "created_at");
CREATE INDEX "processing_activity_register_exports_organization_id_expires_at_idx"
  ON "processing_activity_register_exports"("organization_id", "expires_at");

ALTER TABLE "processing_activity_register_exports"
  ADD CONSTRAINT "processing_activity_register_exports_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_register_exports"
  ADD CONSTRAINT "processing_activity_register_exports_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "processing_activity_register_audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "action" "ProcessingActivityRegisterAuditAction" NOT NULL,
  "actor_user_id" TEXT,
  "processing_activity_id" TEXT,
  "export_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_register_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processing_activity_register_audit_events_organization_id_created_at_idx"
  ON "processing_activity_register_audit_events"("organization_id", "created_at");
CREATE INDEX "processing_activity_register_audit_events_organization_id_action_idx"
  ON "processing_activity_register_audit_events"("organization_id", "action");

ALTER TABLE "processing_activity_register_audit_events"
  ADD CONSTRAINT "processing_activity_register_audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_register_audit_events"
  ADD CONSTRAINT "processing_activity_register_audit_events_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
