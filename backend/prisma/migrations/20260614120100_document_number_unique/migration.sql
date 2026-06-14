-- Prevent duplicate document numbers per organization (best-effort sequence safety).
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_org_document_number_key"
  ON "generated_documents"("organization_id", "document_number")
  WHERE "document_number" IS NOT NULL;
