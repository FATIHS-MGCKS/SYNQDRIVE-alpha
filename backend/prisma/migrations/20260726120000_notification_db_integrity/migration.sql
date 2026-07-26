-- Notification Engine DB integrity (Remediation Prompt 6)
--
-- Non-destructive preflight repairs + CHECK constraints + stricter active fingerprint uniqueness.
-- Partial unique indexes are maintained in SQL (Prisma cannot express them).
--
-- BACKUP: pg_dump snapshot required before production deploy.
-- ROLLBACK: see docs/architecture/notification-db-integrity.md

CREATE TABLE IF NOT EXISTS "notification_integrity_repair_log" (
  "id" TEXT NOT NULL,
  "migration_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_integrity_repair_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_integrity_repair_log_migration_id_idx"
  ON "notification_integrity_repair_log"("migration_id");

CREATE INDEX IF NOT EXISTS "notification_integrity_repair_log_entity_idx"
  ON "notification_integrity_repair_log"("entity_type", "entity_id");

-- ── 1) Repair active fingerprint duplicates (keep newest generation / last seen) ──
WITH active_dupes AS (
  SELECT
    "organization_id",
    "fingerprint",
    array_agg(
      "id"
      ORDER BY "lifecycle_generation" DESC, "last_seen_at" DESC, "created_at" DESC, "id" ASC
    ) AS ids
  FROM "notifications"
  WHERE "status" IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
  GROUP BY "organization_id", "fingerprint"
  HAVING COUNT(*) > 1
),
losers AS (
  SELECT unnest(ids[2:array_length(ids, 1)]) AS "id"
  FROM active_dupes
)
INSERT INTO "notification_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260726120000_notification_db_integrity',
  'notification',
  l."id",
  'resolve_duplicate_active_fingerprint',
  jsonb_build_object(
    'reason', 'duplicate_active_fingerprint',
    'kept_generation_policy', 'highest_lifecycle_generation_then_last_seen'
  )
FROM losers l
WHERE NOT EXISTS (
  SELECT 1 FROM "notification_integrity_repair_log" existing
  WHERE existing."migration_id" = '20260726120000_notification_db_integrity'
    AND existing."entity_id" = l."id"
    AND existing."action" = 'resolve_duplicate_active_fingerprint'
);

WITH active_dupes AS (
  SELECT
    "organization_id",
    "fingerprint",
    array_agg(
      "id"
      ORDER BY "lifecycle_generation" DESC, "last_seen_at" DESC, "created_at" DESC, "id" ASC
    ) AS ids
  FROM "notifications"
  WHERE "status" IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
  GROUP BY "organization_id", "fingerprint"
  HAVING COUNT(*) > 1
),
losers AS (
  SELECT unnest(ids[2:array_length(ids, 1)]) AS "id"
  FROM active_dupes
)
UPDATE "notifications" n
SET
  "status" = 'RESOLVED',
  "resolved_at" = COALESCE(n."resolved_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP,
  "version" = n."version" + 1
FROM losers l
WHERE n."id" = l."id";

-- ── 2) Align child organization_id with parent notification (tenant leak repair) ──
INSERT INTO "notification_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260726120000_notification_db_integrity',
  'notification_occurrence',
  o."id",
  'align_organization_id',
  jsonb_build_object(
    'previous_organization_id', o."organization_id",
    'notification_organization_id', n."organization_id"
  )
FROM "notification_occurrences" o
JOIN "notifications" n ON n."id" = o."notification_id"
WHERE o."organization_id" IS DISTINCT FROM n."organization_id"
  AND NOT EXISTS (
    SELECT 1 FROM "notification_integrity_repair_log" existing
    WHERE existing."migration_id" = '20260726120000_notification_db_integrity'
      AND existing."entity_id" = o."id"
      AND existing."action" = 'align_organization_id'
  );

UPDATE "notification_occurrences" o
SET "organization_id" = n."organization_id"
FROM "notifications" n
WHERE n."id" = o."notification_id"
  AND o."organization_id" IS DISTINCT FROM n."organization_id";

INSERT INTO "notification_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260726120000_notification_db_integrity',
  'notification_receipt',
  r."id",
  'align_organization_id',
  jsonb_build_object(
    'previous_organization_id', r."organization_id",
    'notification_organization_id', n."organization_id"
  )
FROM "notification_receipts" r
JOIN "notifications" n ON n."id" = r."notification_id"
WHERE r."organization_id" IS DISTINCT FROM n."organization_id"
  AND NOT EXISTS (
    SELECT 1 FROM "notification_integrity_repair_log" existing
    WHERE existing."migration_id" = '20260726120000_notification_db_integrity'
      AND existing."entity_id" = r."id"
      AND existing."action" = 'align_organization_id'
  );

UPDATE "notification_receipts" r
SET
  "organization_id" = n."organization_id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "notifications" n
WHERE n."id" = r."notification_id"
  AND r."organization_id" IS DISTINCT FROM n."organization_id";

INSERT INTO "notification_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260726120000_notification_db_integrity',
  'notification_delivery_outbox',
  d."id",
  'align_organization_id',
  jsonb_build_object(
    'previous_organization_id', d."organization_id",
    'notification_organization_id', n."organization_id"
  )
FROM "notification_delivery_outbox" d
JOIN "notifications" n ON n."id" = d."notification_id"
WHERE d."organization_id" IS DISTINCT FROM n."organization_id"
  AND NOT EXISTS (
    SELECT 1 FROM "notification_integrity_repair_log" existing
    WHERE existing."migration_id" = '20260726120000_notification_db_integrity'
      AND existing."entity_id" = d."id"
      AND existing."action" = 'align_organization_id'
  );

UPDATE "notification_delivery_outbox" d
SET
  "organization_id" = n."organization_id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "notifications" n
