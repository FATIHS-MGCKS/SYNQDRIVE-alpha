-- CreateEnum
CREATE TYPE "AiRequestAuditEventKind" AS ENUM ('REQUEST', 'TOOL');

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'EXECUTE';

-- AlterEnum
ALTER TYPE "ActivityEntity" ADD VALUE 'AI_ASSISTANT';

-- CreateTable
CREATE TABLE "ai_request_audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_kind" "AiRequestAuditEventKind" NOT NULL,
    "user_id" TEXT,
    "user_id_ref" TEXT NOT NULL,
    "membership_role" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "primary_intent" TEXT,
    "detected_intents" JSONB NOT NULL DEFAULT '[]',
    "resolved_vehicle_id" TEXT,
    "resolved_vehicle_ref" JSONB,
    "tools_used" JSONB NOT NULL DEFAULT '[]',
    "data_sources" JSONB NOT NULL DEFAULT '[]',
    "tool_durations" JSONB NOT NULL DEFAULT '[]',
    "error_codes" JSONB NOT NULL DEFAULT '[]',
    "response_type" TEXT,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "result_complete" BOOLEAN NOT NULL DEFAULT true,
    "data_classification" TEXT NOT NULL DEFAULT 'internal',
    "model_provider" TEXT,
    "model_name" TEXT,
    "token_usage" JSONB,
    "llm_used" BOOLEAN NOT NULL DEFAULT false,
    "performance" JSONB,
    "security_flags" JSONB NOT NULL DEFAULT '[]',
    "tool_name" TEXT,
    "tool_decision" TEXT,
    "tool_duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_request_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_request_audit_logs_organization_id_created_at_idx" ON "ai_request_audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_request_audit_logs_organization_id_correlation_id_idx" ON "ai_request_audit_logs"("organization_id", "correlation_id");

-- CreateIndex
CREATE INDEX "ai_request_audit_logs_correlation_id_idx" ON "ai_request_audit_logs"("correlation_id");

-- AddForeignKey
ALTER TABLE "ai_request_audit_logs" ADD CONSTRAINT "ai_request_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
