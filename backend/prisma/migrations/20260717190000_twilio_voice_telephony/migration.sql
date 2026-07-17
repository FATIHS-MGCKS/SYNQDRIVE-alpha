-- Twilio PSTN telephony groundwork for Voice Assistant

CREATE TYPE "VoicePstnProvider" AS ENUM ('ELEVENLABS', 'TWILIO');

ALTER TABLE "voice_assistants"
  ADD COLUMN "pstn_provider" "VoicePstnProvider" NOT NULL DEFAULT 'ELEVENLABS',
  ADD COLUMN "twilio_phone_number_sid" TEXT;

ALTER TABLE "voice_conversations"
  ADD COLUMN "twilio_call_sid" TEXT;

CREATE INDEX "voice_conversations_twilio_call_sid_idx" ON "voice_conversations"("twilio_call_sid");

CREATE TABLE "twilio_webhook_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "call_sid" TEXT,
  "external_event_id" TEXT NOT NULL,
  "event_type" TEXT,
  "payload" JSONB NOT NULL,
  "headers" JSONB,
  "signature_valid" BOOLEAN,
  "processed_at" TIMESTAMP(3),
  "processing_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "twilio_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "twilio_webhook_events_external_event_id_key" ON "twilio_webhook_events"("external_event_id");
CREATE INDEX "twilio_webhook_events_organization_id_created_at_idx" ON "twilio_webhook_events"("organization_id", "created_at");
CREATE INDEX "twilio_webhook_events_call_sid_idx" ON "twilio_webhook_events"("call_sid");

ALTER TABLE "twilio_webhook_events"
  ADD CONSTRAINT "twilio_webhook_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
