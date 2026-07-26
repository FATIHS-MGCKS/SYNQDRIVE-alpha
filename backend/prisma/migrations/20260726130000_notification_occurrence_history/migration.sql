-- Notification Engine Remediation — Prompt 9: canonical occurrence history
--
-- Extends notification_occurrences with traceability fields, dedupe, and retention indexes.

CREATE TYPE "NotificationOccurrenceRecoveryState" AS ENUM ('ACTIVE', 'RECOVERED');

ALTER TABLE "notification_occurrences"
  RENAME COLUMN "detected_at" TO "observed_at";

ALTER TABLE "notification_occurrences"
  ADD COLUMN "source_event_id" TEXT,
  ADD COLUMN "recovery_state" "NotificationOccurrenceRecoveryState" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "correlation_id" TEXT,
  ADD COLUMN "causation_id" TEXT;

UPDATE "notification_occurrences"
SET "source_event_id" = "source_ref"
WHERE "source_event_id" IS NULL;

ALTER TABLE "notification_occurrences"
  ALTER COLUMN "source_event_id" SET NOT NULL;

CREATE UNIQUE INDEX "notification_occurrences_notification_source_event_id_key"
  ON "notification_occurrences" ("notification_id", "source_event_id");

CREATE INDEX IF NOT EXISTS "notification_occurrences_org_observed_at_idx"
  ON "notification_occurrences" ("organization_id", "observed_at");

CREATE INDEX IF NOT EXISTS "notification_occurrences_created_at_idx"
  ON "notification_occurrences" ("created_at");

DO $$ BEGIN
  ALTER TABLE "notification_occurrences"
    ADD CONSTRAINT "notification_occurrences_source_event_id_length_check"
    CHECK (length("source_event_id") <= 256);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notification_occurrences"
    ADD CONSTRAINT "notification_occurrences_correlation_id_length_check"
    CHECK ("correlation_id" IS NULL OR length("correlation_id") <= 128);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notification_occurrences"
    ADD CONSTRAINT "notification_occurrences_causation_id_length_check"
    CHECK ("causation_id" IS NULL OR length("causation_id") <= 128);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notification_occurrences"
    ADD CONSTRAINT "notification_occurrences_observed_not_before_occurred_check"
    CHECK ("observed_at" >= "occurred_at");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
