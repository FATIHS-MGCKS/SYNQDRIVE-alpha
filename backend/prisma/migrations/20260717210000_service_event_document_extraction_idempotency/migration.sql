-- Document Intake V2 P39: idempotent service/compliance apply from document extraction.

ALTER TABLE "vehicle_service_events"
  ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
  ADD COLUMN IF NOT EXISTS "document_extraction_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_service_events_organization_id_document_extraction_id_key"
  ON "vehicle_service_events" ("organization_id", "document_extraction_id")
  WHERE "document_extraction_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "vehicle_service_events_document_extraction_id_idx"
  ON "vehicle_service_events" ("document_extraction_id");

CREATE INDEX IF NOT EXISTS "vehicle_service_events_organization_id_idx"
  ON "vehicle_service_events" ("organization_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicle_service_events_document_extraction_id_fkey'
  ) THEN
    ALTER TABLE "vehicle_service_events"
      ADD CONSTRAINT "vehicle_service_events_document_extraction_id_fkey"
      FOREIGN KEY ("document_extraction_id")
      REFERENCES "vehicle_document_extractions"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
