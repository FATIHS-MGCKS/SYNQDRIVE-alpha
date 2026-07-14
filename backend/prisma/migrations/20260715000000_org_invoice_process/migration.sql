-- Invoice process outbox + reconciliation (V4.9.441)

CREATE TYPE "OrgInvoiceProcessType" AS ENUM (
  'BOOKING_INVOICE_CREATE',
  'BOOKING_FINANCE_SYNC',
  'INVOICE_DOCUMENT_GENERATE',
  'DOCUMENT_STORE',
  'INVOICE_DOCUMENT_LINK',
  'INVOICE_EMAIL_SEND',
  'PROVIDER_STATUS_SYNC',
  'PAYMENT_SYNC',
  'LINKED_TASK_UPDATE'
);

CREATE TYPE "OrgInvoiceProcessStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'RETRY_SCHEDULED',
  'MANUAL_REVIEW'
);

CREATE TYPE "OrgInvoiceProcessEntityType" AS ENUM (
  'BOOKING',
  'INVOICE',
  'DOCUMENT',
  'OUTBOUND_EMAIL',
  'TASK'
);

CREATE TABLE "org_invoice_processes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "process_type" "OrgInvoiceProcessType" NOT NULL,
  "entity_type" "OrgInvoiceProcessEntityType" NOT NULL,
  "entity_id" TEXT NOT NULL,
  "status" "OrgInvoiceProcessStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "next_retry_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "correlation_id" TEXT,
  "payload_json" JSONB,
  "idempotency_key" TEXT NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "org_invoice_processes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_invoice_processes_organization_id_idempotency_key_key"
  ON "org_invoice_processes"("organization_id", "idempotency_key");

CREATE INDEX "org_invoice_processes_status_next_retry_at_idx"
  ON "org_invoice_processes"("status", "next_retry_at");

CREATE INDEX "org_invoice_processes_organization_id_status_idx"
  ON "org_invoice_processes"("organization_id", "status");

CREATE INDEX "org_invoice_processes_entity_type_entity_id_idx"
  ON "org_invoice_processes"("entity_type", "entity_id");

CREATE INDEX "org_invoice_processes_process_type_status_idx"
  ON "org_invoice_processes"("process_type", "status");

ALTER TABLE "org_invoice_processes"
  ADD CONSTRAINT "org_invoice_processes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_invoice_processes"
  ADD CONSTRAINT "org_invoice_processes_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
