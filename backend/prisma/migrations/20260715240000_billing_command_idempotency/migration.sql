-- Prompt 18: billing command inbox + enriched audit trail for idempotent mutations.

CREATE TYPE "BillingCommandStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "billing_audit_logs"
  ADD COLUMN IF NOT EXISTS "request_id" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "changed_fields_json" JSONB;

CREATE INDEX IF NOT EXISTS "billing_audit_logs_idempotency_key_idx"
  ON "billing_audit_logs"("idempotency_key");

CREATE TABLE "billing_commands" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "command_type" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "request_payload" JSONB NOT NULL,
  "actor_user_id" TEXT,
  "request_id" TEXT,
  "status" "BillingCommandStatus" NOT NULL DEFAULT 'PENDING',
  "result_reference" TEXT,
  "result_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "aggregate_id" TEXT,
  "lock_version" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),

  CONSTRAINT "billing_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_commands_organization_id_idempotency_key_key"
  ON "billing_commands"("organization_id", "idempotency_key");

CREATE INDEX "billing_commands_organization_id_command_type_created_at_idx"
  ON "billing_commands"("organization_id", "command_type", "created_at");

CREATE INDEX "billing_commands_status_created_at_idx"
  ON "billing_commands"("status", "created_at");

CREATE INDEX "billing_commands_aggregate_id_idx"
  ON "billing_commands"("aggregate_id");

ALTER TABLE "billing_commands"
  ADD CONSTRAINT "billing_commands_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
