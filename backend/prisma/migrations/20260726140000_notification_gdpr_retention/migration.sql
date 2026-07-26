-- Notification engine GDPR retention metadata (V4.9.873)

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "retention_class" TEXT NOT NULL DEFAULT 'ACTIVE_OPERATIONAL',
  ADD COLUMN IF NOT EXISTS "legal_hold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "legal_hold_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "legal_hold_set_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletion_eligible_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "anonymized_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "notifications_org_retention_eligible_idx"
  ON "notifications" ("organization_id", "retention_class", "deletion_eligible_at");

CREATE INDEX IF NOT EXISTS "notifications_org_legal_hold_idx"
  ON "notifications" ("organization_id", "legal_hold");

CREATE TABLE IF NOT EXISTS "notification_retention_purge_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "trigger" TEXT NOT NULL,
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL,
  "correlation_id" TEXT,
  "report" JSONB NOT NULL DEFAULT '{}',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "notification_retention_purge_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_retention_purge_runs_org_started_idx"
  ON "notification_retention_purge_runs" ("organization_id", "started_at");

ALTER TABLE "notification_retention_purge_runs"
  ADD CONSTRAINT "notification_retention_purge_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
