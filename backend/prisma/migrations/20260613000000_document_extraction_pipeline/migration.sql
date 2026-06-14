-- AI Document Upload pipeline — async extraction + human confirmation
--
-- 1) New lifecycle statuses for the extraction state machine.
--    Added as labels only (no row references them in this migration), so the
--    Postgres "unsafe use of new enum value" restriction does not apply.
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'APPLIED';
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- 2) Upload + worker metadata columns. All nullable / backward-compatible so
--    existing rows (created via the legacy client-supplied flow) stay valid
--    without a backfill. No columns are renamed or dropped.
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "object_key" TEXT;
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "storage_provider" TEXT;
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "size_bytes" INTEGER;
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "plausibility" JSONB;
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "queued_at" TIMESTAMP(3);
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP(3);
ALTER TABLE "vehicle_document_extractions" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
