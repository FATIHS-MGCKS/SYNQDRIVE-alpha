-- CreateEnum
CREATE TYPE "VoiceAssistantStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "VoiceConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'DEGRADED', 'CONNECTED', 'ERROR');
CREATE TYPE "VoiceConversationDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "VoiceConversationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED');
CREATE TYPE "VoiceConversationOutcome" AS ENUM ('RESOLVED', 'ESCALATED', 'FAILED', 'ABANDONED');

-- CreateTable
CREATE TABLE "voice_assistants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'AI Assistant',
    "role" TEXT,
    "personality" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "voice_id" TEXT,
    "voice_name" TEXT,
    "greeting_message" TEXT,
    "system_prompt" TEXT,
    "company_context" TEXT,
    "business_rules" TEXT,
    "forbidden_actions" TEXT,
    "knowledge_snippets" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'elevenlabs',
    "elevenlabs_agent_id" TEXT,
    "elevenlabs_phone_number_id" TEXT,
    "phone_number_id" TEXT,
    "phone_number" TEXT,
    "connection_status" "VoiceConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "last_provisioned_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "telephony_enabled" BOOLEAN NOT NULL DEFAULT false,
    "inbound_enabled" BOOLEAN NOT NULL DEFAULT true,
    "outbound_enabled" BOOLEAN NOT NULL DEFAULT false,
    "perm_answer_questions" BOOLEAN NOT NULL DEFAULT true,
    "perm_manage_bookings" BOOLEAN NOT NULL DEFAULT false,
    "perm_create_booking_drafts" BOOLEAN NOT NULL DEFAULT false,
    "perm_cancel_bookings" BOOLEAN NOT NULL DEFAULT false,
    "perm_create_tasks" BOOLEAN NOT NULL DEFAULT false,
    "perm_workshop_handling" BOOLEAN NOT NULL DEFAULT false,
    "perm_breakdown_support" BOOLEAN NOT NULL DEFAULT false,
    "perm_contact_customers" BOOLEAN NOT NULL DEFAULT false,
    "perm_contact_vendors" BOOLEAN NOT NULL DEFAULT false,
    "perm_modify_records" BOOLEAN NOT NULL DEFAULT false,
    "perm_create_actions" BOOLEAN NOT NULL DEFAULT false,
    "perm_emergency_handling" BOOLEAN NOT NULL DEFAULT false,
    "escalation_phone" TEXT,
    "escalation_user_id" TEXT,
    "escalation_department" TEXT,
    "escalate_on_low_conf" BOOLEAN NOT NULL DEFAULT true,
    "escalate_on_sensitive" BOOLEAN NOT NULL DEFAULT true,
    "escalate_on_request" BOOLEAN NOT NULL DEFAULT true,
    "fallback_message" TEXT,
    "escalation_triggers" JSONB,
    "business_hours_start" TEXT,
    "business_hours_end" TEXT,
    "business_hours_timezone" TEXT,
    "after_hours_message" TEXT,
    "business_hours" JSONB,
    "status" "VoiceAssistantStatus" NOT NULL DEFAULT 'DRAFT',
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "answered_calls" INTEGER NOT NULL DEFAULT 0,
    "missed_calls" INTEGER NOT NULL DEFAULT 0,
    "escalated_calls" INTEGER NOT NULL DEFAULT 0,
    "total_talk_time_seconds" INTEGER NOT NULL DEFAULT 0,
    "total_talk_minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "voice_assistants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "voice_assistant_id" TEXT,
    "provider_conversation_id" TEXT,
    "elevenlabs_conv_id" TEXT,
    "provider_agent_id" TEXT,
    "caller_number" TEXT,
    "direction" "VoiceConversationDirection" NOT NULL DEFAULT 'INBOUND',
    "duration_seconds" INTEGER,
    "status" "VoiceConversationStatus" NOT NULL DEFAULT 'COMPLETED',
    "outcome" "VoiceConversationOutcome" NOT NULL DEFAULT 'RESOLVED',
    "transcript" TEXT,
    "summary" TEXT,
    "escalation_reason" TEXT,
    "actions_performed" TEXT[],
    "error_message" TEXT,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voice_assistants_organization_id_key" ON "voice_assistants"("organization_id");
CREATE INDEX "voice_assistants_status_idx" ON "voice_assistants"("status");
CREATE INDEX "voice_conversations_organization_id_started_at_idx" ON "voice_conversations"("organization_id", "started_at");
CREATE INDEX "voice_conversations_voice_assistant_id_idx" ON "voice_conversations"("voice_assistant_id");
CREATE INDEX "voice_conversations_outcome_idx" ON "voice_conversations"("outcome");
CREATE INDEX "voice_conversations_provider_conversation_id_idx" ON "voice_conversations"("provider_conversation_id");
CREATE INDEX "voice_conversations_elevenlabs_conv_id_idx" ON "voice_conversations"("elevenlabs_conv_id");

-- AddForeignKey
ALTER TABLE "voice_assistants" ADD CONSTRAINT "voice_assistants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_voice_assistant_id_fkey" FOREIGN KEY ("voice_assistant_id") REFERENCES "voice_assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
