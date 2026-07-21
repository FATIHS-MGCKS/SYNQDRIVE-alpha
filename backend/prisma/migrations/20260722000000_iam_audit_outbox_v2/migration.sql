-- Extend IAM audit outbox for transactional critical-access auditing (Prompt 16)

ALTER TYPE "IamAuditOutboxStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "iam_audit_outbox"
  ADD COLUMN IF NOT EXISTS "event_id" TEXT,
  ADD COLUMN IF NOT EXISTS "actor_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "subject_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "membership_id" TEXT,
  ADD COLUMN IF NOT EXISTS "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "payload_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "before_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "before_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "after_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "after_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "dead_lettered_at" TIMESTAMP(3);

UPDATE "iam_audit_outbox"
SET "event_id" = "id"
WHERE "event_id" IS NULL;

ALTER TABLE "iam_audit_outbox"
  ALTER COLUMN "event_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "iam_audit_outbox_event_id_key" ON "iam_audit_outbox"("event_id");

ALTER TABLE "iam_audit_outbox" RENAME COLUMN "audit_action" TO "event_type";

UPDATE "iam_audit_outbox"
SET
  "actor_user_id" = COALESCE("actor_user_id", NULLIF(payload->>'actorUserId', '')),
  "subject_user_id" = COALESCE(
    "subject_user_id",
    NULLIF(payload->>'targetUserId', ''),
    NULLIF(payload->>'subjectUserId', '')
  ),
  "occurred_at" = COALESCE("occurred_at", "created_at")
WHERE payload IS NOT NULL;

DROP INDEX IF EXISTS "iam_audit_outbox_status_created_at_idx";
CREATE INDEX IF NOT EXISTS "iam_audit_outbox_status_next_retry_at_idx"
  ON "iam_audit_outbox"("status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "iam_audit_outbox_organization_id_event_type_idx"
  ON "iam_audit_outbox"("organization_id", "event_type");
