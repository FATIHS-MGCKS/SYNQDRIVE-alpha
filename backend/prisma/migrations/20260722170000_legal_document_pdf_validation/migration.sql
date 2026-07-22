-- Legal document PDF validation & quarantine scan status (Prompt 11/32)

ALTER TABLE "organization_legal_documents"
  ADD COLUMN IF NOT EXISTS "scan_status" TEXT NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS "page_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "validation_error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "validation_error_detail" TEXT,
  ADD COLUMN IF NOT EXISTS "validated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "malware_scanned_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "malware_scanner_id" TEXT,
  ADD COLUMN IF NOT EXISTS "quarantine_object_key" TEXT;

CREATE INDEX IF NOT EXISTS "organization_legal_documents_org_scan_status_idx"
  ON "organization_legal_documents" ("organization_id", "scan_status");

-- Grandfather documents already in lifecycle beyond DRAFT as scan-passed.
UPDATE "organization_legal_documents"
SET "scan_status" = 'SCAN_PASSED',
    "validated_at" = COALESCE("validated_at", "updated_at")
WHERE "status" IN ('IN_REVIEW', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'SUPERSEDED', 'REVOKED', 'ARCHIVED');

-- Legacy DRAFT uploads must be re-validated before review/activation.
UPDATE "organization_legal_documents"
SET "scan_status" = 'VALIDATION_FAILED',
    "validation_error_code" = 'LEGAL_PDF_LEGACY_REVALIDATION_REQUIRED',
    "validation_error_detail" = 'Re-upload required — document was uploaded before PDF security validation was enabled'
WHERE "status" = 'DRAFT'
  AND "scan_status" = 'UPLOADED';
