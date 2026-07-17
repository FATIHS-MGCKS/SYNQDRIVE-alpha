-- Voice webhook ingestion correlation + lifecycle state (Prompt 7A)

-- Extend provider enum for MCP/internal ingress
ALTER TYPE "VoiceControlPlaneProvider" ADD VALUE IF NOT EXISTS 'MCP';
ALTER TYPE "VoiceControlPlaneProvider" ADD VALUE IF NOT EXISTS 'INTERNAL';

-- Webhook processing status extensions
ALTER TYPE "VoiceProviderWebhookProcessingStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "VoiceProviderWebhookProcessingStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

-- New enums
CREATE TYPE "VoiceWebhookErrorClass" AS ENUM (
  'SIGNATURE_INVALID',
  'PAYLOAD_INVALID',
  'PAYLOAD_TOO_LARGE',
  'CORRELATION_MISSING',
  'TENANT_MISMATCH',
  'DOMAIN_ERROR',
  'POISON',
  'UNKNOWN'
);

CREATE TYPE "VoiceConversationLifecycleState" AS ENUM (
  'CREATED',
  'QUEUED',
  'INITIATED',
  'RINGING',
  'CONNECTED',
  'AI_ACTIVE',
  'TRANSFERRING',
  'COMPLETED',
  'PROCESSING',
  'FINALIZED',
  'FAILED',
  'CANCELLED'
);

-- Conversation lifecycle column
ALTER TABLE "voice_conversations"
  ADD COLUMN IF NOT EXISTS "lifecycle_state" "VoiceConversationLifecycleState" NOT NULL DEFAULT 'CREATED';

CREATE INDEX IF NOT EXISTS "voice_conversations_lifecycle_state_idx"
  ON "voice_conversations" ("lifecycle_state");

-- Webhook event correlation columns
ALTER TABLE "voice_provider_webhook_events"
  ADD COLUMN IF NOT EXISTS "error_class" "VoiceWebhookErrorClass",
  ADD COLUMN IF NOT EXISTS "voice_conversation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "twilio_call_sid" TEXT,
  ADD COLUMN IF NOT EXISTS "elevenlabs_conversation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "agent_deployment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "phone_number_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "booking_id" TEXT;

CREATE INDEX IF NOT EXISTS "voice_provider_webhook_events_voice_conversation_id_idx"
  ON "voice_provider_webhook_events" ("voice_conversation_id");
CREATE INDEX IF NOT EXISTS "voice_provider_webhook_events_twilio_call_sid_idx"
  ON "voice_provider_webhook_events" ("twilio_call_sid");
CREATE INDEX IF NOT EXISTS "voice_provider_webhook_events_elevenlabs_conversation_id_idx"
  ON "voice_provider_webhook_events" ("elevenlabs_conversation_id");

ALTER TABLE "voice_provider_webhook_events"
  ADD CONSTRAINT "voice_provider_webhook_events_voice_conversation_id_fkey"
  FOREIGN KEY ("voice_conversation_id") REFERENCES "voice_conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
