-- Upload duplicate policy: status fields + org-scoped content anchor for parallel upload safety.
ALTER TABLE "vehicle_document_extractions"
  ADD COLUMN IF NOT EXISTS "upload_duplicate_status" TEXT,
  ADD COLUMN IF NOT EXISTS "related_extraction_id" TEXT,
  ADD COLUMN IF NOT EXISTS "reupload_reason" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_organization_id_upload_duplicate_status_idx"
  ON "vehicle_document_extractions" ("organization_id", "upload_duplicate_status");

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_related_extraction_id_idx"
  ON "vehicle_document_extractions" ("related_extraction_id");

ALTER TABLE "vehicle_document_extractions"
  ADD CONSTRAINT "vehicle_document_extractions_related_extraction_id_fkey"
  FOREIGN KEY ("related_extraction_id") REFERENCES "vehicle_document_extractions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "document_extraction_content_anchors" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "canonical_extraction_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_extraction_content_anchors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_extraction_content_anchors_canonical_extraction_id_key"
  ON "document_extraction_content_anchors" ("canonical_extraction_id");

CREATE UNIQUE INDEX IF NOT EXISTS "document_extraction_content_anchors_organization_id_content_sha256_key"
  ON "document_extraction_content_anchors" ("organization_id", "content_sha256");

ALTER TABLE "document_extraction_content_anchors"
  ADD CONSTRAINT "document_extraction_content_anchors_canonical_extraction_id_fkey"
  FOREIGN KEY ("canonical_extraction_id") REFERENCES "vehicle_document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
