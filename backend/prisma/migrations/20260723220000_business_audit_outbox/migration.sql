-- CreateEnum
CREATE TYPE "BusinessAuditOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "business_audit_outbox" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "before_hash" TEXT,
    "before_summary" TEXT,
    "after_hash" TEXT,
    "after_summary" TEXT,
    "change_reason" TEXT,
    "outcome" TEXT,
    "diff_ref" TEXT,
    "payload" JSONB NOT NULL,
    "processing_status" "BusinessAuditOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "dead_lettered_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_audit_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_audit_outbox_event_id_key" ON "business_audit_outbox"("event_id");
CREATE UNIQUE INDEX "business_audit_outbox_idempotency_key_key" ON "business_audit_outbox"("idempotency_key");
CREATE INDEX "business_audit_outbox_organization_id_idx" ON "business_audit_outbox"("organization_id");
CREATE INDEX "business_audit_outbox_processing_status_next_retry_at_idx" ON "business_audit_outbox"("processing_status", "next_retry_at");
CREATE INDEX "business_audit_outbox_organization_id_action_idx" ON "business_audit_outbox"("organization_id", "action");
CREATE INDEX "business_audit_outbox_organization_id_entity_type_entity_id_idx" ON "business_audit_outbox"("organization_id", "entity_type", "entity_id");
CREATE INDEX "business_audit_outbox_organization_id_correlation_id_idx" ON "business_audit_outbox"("organization_id", "correlation_id");

ALTER TABLE "business_audit_outbox"
    ADD CONSTRAINT "business_audit_outbox_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
