-- Document Intake V2 P19: additive control fields on vehicle_document_extractions.
-- Non-destructive: vehicle_id becomes nullable; existing rows keep values.
-- organization_id remains nullable until planned backfill (see document-intake-v2-extraction-backfill-plan.md).

ALTER TABLE "vehicle_document_extractions"
  ALTER COLUMN "vehicle_id" DROP NOT NULL;

ALTER TABLE "vehicle_document_extractions"
  ADD COLUMN IF NOT EXISTS "document_category" "DocumentCategory",
  ADD COLUMN IF NOT EXISTS "document_subtype" TEXT,
  ADD COLUMN IF NOT EXISTS "classification_version" TEXT,
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "duplicate_status" "DocumentDuplicateStatus",
  ADD COLUMN IF NOT EXISTS "current_action_plan_id" TEXT,
  ADD COLUMN IF NOT EXISTS "processing_maturity" "DocumentProcessingMaturity",
  ADD COLUMN IF NOT EXISTS "apply_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "apply_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "apply_failure_code" TEXT,
  ADD COLUMN IF NOT EXISTS "legacy_apply_result" JSONB,
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_organization_id_vehicle_id_idx"
  ON "vehicle_document_extractions" ("organization_id", "vehicle_id");

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_organization_id_document_category_idx"
  ON "vehicle_document_extractions" ("organization_id", "document_category");

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_content_hash_idx"
  ON "vehicle_document_extractions" ("content_hash");

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_duplicate_status_idx"
  ON "vehicle_document_extractions" ("duplicate_status");

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_current_action_plan_id_idx"
  ON "vehicle_document_extractions" ("current_action_plan_id");

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_archived_at_idx"
  ON "vehicle_document_extractions" ("archived_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vehicle_document_extractions_organization_id_fkey'
  ) THEN
    ALTER TABLE "vehicle_document_extractions"
      ADD CONSTRAINT "vehicle_document_extractions_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vehicle_document_extractions_current_action_plan_id_fkey'
  ) THEN
    ALTER TABLE "vehicle_document_extractions"
      ADD CONSTRAINT "vehicle_document_extractions_current_action_plan_id_fkey"
      FOREIGN KEY ("current_action_plan_id") REFERENCES "document_action_plans"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
