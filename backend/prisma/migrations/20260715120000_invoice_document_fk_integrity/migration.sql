-- Invoice ↔ document FK integrity (audit K3)

DO $$ BEGIN
  ALTER TABLE "org_invoices"
    ADD CONSTRAINT "org_invoices_generated_document_id_fkey"
    FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "generated_documents"
    ADD CONSTRAINT "generated_documents_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "outbound_emails"
    ADD CONSTRAINT "outbound_emails_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "org_invoices_generated_document_id_key"
  ON "org_invoices"("generated_document_id")
  WHERE "generated_document_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "org_invoices_generated_document_id_idx"
  ON "org_invoices"("generated_document_id");
