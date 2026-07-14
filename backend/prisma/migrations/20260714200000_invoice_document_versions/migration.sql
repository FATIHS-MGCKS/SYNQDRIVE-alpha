-- Invoice document versions — additive schema extension (ADR: INVOICE_GENERATED_DOCUMENT_RELATION)
--
-- Adds version tracking, generation-state persistence, and Prisma relations between
-- org_invoices and generated_documents. Idempotent (IF NOT EXISTS). No data backfill,
-- no column drops, no destructive changes. Legacy generated_document_id on org_invoices
-- is preserved; new FK uses ON DELETE SET NULL for safe invoice/document lifecycle.

-- 1) New columns on generated_documents
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "version_number" INTEGER;
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "is_active_version" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "generation_status" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "generation_error_code" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "last_error_message" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "generation_attempt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "last_generation_attempt_at" TIMESTAMP(3);
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3);

-- 2) Query indexes for active-version resolution and generation retry scheduling
CREATE INDEX IF NOT EXISTS "generated_documents_org_invoice_type_status_idx"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type", "status");

CREATE INDEX IF NOT EXISTS "generated_documents_org_invoice_type_active_idx"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type", "is_active_version");

CREATE INDEX IF NOT EXISTS "generated_documents_org_invoice_type_created_idx"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type", "created_at");

CREATE INDEX IF NOT EXISTS "generated_documents_generation_status_next_retry_idx"
  ON "generated_documents" ("generation_status", "next_retry_at");

CREATE INDEX IF NOT EXISTS "generated_documents_org_generation_status_next_retry_idx"
  ON "generated_documents" ("organization_id", "generation_status", "next_retry_at");

-- 3) Index on org_invoices cache pointer
CREATE INDEX IF NOT EXISTS "org_invoices_generated_document_id_idx"
  ON "org_invoices" ("generated_document_id");

-- 4) Partial unique: no duplicate version numbers per invoice + document type
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_invoice_type_version_key"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type", "version_number")
  WHERE "invoice_id" IS NOT NULL AND "version_number" IS NOT NULL;

-- 5) Partial unique: at most one active version per invoice + document type
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_one_active_per_invoice_type_key"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type")
  WHERE "invoice_id" IS NOT NULL AND "is_active_version" = true;

-- 6) Foreign keys (added only if absent)
DO $$
BEGIN
  -- Document → Invoice (canonical link). SET NULL preserves document history when invoice removed.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_documents_invoice_id_fkey') THEN
    ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_invoice_id_fkey"
      FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- Invoice → Document (denormalized active cache pointer). SET NULL when document removed.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_invoices_generated_document_id_fkey') THEN
    ALTER TABLE "org_invoices" ADD CONSTRAINT "org_invoices_generated_document_id_fkey"
      FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
