-- Org-wide document upload: vehicle optional, upload context metadata
ALTER TABLE "vehicle_document_extractions"
  ALTER COLUMN "vehicle_id" DROP NOT NULL;

ALTER TABLE "vehicle_document_extractions"
  ADD COLUMN IF NOT EXISTS "upload_context_type" TEXT,
  ADD COLUMN IF NOT EXISTS "upload_context_id" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_upload_context_idx"
  ON "vehicle_document_extractions" ("organization_id", "upload_context_type", "upload_context_id");
