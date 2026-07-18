-- Org-scoped content hash for document extraction uploads (dedup scope).
ALTER TABLE "vehicle_document_extractions"
  ADD COLUMN IF NOT EXISTS "content_sha256" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_organization_id_content_sha256_idx"
  ON "vehicle_document_extractions" ("organization_id", "content_sha256");
