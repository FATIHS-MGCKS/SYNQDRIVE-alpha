-- Occurrence- and action-based workflow idempotency (Phase 6 Prompt 29)

ALTER TABLE "workflow_runs"
  ADD COLUMN IF NOT EXISTS "occurrence_id" TEXT,
  ADD COLUMN IF NOT EXISTS "event_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_runs_org_version_occurrence_key"
  ON "workflow_runs" ("organization_id", "workflow_version_id", "occurrence_id")
  WHERE "occurrence_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "workflow_runs_event_id_idx" ON "workflow_runs" ("event_id");

ALTER TABLE "workflow_action_runs"
  ADD COLUMN IF NOT EXISTS "occurrence_id" TEXT,
  ADD COLUMN IF NOT EXISTS "action_stable_id" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_action_runs_occurrence_action_key"
  ON "workflow_action_runs" ("organization_id", "workflow_version_id", "action_stable_id", "occurrence_id")
  WHERE "occurrence_id" IS NOT NULL AND "action_stable_id" IS NOT NULL;

ALTER TABLE "workflow_event_outbox"
  ADD COLUMN IF NOT EXISTS "occurrence_id" TEXT;

CREATE INDEX IF NOT EXISTS "workflow_event_outbox_org_occurrence_idx"
  ON "workflow_event_outbox" ("organization_id", "occurrence_id");

CREATE TABLE IF NOT EXISTS "workflow_idempotency_decisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "occurrence_id" TEXT,
  "event_id" TEXT,
  "correlation_id" TEXT,
  "causation_id" TEXT,
  "workflow_run_id" TEXT,
  "action_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_idempotency_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_idempotency_decisions_org_entity_scope_created_idx"
  ON "workflow_idempotency_decisions" ("organization_id", "entity_type", "scope_key", "created_at");

CREATE INDEX IF NOT EXISTS "workflow_idempotency_decisions_org_occurrence_idx"
  ON "workflow_idempotency_decisions" ("organization_id", "occurrence_id");

ALTER TABLE "workflow_idempotency_decisions"
  ADD CONSTRAINT "workflow_idempotency_decisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
