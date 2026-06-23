-- WhatsApp AI Router: suggestions persistence + conversation intent hint

CREATE TYPE "WhatsAppAiIntent" AS ENUM (
  'GENERAL',
  'BOOKING_STATUS',
  'BOOKING_CHANGE',
  'PICKUP_INFO',
  'RETURN_INFO',
  'DOCUMENTS',
  'PAYMENT',
  'DEPOSIT',
  'DAMAGE',
  'ACCIDENT',
  'VEHICLE_STATUS',
  'VEHICLE_WARNING',
  'LOCATION',
  'SUPPORT',
  'COMPLAINT',
  'OPT_OUT',
  'UNKNOWN'
);

CREATE TYPE "WhatsAppAiDecision" AS ENUM (
  'SUGGEST_ONLY',
  'AUTO_ALLOWED',
  'HUMAN_REQUIRED'
);

ALTER TABLE "whatsapp_conversations" ADD COLUMN "last_detected_intent" TEXT;

CREATE TABLE "whatsapp_ai_suggestions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "trigger_message_id" TEXT,
  "suggested_reply" TEXT NOT NULL,
  "intent" "WhatsAppAiIntent" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "risk_flags" JSONB NOT NULL DEFAULT '[]',
  "used_tools" JSONB NOT NULL DEFAULT '[]',
  "source_context_ids" JSONB,
  "decision" "WhatsAppAiDecision" NOT NULL,
  "human_reason" TEXT,
  "approved_by_user_id" TEXT,
  "sent_message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_ai_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_ai_suggestions_sent_message_id_key" ON "whatsapp_ai_suggestions"("sent_message_id");
CREATE INDEX "whatsapp_ai_suggestions_organization_id_conversation_id_created_at_idx" ON "whatsapp_ai_suggestions"("organization_id", "conversation_id", "created_at");
CREATE INDEX "whatsapp_ai_suggestions_conversation_id_idx" ON "whatsapp_ai_suggestions"("conversation_id");

ALTER TABLE "whatsapp_ai_suggestions" ADD CONSTRAINT "whatsapp_ai_suggestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_ai_suggestions" ADD CONSTRAINT "whatsapp_ai_suggestions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_ai_suggestions" ADD CONSTRAINT "whatsapp_ai_suggestions_trigger_message_id_fkey" FOREIGN KEY ("trigger_message_id") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_ai_suggestions" ADD CONSTRAINT "whatsapp_ai_suggestions_sent_message_id_fkey" FOREIGN KEY ("sent_message_id") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
