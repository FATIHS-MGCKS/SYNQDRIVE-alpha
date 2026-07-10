-- Document extraction lifecycle foundation — additive, backward-compatible.
-- Extends status/type enums, adds granular stage/error/provider/timestamp fields,
-- and backfills existing rows so confirm/apply flows keep working.

-- 1) New enum types
CREATE TYPE "DocumentExtractionClassificationMode" AS ENUM ('MANUAL', 'AUTO');
CREATE TYPE "DocumentExtractionStage" AS ENUM (
  'UPLOAD',
  'STORAGE',
  'QUEUE',
  'OCR',
  'CLASSIFICATION',
  'EXTRACTION',
  'VALIDATION',
  'REVIEW',
  'APPLY'
);
CREATE TYPE "DocumentExtractionErrorPhase" AS ENUM (
  'UPLOAD',
  'STORAGE',
  'QUEUE',
  'OCR',
  'CLASSIFICATION',
  'EXTRACTION',
  'VALIDATION',
  'APPLY',
  'UNKNOWN'
);

-- 2) Extend existing enums (labels only in this transaction — no row references yet)
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_DOCUMENT_TYPE';
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "DocumentExtractionType" ADD VALUE IF NOT EXISTS 'AUTO';

-- 3) Lifecycle columns (all nullable or defaulted — safe for existing rows)
ALTER TABLE "vehicle_document_extractions"
  ADD COLUMN IF NOT EXISTS "requested_document_type" "DocumentExtractionType",
  ADD COLUMN IF NOT EXISTS "effective_document_type" "DocumentExtractionType",
  ADD COLUMN IF NOT EXISTS "classification_mode" "DocumentExtractionClassificationMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "detected_document_type" "DocumentExtractionType",
  ADD COLUMN IF NOT EXISTS "classification_confidence" DECIMAL(5, 4),
  ADD COLUMN IF NOT EXISTS "processing_stage" "DocumentExtractionStage" NOT NULL DEFAULT 'UPLOAD',
  ADD COLUMN IF NOT EXISTS "error_phase" "DocumentExtractionErrorPhase",
  ADD COLUMN IF NOT EXISTS "error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "processing_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ocr_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "ocr_model" TEXT,
  ADD COLUMN IF NOT EXISTS "extraction_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "extraction_model" TEXT,
  ADD COLUMN IF NOT EXISTS "ocr_page_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "processing_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ocr_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "classification_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "extraction_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processing_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

-- 4) document_type becomes nullable (AUTO uploads have no resolved type yet)
ALTER TABLE "vehicle_document_extractions" ALTER COLUMN "document_type" DROP NOT NULL;

-- 5) Backfill type fields from legacy document_type (manual uploads only)
UPDATE "vehicle_document_extractions"
SET
  "requested_document_type" = COALESCE("requested_document_type", "document_type"),
  "effective_document_type" = COALESCE("effective_document_type", "document_type"),
  "classification_mode" = COALESCE("classification_mode", 'MANUAL'::"DocumentExtractionClassificationMode")
WHERE "document_type" IS NOT NULL
  AND "document_type"::text <> 'AUTO';

-- 6) Backfill processing_stage from terminal status
UPDATE "vehicle_document_extractions"
SET "processing_stage" = CASE
  WHEN "status" = 'APPLIED' THEN 'APPLY'::"DocumentExtractionStage"
  WHEN "status" IN ('READY_FOR_REVIEW', 'CONFIRMED', 'REJECTED') THEN 'REVIEW'::"DocumentExtractionStage"
  WHEN "status" = 'FAILED' THEN 'EXTRACTION'::"DocumentExtractionStage"
  WHEN "status" IN ('QUEUED', 'PENDING') THEN 'QUEUE'::"DocumentExtractionStage"
  WHEN "status" = 'PROCESSING' THEN 'EXTRACTION'::"DocumentExtractionStage"
  ELSE 'UPLOAD'::"DocumentExtractionStage"
END
WHERE "processing_stage" = 'UPLOAD'::"DocumentExtractionStage";

-- 7) Backfill lifecycle timestamps from legacy columns
UPDATE "vehicle_document_extractions"
SET
  "processing_started_at" = COALESCE("processing_started_at", "queued_at", "created_at"),
  "extraction_completed_at" = COALESCE("extraction_completed_at", "processed_at"),
  "processing_completed_at" = COALESCE(
    "processing_completed_at",
    "applied_at",
    CASE WHEN "status" IN ('READY_FOR_REVIEW', 'FAILED', 'REJECTED') THEN "processed_at" END
  )
WHERE "processing_started_at" IS NULL
   OR "extraction_completed_at" IS NULL
   OR "processing_completed_at" IS NULL;
