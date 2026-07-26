-- Notification-scoped workflow idempotency (Prompt 24)

ALTER TABLE "org_workflow_runs"
  ADD COLUMN IF NOT EXISTS "notification_id" TEXT,
  ADD COLUMN IF NOT EXISTS "notification_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "notification_generation" INTEGER,
  ADD COLUMN IF NOT EXISTS "trigger_event_id" TEXT,
  ADD COLUMN IF NOT EXISTS "correlation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "causation_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_workflow_runs_organization_id_notification_id_idx"
  ON "org_workflow_runs"("organization_id", "notification_id");

ALTER TABLE "org_workflow_action_runs"
  ADD COLUMN IF NOT EXISTS "action_definition_id" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "notification_id" TEXT,
  ADD COLUMN IF NOT EXISTS "notification_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "notification_generation" INTEGER,
  ADD COLUMN IF NOT EXISTS "trigger_event_id" TEXT,
  ADD COLUMN IF NOT EXISTS "correlation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "causation_id" TEXT;

UPDATE "org_workflow_action_runs"
SET "idempotency_key" = 'legacy:' || "id"
WHERE "idempotency_key" IS NULL;

ALTER TABLE "org_workflow_action_runs"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "org_workflow_action_runs_organization_id_idempotency_key_key"
  ON "org_workflow_action_runs"("organization_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "org_workflow_action_runs_organization_id_notification_id_idx"
  ON "org_workflow_action_runs"("organization_id", "notification_id");
