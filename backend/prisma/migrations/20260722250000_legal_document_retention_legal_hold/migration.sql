-- Legal document retention, legal hold, and secure deletion (Prompt 22/32)

ALTER TABLE "organization_legal_documents"
  ADD COLUMN "retention_class" TEXT NOT NULL DEFAULT 'LEGAL_MASTER',
  ADD COLUMN "retain_until" TIMESTAMP(3),
  ADD COLUMN "legal_hold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legal_hold_reason" TEXT,
  ADD COLUMN "legal_hold_set_at" TIMESTAMP(3),
  ADD COLUMN "legal_hold_set_by_user_id" TEXT,
  ADD COLUMN "deletion_eligible_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "storage_purged_at" TIMESTAMP(3),
  ADD COLUMN "storage_purge_error" TEXT;

ALTER TABLE "generated_documents"
  ADD COLUMN "retention_class" TEXT NOT NULL DEFAULT 'BOOKING_SNAPSHOT',
  ADD COLUMN "retain_until" TIMESTAMP(3),
  ADD COLUMN "legal_hold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legal_hold_reason" TEXT,
  ADD COLUMN "legal_hold_set_at" TIMESTAMP(3),
  ADD COLUMN "legal_hold_set_by_user_id" TEXT,
  ADD COLUMN "deletion_eligible_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "storage_purged_at" TIMESTAMP(3),
  ADD COLUMN "storage_purge_error" TEXT;

ALTER TABLE "legal_document_delivery_evidence"
  ADD COLUMN "retention_class" TEXT NOT NULL DEFAULT 'DELIVERY_EVIDENCE',
  ADD COLUMN "retain_until" TIMESTAMP(3),
  ADD COLUMN "legal_hold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legal_hold_reason" TEXT,
  ADD COLUMN "legal_hold_set_at" TIMESTAMP(3),
  ADD COLUMN "legal_hold_set_by_user_id" TEXT,
  ADD COLUMN "deletion_eligible_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "recipient_redacted_at" TIMESTAMP(3);

ALTER TABLE "organization_legal_document_events"
  ADD COLUMN "retention_class" TEXT NOT NULL DEFAULT 'AUDIT_EVENT';

CREATE TABLE "organization_legal_document_retention_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "policy_version" TEXT NOT NULL,
  "class_policies" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by_user_id" TEXT,
  CONSTRAINT "organization_legal_document_retention_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_legal_document_retention_policies_organization_id_key"
  ON "organization_legal_document_retention_policies"("organization_id");

ALTER TABLE "organization_legal_document_retention_policies"
  ADD CONSTRAINT "organization_legal_document_retention_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "legal_document_retention_purge_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "trigger" TEXT NOT NULL DEFAULT 'manual',
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "report" JSONB NOT NULL DEFAULT '{}',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "correlation_id" TEXT,
  CONSTRAINT "legal_document_retention_purge_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_document_retention_purge_runs_org_started_idx"
  ON "legal_document_retention_purge_runs"("organization_id", "started_at");

ALTER TABLE "legal_document_retention_purge_runs"
  ADD CONSTRAINT "legal_document_retention_purge_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "organization_legal_documents_org_retention_eligible_idx"
  ON "organization_legal_documents"("organization_id", "retention_class", "deletion_eligible_at");

CREATE INDEX "organization_legal_documents_org_legal_hold_idx"
  ON "organization_legal_documents"("organization_id", "legal_hold");

CREATE INDEX "generated_documents_org_retention_eligible_idx"
  ON "generated_documents"("organization_id", "retention_class", "deletion_eligible_at");

CREATE INDEX "generated_documents_org_legal_hold_idx"
  ON "generated_documents"("organization_id", "legal_hold");

CREATE INDEX "legal_document_delivery_evidence_org_retention_eligible_idx"
  ON "legal_document_delivery_evidence"("organization_id", "retention_class", "deletion_eligible_at");

CREATE INDEX "legal_document_delivery_evidence_org_legal_hold_idx"
  ON "legal_document_delivery_evidence"("organization_id", "legal_hold");
