-- Additive: invoice document versioning + persistent generation state (ADR V4.9.472).
-- No data backfill, no column drops, legacy generated_document_id on org_invoices unchanged.

ALTER TABLE "generated_documents"
  ADD COLUMN IF NOT EXISTS "version_number" INTEGER,
  ADD COLUMN IF NOT EXISTS "generation_status" TEXT,
  ADD COLUMN IF NOT EXISTS "generation_error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "last_error_message" TEXT,
  ADD COLUMN IF NOT EXISTS "generation_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_generation_attempt_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "triggered_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "triggered_by_source" TEXT;

-- Composite lookup: all versions for an invoice + document type.
CREATE INDEX IF NOT EXISTS "generated_documents_org_invoice_doc_type_idx"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type");

CREATE INDEX IF NOT EXISTS "generated_documents_org_invoice_doc_type_version_idx"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type", "version_number");

CREATE INDEX IF NOT EXISTS "generated_documents_generation_status_idx"
  ON "generated_documents" ("generation_status");

CREATE INDEX IF NOT EXISTS "generated_documents_next_retry_at_idx"
  ON "generated_documents" ("next_retry_at");

-- Version uniqueness applies only once version_number is assigned (post-backfill / new writes).
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_org_invoice_type_version_key"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type", "version_number")
  WHERE "invoice_id" IS NOT NULL AND "version_number" IS NOT NULL;

-- At most one active document per invoice + type for versioned rows (legacy rows without version_number excluded).
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_one_active_per_invoice_type_idx"
  ON "generated_documents" ("organization_id", "invoice_id", "document_type")
  WHERE "invoice_id" IS NOT NULL
    AND "version_number" IS NOT NULL
    AND "status" NOT IN ('VOID', 'FAILED');

-- Cross-tenant guard: invoice must belong to the same organization as the document row.
CREATE OR REPLACE FUNCTION check_generated_document_invoice_org_match()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "org_invoices" oi
      WHERE oi."id" = NEW.invoice_id
        AND oi."organization_id" = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'generated_documents.invoice_id must reference an org_invoice in the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generated_documents_invoice_org_check ON "generated_documents";

CREATE TRIGGER generated_documents_invoice_org_check
  BEFORE INSERT OR UPDATE OF "invoice_id", "organization_id"
  ON "generated_documents"
  FOR EACH ROW
  EXECUTE PROCEDURE check_generated_document_invoice_org_match();
