-- Document Intake V2 P41: idempotent tire/brake/battery apply from document extraction.

ALTER TABLE "vehicle_tire_tread_measurements"
  ADD COLUMN IF NOT EXISTS "document_extraction_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_tire_tread_measurements_vehicle_id_document_extraction_id_key"
  ON "vehicle_tire_tread_measurements" ("vehicle_id", "document_extraction_id")
  WHERE "document_extraction_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "vehicle_tire_tread_measurements_document_extraction_id_idx"
  ON "vehicle_tire_tread_measurements" ("document_extraction_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicle_tire_tread_measurements_document_extraction_id_fkey'
  ) THEN
    ALTER TABLE "vehicle_tire_tread_measurements"
      ADD CONSTRAINT "vehicle_tire_tread_measurements_document_extraction_id_fkey"
      FOREIGN KEY ("document_extraction_id")
      REFERENCES "vehicle_document_extractions"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "brake_evidence_document_extraction_id_axle_key"
  ON "brake_evidence" ("document_extraction_id", "axle")
  WHERE "document_extraction_id" IS NOT NULL;
