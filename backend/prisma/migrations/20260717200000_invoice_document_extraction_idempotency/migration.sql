-- Document Intake V2 P38: idempotent invoice apply from document extraction.

CREATE UNIQUE INDEX IF NOT EXISTS "org_invoices_organization_id_document_extraction_id_key"
  ON "org_invoices" ("organization_id", "document_extraction_id")
  WHERE "document_extraction_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "org_invoices_document_extraction_id_idx"
  ON "org_invoices" ("document_extraction_id");

CREATE INDEX IF NOT EXISTS "org_invoices_organization_id_vendor_id_invoice_number_display_idx"
  ON "org_invoices" ("organization_id", "vendor_id", "invoice_number_display");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'org_invoices_document_extraction_id_fkey'
  ) THEN
    ALTER TABLE "org_invoices"
      ADD CONSTRAINT "org_invoices_document_extraction_id_fkey"
      FOREIGN KEY ("document_extraction_id")
      REFERENCES "vehicle_document_extractions"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
