-- Notification Engine Remediation — Prompt 10: per-user receipt state separation
--
-- Adds personal lastSeenAt; reinforces org+user receipt scoping.

ALTER TABLE "notification_receipts"
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "notification_receipts_org_user_last_seen_idx"
  ON "notification_receipts" ("organization_id", "user_id", "last_seen_at");

DO $$ BEGIN
  ALTER TABLE "notification_receipts"
    ADD CONSTRAINT "notification_receipts_snooze_after_read_check"
    CHECK ("snoozed_until" IS NULL OR "read_at" IS NULL OR "snoozed_until" >= "read_at");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
