-- Legal document storage integrity + reconciliation runs (Prompt 14/32)

ALTER TABLE "organization_legal_documents"
  ADD COLUMN IF NOT EXISTS "integrity_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS "integrity_checked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "integrity_detail" TEXT,
  ADD COLUMN IF NOT EXISTS "integrity_unavailable" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "organization_legal_documents_org_integrity_status_idx"
  ON "organization_legal_documents" ("organization_id", "integrity_status");

CREATE TABLE IF NOT EXISTS "legal_document_storage_reconciliation_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "cursor" TEXT,
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "interrupted_at" TIMESTAMP(3),
  "correlation_id" TEXT,
  CONSTRAINT "legal_document_storage_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "legal_document_storage_reconciliation_runs_org_started_idx"
  ON "legal_document_storage_reconciliation_runs" ("organization_id", "started_at");

ALTER TABLE "legal_document_storage_reconciliation_runs"
  ADD CONSTRAINT "legal_document_storage_reconciliation_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
