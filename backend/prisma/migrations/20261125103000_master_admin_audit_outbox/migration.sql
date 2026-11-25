-- USR-P1A: platform-scoped master admin audit outbox + delivery ledger (no tenant FK).

CREATE TYPE "MasterAdminAuditOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD_LETTER');

CREATE TYPE "MasterAdminAuditScope" AS ENUM ('PLATFORM', 'ORGANIZATION_CONTEXT');

CREATE TABLE "master_admin_audit_outbox" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "audit_scope" "MasterAdminAuditScope" NOT NULL DEFAULT 'PLATFORM',
    "organization_context_id" TEXT,
    "actor_user_id" TEXT,
    "subject_user_id" TEXT,
    "audit_action" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "processing_status" "MasterAdminAuditOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "dead_lettered_at" TIMESTAMP(3),
    "error_code" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_admin_audit_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_admin_audit_outbox_event_id_key" ON "master_admin_audit_outbox"("event_id");
CREATE UNIQUE INDEX "master_admin_audit_outbox_idempotency_key_key" ON "master_admin_audit_outbox"("idempotency_key");
CREATE INDEX "master_admin_audit_outbox_status_next_retry_at_idx" ON "master_admin_audit_outbox"("processing_status", "next_retry_at");
CREATE INDEX "master_admin_audit_outbox_audit_scope_audit_action_idx" ON "master_admin_audit_outbox"("audit_scope", "audit_action");

CREATE TABLE "master_admin_audit_delivery_ledger" (
    "idempotency_key" TEXT NOT NULL,
    "activity_log_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_admin_audit_delivery_ledger_pkey" PRIMARY KEY ("idempotency_key")
);