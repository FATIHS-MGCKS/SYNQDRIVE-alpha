-- Document Intake V2 P37: idempotent fine apply from document extraction.

ALTER TABLE "fines"
  ADD COLUMN IF NOT EXISTS "document_extraction_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "fines_organization_id_document_extraction_id_key"
  ON "fines" ("organization_id", "document_extraction_id")
  WHERE "document_extraction_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "fines_document_extraction_id_idx"
  ON "fines" ("document_extraction_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fines_document_extraction_id_fkey'
  ) THEN
    ALTER TABLE "fines"
      ADD CONSTRAINT "fines_document_extraction_id_fkey"
      FOREIGN KEY ("document_extraction_id")
      REFERENCES "vehicle_document_extractions"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
