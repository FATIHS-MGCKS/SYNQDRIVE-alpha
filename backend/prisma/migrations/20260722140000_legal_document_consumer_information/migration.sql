-- Neutral consumer-information document type (Prompt 6/32)
--
-- Separates document category (CONSUMER_INFORMATION) from administratively
-- chosen variant (legal_variant). Legacy WITHDRAWAL_INFORMATION rows are
-- migrated without changing PDF content or object keys.

ALTER TABLE "organization_legal_documents"
  ADD COLUMN IF NOT EXISTS "legal_variant" TEXT;

ALTER TABLE "generated_documents"
  ADD COLUMN IF NOT EXISTS "legal_variant" TEXT;

ALTER TABLE "organization_legal_document_events"
  ADD COLUMN IF NOT EXISTS "document_type" TEXT,
  ADD COLUMN IF NOT EXISTS "legal_variant" TEXT;

-- Legacy withdrawal rows → neutral category + explicit variant snapshot.
UPDATE "organization_legal_documents"
SET
  document_type = 'CONSUMER_INFORMATION',
  legal_variant = 'WITHDRAWAL_RIGHT_NOTICE',
  updated_at = CURRENT_TIMESTAMP
WHERE document_type = 'WITHDRAWAL_INFORMATION';

UPDATE "generated_documents"
SET
  document_type = 'CONSUMER_INFORMATION',
  legal_variant = 'WITHDRAWAL_RIGHT_NOTICE',
  updated_at = CURRENT_TIMESTAMP
WHERE document_type = 'WITHDRAWAL_INFORMATION';

-- Backfill event snapshots from parent documents where possible.
UPDATE "organization_legal_document_events" e
SET
  document_type = d.document_type,
  legal_variant = d.legal_variant
FROM "organization_legal_documents" d
WHERE e.legal_document_id = d.id
  AND e.document_type IS NULL;

CREATE INDEX IF NOT EXISTS "organization_legal_documents_org_type_variant_idx"
  ON "organization_legal_documents" ("organization_id", "document_type", "legal_variant");
