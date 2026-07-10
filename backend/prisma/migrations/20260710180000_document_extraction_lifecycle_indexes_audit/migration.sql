-- Document extraction lifecycle indexes + audit actor columns (V4.9.329)

ALTER TABLE "vehicle_document_extractions"
  ADD COLUMN IF NOT EXISTS "confirmed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "applied_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "file_deleted_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "file_deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_organization_id_created_at_idx"
  ON "vehicle_document_extractions" ("organization_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_vehicle_id_created_at_idx"
  ON "vehicle_document_extractions" ("vehicle_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_status_updated_at_idx"
  ON "vehicle_document_extractions" ("status", "updated_at");