WHERE n."id" = d."notification_id"
  AND d."organization_id" IS DISTINCT FROM n."organization_id";

-- ── 3) Remove orphan child rows (should not exist with CASCADE FKs) ──
INSERT INTO "notification_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260726120000_notification_db_integrity',
  'notification_occurrence',
  o."id",
  'delete_orphan_occurrence',
  jsonb_build_object('notification_id', o."notification_id")
FROM "notification_occurrences" o
LEFT JOIN "notifications" n ON n."id" = o."notification_id"
WHERE n."id" IS NULL;

DELETE FROM "notification_occurrences" o
WHERE NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."id" = o."notification_id");

INSERT INTO "notification_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260726120000_notification_db_integrity',
  'notification_receipt',
  r."id",
  'delete_orphan_receipt',
  jsonb_build_object('notification_id', r."notification_id")
FROM "notification_receipts" r
LEFT JOIN "notifications" n ON n."id" = r."notification_id"
WHERE n."id" IS NULL;

DELETE FROM "notification_receipts" r
WHERE NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."id" = r."notification_id");

INSERT INTO "notification_integrity_repair_log" ("id", "migration_id", "entity_type", "entity_id", "action", "detail")
SELECT
  gen_random_uuid()::text,
  '20260726120000_notification_db_integrity',
  'notification_delivery_outbox',
  d."id",
  'delete_orphan_outbox',
  jsonb_build_object('notification_id', d."notification_id")
FROM "notification_delivery_outbox" d
LEFT JOIN "notifications" n ON n."id" = d."notification_id"
WHERE n."id" IS NULL;

DELETE FROM "notification_delivery_outbox" d
WHERE NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."id" = d."notification_id");

-- ── 4) Repair status/timestamp inconsistencies before CHECK constraints ──
UPDATE "notifications"
SET
  "resolved_at" = COALESCE("resolved_at", "updated_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'RESOLVED' AND "resolved_at" IS NULL;

UPDATE "notifications"
SET
  "archived_at" = COALESCE("archived_at", "updated_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'ARCHIVED' AND "archived_at" IS NULL;

UPDATE "notifications"
SET
  "snoozed_until" = COALESCE("snoozed_until", "updated_at" + INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '1 hour'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'SNOOZED' AND "snoozed_until" IS NULL;

-- ── 5) Stricter active fingerprint uniqueness (one active row per org + fingerprint) ──
DROP INDEX IF EXISTS "notifications_active_fingerprint_generation_key";

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_active_fingerprint_uidx"
  ON "notifications" ("organization_id", "fingerprint")
  WHERE "status" IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED');

-- ── 6) Query / worker / retention indexes ──
CREATE INDEX IF NOT EXISTS "notifications_org_created_at_idx"
  ON "notifications" ("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_org_archived_at_idx"
  ON "notifications" ("organization_id", "archived_at")
  WHERE "archived_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notifications_org_event_type_status_idx"
  ON "notifications" ("organization_id", "event_type", "status");

CREATE INDEX IF NOT EXISTS "notifications_org_status_created_at_idx"
  ON "notifications" ("organization_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_org_entity_status_idx"
  ON "notifications" ("organization_id", "entity_type", "entity_id", "status");

CREATE INDEX IF NOT EXISTS "notification_occurrences_org_occurred_at_idx"
  ON "notification_occurrences" ("organization_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "notification_occurrences_org_notification_id_idx"
  ON "notification_occurrences" ("organization_id", "notification_id");

CREATE INDEX IF NOT EXISTS "notification_receipts_org_user_id_idx"
  ON "notification_receipts" ("organization_id", "user_id");

CREATE INDEX IF NOT EXISTS "notification_receipts_org_notification_id_idx"
  ON "notification_receipts" ("organization_id", "notification_id");

CREATE INDEX IF NOT EXISTS "notification_delivery_outbox_processed_at_idx"
  ON "notification_delivery_outbox" ("processed_at")
  WHERE "processed_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notification_delivery_outbox_org_created_at_idx"
  ON "notification_delivery_outbox" ("organization_id", "created_at");

-- ── 7) CHECK constraints (additive, idempotent via DO blocks) ──
DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_fingerprint_not_blank_check"
    CHECK (length(trim("fingerprint")) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_entity_id_not_blank_check"
    CHECK (length(trim("entity_id")) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_version_positive_check"
    CHECK ("version" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_lifecycle_generation_positive_check"
    CHECK ("lifecycle_generation" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_occurrence_count_positive_check"
    CHECK ("occurrence_count" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_reopen_count_nonnegative_check"
    CHECK ("reopen_count" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_seen_window_check"
    CHECK ("first_seen_at" <= "last_seen_at");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_resolved_has_timestamp_check"
    CHECK ("status" <> 'RESOLVED' OR "resolved_at" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_archived_has_timestamp_check"
    CHECK ("status" <> 'ARCHIVED' OR "archived_at" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_snoozed_has_until_check"
    CHECK ("status" <> 'SNOOZED' OR "snoozed_until" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_template_params_size_check"
    CHECK (octet_length("template_params"::text) <= 32768);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_action_target_size_check"
    CHECK (octet_length("action_target"::text) <= 8192);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notification_occurrences"
    ADD CONSTRAINT "notification_occurrences_payload_size_check"
    CHECK ("payload" IS NULL OR octet_length("payload"::text) <= 65536);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notification_delivery_outbox"
    ADD CONSTRAINT "notification_delivery_outbox_payload_ref_size_check"
    CHECK (octet_length("payload_ref"::text) <= 16384);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notification_delivery_outbox"
    ADD CONSTRAINT "notification_delivery_outbox_last_error_length_check"
    CHECK ("last_error" IS NULL OR length("last_error") <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
