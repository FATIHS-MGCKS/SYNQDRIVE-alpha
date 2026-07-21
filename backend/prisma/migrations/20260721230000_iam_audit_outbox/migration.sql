CREATE TYPE "IamAuditOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSED',
  'DEAD_LETTER'
);

CREATE TABLE "iam_audit_outbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "audit_action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "IamAuditOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "processed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "iam_audit_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "iam_audit_outbox_idempotency_key_key" ON "iam_audit_outbox"("idempotency_key");
CREATE INDEX "iam_audit_outbox_organization_id_idx" ON "iam_audit_outbox"("organization_id");
CREATE INDEX "iam_audit_outbox_status_created_at_idx" ON "iam_audit_outbox"("status", "created_at");

ALTER TABLE "iam_audit_outbox"
  ADD CONSTRAINT "iam_audit_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
