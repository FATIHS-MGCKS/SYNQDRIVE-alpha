-- Canonical workflow domain event outbox (Phase 4 Prompt 16)
-- Extends workflow_event_outbox with envelope fields and canonical status lifecycle.

CREATE TYPE "WorkflowEventOutboxStatus_new" AS ENUM (
  'PENDING',
  'CLAIMED',
  'DISPATCHED',
  'RETRY_SCHEDULED',
  'DEAD_LETTER'
);

ALTER TABLE "workflow_event_outbox" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "workflow_event_outbox"
  ALTER COLUMN "status" TYPE "WorkflowEventOutboxStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PROCESSING' THEN 'CLAIMED'::"WorkflowEventOutboxStatus_new"
      WHEN 'PROCESSED' THEN 'DISPATCHED'::"WorkflowEventOutboxStatus_new"
      ELSE "status"::text::"WorkflowEventOutboxStatus_new"
    END
  );

DROP TYPE "WorkflowEventOutboxStatus";
ALTER TYPE "WorkflowEventOutboxStatus_new" RENAME TO "WorkflowEventOutboxStatus";

ALTER TABLE "workflow_event_outbox" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Rename attempts -> attempt_count
ALTER TABLE "workflow_event_outbox" RENAME COLUMN "attempts" TO "attempt_count";

-- Rename processed_at -> dispatched_at
ALTER TABLE "workflow_event_outbox" RENAME COLUMN "processed_at" TO "dispatched_at";

-- Rename last_error -> last_error_summary
ALTER TABLE "workflow_event_outbox" RENAME COLUMN "last_error" TO "last_error_summary";

-- Add canonical envelope columns (backfill from existing rows where present)
ALTER TABLE "workflow_event_outbox" ADD COLUMN "event_id" TEXT;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "event_version" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "workflow_event_outbox" ADD COLUMN "schema_version" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "workflow_event_outbox" ADD COLUMN "entity_type" TEXT;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "entity_id" TEXT;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "causation_id" TEXT;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "source" TEXT;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "occurred_at" TIMESTAMP(3);
ALTER TABLE "workflow_event_outbox" ADD COLUMN "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "workflow_event_outbox" ADD COLUMN "envelope" JSONB;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "claimed_at" TIMESTAMP(3);
ALTER TABLE "workflow_event_outbox" ADD COLUMN "claimed_by" TEXT;
ALTER TABLE "workflow_event_outbox" ADD COLUMN "lease_expires_at" TIMESTAMP(3);
ALTER TABLE "workflow_event_outbox" ADD COLUMN "last_error_code" TEXT;

-- Backfill event_id from idempotency_key or row id for any legacy rows
UPDATE "workflow_event_outbox"
SET
  "event_id" = COALESCE(NULLIF("idempotency_key", ''), "id"),
  "occurred_at" = COALESCE("occurred_at", "created_at"),
  "received_at" = COALESCE("received_at", "created_at"),
  "source" = COALESCE("source", 'legacy'),
  "correlation_id" = COALESCE("correlation_id", "idempotency_key", "id"),
  "envelope" = jsonb_build_object(
    'eventId', COALESCE(NULLIF("idempotency_key", ''), "id"),
    'eventType', "event_type",
    'eventVersion', '1.0.0',
    'organizationId', "organization_id",
    'occurredAt', to_char(COALESCE("occurred_at", "created_at"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'receivedAt', to_char(COALESCE("received_at", "created_at"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'entityType', "aggregate_type",
    'entityId', "aggregate_id",
    'correlationId', COALESCE("correlation_id", "idempotency_key", "id"),
    'causationId', NULL,
    'source', COALESCE("source", 'legacy'),
    'payload', "payload",
    'metadata', '{}'::jsonb,
    'schemaVersion', '1.0.0'
  )
WHERE "event_id" IS NULL;

ALTER TABLE "workflow_event_outbox" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "workflow_event_outbox" ALTER COLUMN "occurred_at" SET NOT NULL;
ALTER TABLE "workflow_event_outbox" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "workflow_event_outbox" ALTER COLUMN "correlation_id" SET NOT NULL;
ALTER TABLE "workflow_event_outbox" ALTER COLUMN "envelope" SET NOT NULL;

CREATE UNIQUE INDEX "workflow_event_outbox_event_id_key" ON "workflow_event_outbox"("event_id");

CREATE INDEX "workflow_event_outbox_org_created_idx" ON "workflow_event_outbox"("organization_id", "created_at");
