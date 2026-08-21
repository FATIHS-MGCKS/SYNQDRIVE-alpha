-- Communication Center C5.1 — native SMS persistence foundation
-- Additive only. Rollback: drop sms_* tables + enums.

CREATE TYPE "SmsConversationStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TYPE "SmsMessageDeliveryStatus" AS ENUM (
  'PENDING',
  'DISPATCHING',
  'DISPATCH_AMBIGUOUS',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'BLOCKED'
);

CREATE TABLE "org_sms_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "api_key_configured" BOOLEAN NOT NULL DEFAULT false,
    "webhook_signing_secret_configured" BOOLEAN NOT NULL DEFAULT false,
    "sent_dm_account_id" TEXT,
    "webhook_endpoint_id" TEXT,
    "sender_profile_id" TEXT,
    "last_webhook_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_sms_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sms_conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_phone_normalized" TEXT NOT NULL,
    "contact_name" TEXT,
    "customer_id" TEXT,
    "booking_id" TEXT,
    "vehicle_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "last_customer_message_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "status" "SmsConversationStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sms_conversations_unread_count_check" CHECK ("unread_count" >= 0)
);

CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "business_operation_id" TEXT NOT NULL,
    "provider_status" TEXT,
    "status" "SmsMessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "dispatch_attempted_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sms_messages_direction_check" CHECK ("direction" IN ('incoming', 'outgoing')),
    CONSTRAINT "sms_messages_sender_type_check" CHECK ("sender_type" IN ('customer', 'user', 'system', 'ai_agent'))
);

CREATE TABLE "sms_webhook_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "webhook_endpoint_id" TEXT,
    "external_event_id" TEXT NOT NULL,
    "event_type" TEXT,
    "signature_valid" BOOLEAN,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_sms_configs_organization_id_key" ON "org_sms_configs"("organization_id");
CREATE UNIQUE INDEX "org_sms_configs_sent_dm_account_id_key" ON "org_sms_configs"("sent_dm_account_id");
CREATE UNIQUE INDEX "org_sms_configs_webhook_endpoint_id_key" ON "org_sms_configs"("webhook_endpoint_id");

CREATE UNIQUE INDEX "sms_conversations_organization_id_contact_phone_normalized_key" ON "sms_conversations"("organization_id", "contact_phone_normalized");
CREATE INDEX "sms_conversations_organization_id_idx" ON "sms_conversations"("organization_id");
CREATE INDEX "sms_conversations_organization_id_customer_id_idx" ON "sms_conversations"("organization_id", "customer_id");
CREATE INDEX "sms_conversations_organization_id_booking_id_idx" ON "sms_conversations"("organization_id", "booking_id");
CREATE INDEX "sms_conversations_last_message_at_idx" ON "sms_conversations"("last_message_at");

CREATE UNIQUE INDEX "sms_messages_provider_message_id_key" ON "sms_messages"("provider_message_id");
CREATE UNIQUE INDEX "sms_messages_organization_id_business_operation_id_key" ON "sms_messages"("organization_id", "business_operation_id");
CREATE INDEX "sms_messages_conversation_id_created_at_idx" ON "sms_messages"("conversation_id", "created_at");
CREATE INDEX "sms_messages_organization_id_idx" ON "sms_messages"("organization_id");

CREATE UNIQUE INDEX "sms_webhook_events_external_event_id_key" ON "sms_webhook_events"("external_event_id");
CREATE INDEX "sms_webhook_events_organization_id_created_at_idx" ON "sms_webhook_events"("organization_id", "created_at");
CREATE INDEX "sms_webhook_events_webhook_endpoint_id_idx" ON "sms_webhook_events"("webhook_endpoint_id");

ALTER TABLE "org_sms_configs" ADD CONSTRAINT "org_sms_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "sms_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sms_webhook_events" ADD CONSTRAINT "sms_webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
