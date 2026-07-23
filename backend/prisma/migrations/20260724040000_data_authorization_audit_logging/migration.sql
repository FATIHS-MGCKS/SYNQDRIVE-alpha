-- Append-only lifecycle and decision audit logging (Prompt 15)

CREATE TYPE "DataAuthorizationAuditRetentionClass" AS ENUM ('STANDARD', 'EXTENDED', 'LEGAL_HOLD');
CREATE TYPE "DataAuthorizationAuditEventKind" AS ENUM ('AUTHORIZATION_DECISION', 'LIFECYCLE_CHANGE', 'REVIEW_DECISION');
CREATE TYPE "DataAuthorizationAuditOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER');

ALTER TABLE "authorization_decision_events"
  ADD COLUMN IF NOT EXISTS "policy_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "source_system" TEXT,
  ADD COLUMN IF NOT EXISTS "action" TEXT,
  ADD COLUMN IF NOT EXISTS "processor_type" TEXT,
  ADD COLUMN IF NOT EXISTS "processor_identity" TEXT,
  ADD COLUMN IF NOT EXISTS "resource_type" TEXT,
  ADD COLUMN IF NOT EXISTS "resource_reference_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "evaluated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "policy_checksum" TEXT,
  ADD COLUMN IF NOT EXISTS "resolver_version" TEXT,
  ADD COLUMN IF NOT EXISTS "engine_version" TEXT,
  ADD COLUMN IF NOT EXISTS "retention_class" "DataAuthorizationAuditRetentionClass" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "sampled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "authorization_decision_events_organization_id_correlation_id_idx"
  ON "authorization_decision_events"("organization_id", "correlation_id");

CREATE INDEX IF NOT EXISTS "authorization_decision_events_retention_class_created_at_idx"
  ON "authorization_decision_events"("retention_class", "created_at");

CREATE TABLE "data_authorization_audit_outbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "event_kind" "DataAuthorizationAuditEventKind" NOT NULL,
  "correlation_id" TEXT,
  "payload_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "processing_status" "DataAuthorizationAuditOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "dead_lettered_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_authorization_audit_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_authorization_audit_outbox_idempotency_key_key"
  ON "data_authorization_audit_outbox"("idempotency_key");

CREATE INDEX "data_authorization_audit_outbox_organization_id_idx"
  ON "data_authorization_audit_outbox"("organization_id");

CREATE INDEX "data_authorization_audit_outbox_processing_status_next_retry_at_idx"
  ON "data_authorization_audit_outbox"("processing_status", "next_retry_at");

CREATE INDEX "data_authorization_audit_outbox_organization_id_event_kind_idx"
  ON "data_authorization_audit_outbox"("organization_id", "event_kind");

CREATE INDEX "data_authorization_audit_outbox_organization_id_correlation_id_idx"
  ON "data_authorization_audit_outbox"("organization_id", "correlation_id");

ALTER TABLE "data_authorization_audit_outbox"
  ADD CONSTRAINT "data_authorization_audit_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
