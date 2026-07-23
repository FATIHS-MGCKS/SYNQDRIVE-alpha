-- Legal document single-ACTIVE invariant (Prompt 3/32)
--
-- Ensures at most one ACTIVE row per (organization_id, document_type, language).
-- 1) Repair existing duplicate ACTIVE rows (archive losers — no deletes).
-- 2) Persist an audit row per archived duplicate.
-- 3) Add partial unique index (idempotent).
--
-- Winner selection (deterministic):
--   ORDER BY active_from DESC NULLS LAST,
--            updated_at DESC,
--            created_at DESC,
--            id DESC

CREATE TABLE IF NOT EXISTS "organization_legal_document_repair_log" (
  "id" TEXT NOT NULL,
  "migration_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "kept_document_id" TEXT NOT NULL,
  "archived_document_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "kept_active_from" TIMESTAMP(3),
  "archived_active_from" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_legal_document_repair_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "organization_legal_document_repair_log_migration_id_idx"
  ON "organization_legal_document_repair_log"("migration_id");

CREATE INDEX IF NOT EXISTS "organization_legal_document_repair_log_org_idx"
  ON "organization_legal_document_repair_log"("organization_id");

INSERT INTO "organization_legal_document_repair_log" (
  "id",
  "migration_id",
  "organization_id",
  "document_type",
  "language",
  "kept_document_id",
  "archived_document_id",
  "reason",
  "kept_active_from",
  "archived_active_from"
)
SELECT
  gen_random_uuid()::text,
  '20260722110000_legal_document_single_active_invariant',
  l.organization_id,
  l.document_type,
  l.language,
  l.kept_id,
  l.archived_id,
  'duplicate_active_archived_for_single_active_invariant',
  l.kept_active_from,
  l.archived_active_from
FROM (
  WITH ranked AS (
    SELECT
      id,
      organization_id,
      document_type,
      language,
      active_from,
      ROW_NUMBER() OVER (
        PARTITION BY organization_id, document_type, language
        ORDER BY
          active_from DESC NULLS LAST,
          updated_at DESC,
          created_at DESC,
          id DESC
      ) AS rn
    FROM organization_legal_documents
    WHERE status = 'ACTIVE'
  ),
  winners AS (
    SELECT organization_id, document_type, language, id AS kept_id, active_from AS kept_active_from
    FROM ranked
    WHERE rn = 1
  )
  SELECT
    r.id AS archived_id,
    r.organization_id,
    r.document_type,
    r.language,
    r.active_from AS archived_active_from,
    w.kept_id,
    w.kept_active_from
  FROM ranked r
  JOIN winners w
    ON w.organization_id = r.organization_id
   AND w.document_type = r.document_type
   AND w.language = r.language
  WHERE r.rn > 1
) AS l
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_legal_document_repair_log existing
  WHERE existing.migration_id = '20260722110000_legal_document_single_active_invariant'
    AND existing.archived_document_id = l.archived_id
);

UPDATE organization_legal_documents d
SET
  status = 'ARCHIVED',
  updated_at = CURRENT_TIMESTAMP
FROM (
  WITH ranked AS (
    SELECT
      id,
      organization_id,
      document_type,
      language,
      ROW_NUMBER() OVER (
        PARTITION BY organization_id, document_type, language
        ORDER BY
          active_from DESC NULLS LAST,
          updated_at DESC,
          created_at DESC,
          id DESC
      ) AS rn
    FROM organization_legal_documents
    WHERE status = 'ACTIVE'
  )
  SELECT id
  FROM ranked
  WHERE rn > 1
) losers
WHERE d.id = losers.id
  AND d.status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "organization_legal_documents_single_active_key"
  ON "organization_legal_documents" ("organization_id", "document_type", "language")
  WHERE "status" = 'ACTIVE';
