-- Task automation outbox — durable idempotent retries for optional task side-effects

CREATE TYPE "TaskAutomationOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'DEAD_LETTER'
);

CREATE TYPE "TaskAutomationEntityType" AS ENUM (
  'BOOKING',
  'INVOICE',
  'VEHICLE',
  'DOCUMENT',
  'VENDOR',
  'INSIGHT'
);

CREATE TABLE "task_automation_outbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "rule_version" INTEGER NOT NULL,
  "entity_type" "TaskAutomationEntityType" NOT NULL,
  "entity_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "TaskAutomationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "processed_at" TIMESTAMP(3),

  CONSTRAINT "task_automation_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_automation_outbox_idempotency_key_key" ON "task_automation_outbox"("idempotency_key");
CREATE INDEX "task_automation_outbox_organization_id_idx" ON "task_automation_outbox"("organization_id");
CREATE INDEX "task_automation_outbox_status_available_at_idx" ON "task_automation_outbox"("status", "available_at");

ALTER TABLE "task_automation_outbox"
  ADD CONSTRAINT "task_automation_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
