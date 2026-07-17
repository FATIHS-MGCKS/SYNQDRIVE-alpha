-- Stations V2 Prompt 23/78 — at most one non-archived primary station per organization.
-- Pre-flight: deterministic reconcile before partial unique index (no silent data loss).

-- 1) Read-only diagnostic snapshot (logged at migrate time; does not mutate).
DO $$
DECLARE
  duplicate_orgs INTEGER;
  archived_primary INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_orgs
  FROM (
    SELECT organization_id
    FROM stations
    WHERE is_primary = true AND status <> 'ARCHIVED'
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO archived_primary
  FROM stations
  WHERE is_primary = true AND status = 'ARCHIVED';

  RAISE NOTICE 'stations primary preflight: duplicate_non_archived_orgs=% archived_primary_flags=%',
    duplicate_orgs, archived_primary;
END $$;

-- 2) Clear primary flag on archived rows (archived stations must not be primary).
UPDATE stations
SET is_primary = false
WHERE is_primary = true AND status = 'ARCHIVED';

-- 3) Deterministic reconcile: keep one primary per org (prefer ACTIVE, then oldest created_at).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY
        CASE status
          WHEN 'ACTIVE' THEN 0
          WHEN 'INACTIVE' THEN 1
          ELSE 2
        END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM stations
  WHERE is_primary = true AND status <> 'ARCHIVED'
)
UPDATE stations AS s
SET is_primary = false
FROM ranked AS r
WHERE s.id = r.id AND r.rn > 1;

-- 4) Enforce invariant at database level (race safety alongside application locks).
CREATE UNIQUE INDEX IF NOT EXISTS "stations_one_primary_per_org"
  ON "stations" ("organization_id")
  WHERE "is_primary" = true AND "status" <> 'ARCHIVED';

CREATE INDEX IF NOT EXISTS "stations_org_status_primary_idx"
  ON "stations" ("organization_id", "status", "is_primary");
