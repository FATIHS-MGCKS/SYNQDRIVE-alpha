-- Outbound SMS workflow + Twilio messaging persistence

CREATE TYPE "OutboundSmsSourceType" AS ENUM ('WORKFLOW', 'MANUAL', 'WHATSAPP_FALLBACK', 'SYSTEM');
CREATE TYPE "OutboundSmsStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED', 'SENT_SIMULATED');
CREATE TYPE "OutboundSmsEventType" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED');

CREATE TABLE "org_sms_config" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "messaging_service_sid" TEXT,
  "from_phone_number_sid" TEXT,
  "from_masked_number" TEXT,
  "default_locale" TEXT NOT NULL DEFAULT 'de',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "org_sms_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_sms_config_organization_id_key" ON "org_sms_config"("organization_id");

CREATE TABLE "sms_consents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "phone_normalized" TEXT NOT NULL,
  "customer_id" TEXT,
  "opted_in_at" TIMESTAMP(3),
  "opted_out_at" TIMESTAMP(3),
  "marketing_allowed" BOOLEAN NOT NULL DEFAULT false,
  "transactional_allowed" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_consents_organization_id_phone_normalized_key" ON "sms_consents"("organization_id", "phone_normalized");
CREATE INDEX "sms_consents_organization_id_idx" ON "sms_consents"("organization_id");

CREATE TABLE "outbound_sms" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT,
  "customer_id" TEXT,
  "source_type" "OutboundSmsSourceType" NOT NULL,
  "status" "OutboundSmsStatus" NOT NULL DEFAULT 'QUEUED',
  "to_phone_normalized" TEXT NOT NULL,
  "to_phone_masked" TEXT NOT NULL,
  "from_sender_ref" TEXT,
  "body" TEXT NOT NULL,
  "template_key" TEXT,
  "template_version" TEXT,
  "locale" TEXT,
  "segment_count" INTEGER,
  "estimated_cost_usd" DECIMAL(10,6),
  "provider" TEXT,
  "provider_message_sid" TEXT,
  "send_idempotency_key" TEXT,
  "fallback_from_whatsapp_msg_id" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "sent_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbound_sms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_sms_provider_message_sid_key" ON "outbound_sms"("provider_message_sid");
CREATE UNIQUE INDEX "outbound_sms_org_send_idempotency_key" ON "outbound_sms"("organization_id", "send_idempotency_key");
CREATE INDEX "outbound_sms_organization_id_idx" ON "outbound_sms"("organization_id");
CREATE INDEX "outbound_sms_organization_id_customer_id_idx" ON "outbound_sms"("organization_id", "customer_id");
CREATE INDEX "outbound_sms_organization_id_booking_id_idx" ON "outbound_sms"("organization_id", "booking_id");
CREATE INDEX "outbound_sms_status_idx" ON "outbound_sms"("status");
CREATE INDEX "outbound_sms_created_at_idx" ON "outbound_sms"("created_at");

CREATE TABLE "outbound_sms_events" (
  "id" TEXT NOT NULL,
  "outbound_sms_id" TEXT NOT NULL,
  "event_type" "OutboundSmsEventType" NOT NULL,
  "payload" JSONB,
  "webhook_idempotency_key" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbound_sms_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_sms_events_outbound_sms_id_webhook_idempotency_key_key" ON "outbound_sms_events"("outbound_sms_id", "webhook_idempotency_key");
CREATE INDEX "outbound_sms_events_outbound_sms_id_idx" ON "outbound_sms_events"("outbound_sms_id");
CREATE INDEX "outbound_sms_events_event_type_idx" ON "outbound_sms_events"("event_type");

ALTER TABLE "org_sms_config" ADD CONSTRAINT "org_sms_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_consents" ADD CONSTRAINT "sms_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_consents" ADD CONSTRAINT "sms_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbound_sms" ADD CONSTRAINT "outbound_sms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_sms" ADD CONSTRAINT "outbound_sms_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbound_sms" ADD CONSTRAINT "outbound_sms_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbound_sms_events" ADD CONSTRAINT "outbound_sms_events_outbound_sms_id_fkey" FOREIGN KEY ("outbound_sms_id") REFERENCES "outbound_sms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "twilio_webhook_events" ADD COLUMN IF NOT EXISTS "message_sid" TEXT;
CREATE INDEX IF NOT EXISTS "twilio_webhook_events_message_sid_idx" ON "twilio_webhook_events"("message_sid");
