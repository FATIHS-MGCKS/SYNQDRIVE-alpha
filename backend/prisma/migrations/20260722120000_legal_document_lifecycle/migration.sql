-- Legal document professional lifecycle (Prompt 4/32)
--
-- 1) Rename active_from → activated_at (preserves historical activation timestamps).
-- 2) Add lifecycle audit + validity fields.
-- 3) Remap legacy ARCHIVED rows that had been active → SUPERSEDED.
-- 4) Backfill valid_from for currently ACTIVE and newly SUPERSEDED rows.

-- Rename activation timestamp column (migration-safe; no data loss).
ALTER TABLE "organization_legal_documents"
  RENAME COLUMN "active_from" TO "activated_at";

ALTER TABLE "organization_legal_documents"
  ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submitted_for_review_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submitted_for_review_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "activated_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revoked_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "status_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "change_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "legal_owner_name" TEXT;

-- Rows archived after a prior activation were replacements, not cold storage.
UPDATE "organization_legal_documents"
SET
  status = 'SUPERSEDED',
  updated_at = CURRENT_TIMESTAMP
WHERE status = 'ARCHIVED'
  AND activated_at IS NOT NULL;

-- ACTIVE rows: validity window starts at activation time when not already set.
UPDATE "organization_legal_documents"
SET
  valid_from = activated_at,
  updated_at = CURRENT_TIMESTAMP
WHERE status = 'ACTIVE'
  AND activated_at IS NOT NULL
  AND valid_from IS NULL;

-- SUPERSEDED rows: preserve when the version had been in force.
UPDATE "organization_legal_documents"
SET
  valid_from = activated_at,
  updated_at = CURRENT_TIMESTAMP
WHERE status = 'SUPERSEDED'
  AND activated_at IS NOT NULL
  AND valid_from IS NULL;

CREATE INDEX IF NOT EXISTS "organization_legal_documents_org_type_lang_status_idx"
  ON "organization_legal_documents" ("organization_id", "document_type", "language", "status");