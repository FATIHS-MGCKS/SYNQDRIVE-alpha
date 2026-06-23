-- WhatsApp Business Platform: provider fields, delivery status, webhooks, consent, templates

CREATE TYPE "WhatsAppProviderStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'CONNECTED', 'ERROR');
CREATE TYPE "WhatsAppMessageDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('OPEN', 'PENDING_HUMAN', 'CLOSED');
CREATE TYPE "WhatsAppTemplateCategory" AS ENUM (
  'BOOKING_CONFIRMATION', 'PICKUP_REMINDER', 'RETURN_REMINDER', 'MISSING_DOCUMENTS',
  'PAYMENT_REMINDER', 'DEPOSIT_REMINDER', 'DAMAGE_FOLLOWUP', 'HANDOVER_LINK',
  'RETURN_LINK', 'SUPPORT_UPDATE', 'VEHICLE_READY'
);
CREATE TYPE "WhatsAppTemplateProviderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISABLED');

ALTER TABLE "org_whatsapp_configs"
  ADD COLUMN "phone_number_id" TEXT,
  ADD COLUMN "waba_id" TEXT,
  ADD COLUMN "provider_status" "WhatsAppProviderStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN "webhook_verify_token" TEXT,
  ADD COLUMN "app_secret_configured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "access_token_configured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "meta_api_version" TEXT NOT NULL DEFAULT 'v21.0',
  ADD COLUMN "last_webhook_at" TIMESTAMP(3),
  ADD COLUMN "service_window_open" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "org_whatsapp_configs_phone_number_id_idx" ON "org_whatsapp_configs"("phone_number_id");

ALTER TABLE "whatsapp_conversations"
  ADD COLUMN "contact_phone_normalized" TEXT,
  ADD COLUMN "phone_number_id" TEXT,
  ADD COLUMN "customer_id" TEXT,
  ADD COLUMN "booking_id" TEXT,
  ADD COLUMN "vehicle_id" TEXT,
  ADD COLUMN "last_customer_message_at" TIMESTAMP(3);

UPDATE "whatsapp_conversations"
SET "contact_phone_normalized" = regexp_replace("contact_phone", '[^0-9]', '', 'g')
WHERE "contact_phone_normalized" IS NULL;

ALTER TABLE "whatsapp_conversations"
  ALTER COLUMN "contact_phone_normalized" SET NOT NULL;

ALTER TABLE "whatsapp_conversations"
  DROP CONSTRAINT IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key";

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_organization_id_contact_phone_normalized_key"
    UNIQUE ("organization_id", "contact_phone_normalized");

ALTER TABLE "whatsapp_conversations"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "whatsapp_conversations"
  ALTER COLUMN "status" TYPE "WhatsAppConversationStatus"
  USING CASE
    WHEN lower("status") IN ('closed') THEN 'CLOSED'::"WhatsAppConversationStatus"
    WHEN lower("status") IN ('pending_human', 'pending') THEN 'PENDING_HUMAN'::"WhatsAppConversationStatus"
    ELSE 'OPEN'::"WhatsAppConversationStatus"
  END;

ALTER TABLE "whatsapp_conversations"
  ALTER COLUMN "status" SET DEFAULT 'OPEN';

CREATE INDEX "whatsapp_conversations_organization_id_customer_id_idx" ON "whatsapp_conversations"("organization_id", "customer_id");
CREATE INDEX "whatsapp_conversations_organization_id_booking_id_idx" ON "whatsapp_conversations"("organization_id", "booking_id");

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_conversations_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_conversations_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages"
  ADD COLUMN "message_type" TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN "template_name" TEXT,
  ADD COLUMN "provider_message_id" TEXT,
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "failure_reason" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "whatsapp_messages" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "whatsapp_messages"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "whatsapp_messages"
  ALTER COLUMN "status" TYPE "WhatsAppMessageDeliveryStatus"
  USING CASE upper("status")
    WHEN 'DELIVERED' THEN 'DELIVERED'::"WhatsAppMessageDeliveryStatus"
    WHEN 'READ' THEN 'READ'::"WhatsAppMessageDeliveryStatus"
    WHEN 'FAILED' THEN 'FAILED'::"WhatsAppMessageDeliveryStatus"
    WHEN 'QUEUED' THEN 'QUEUED'::"WhatsAppMessageDeliveryStatus"
    ELSE 'SENT'::"WhatsAppMessageDeliveryStatus"
  END;

ALTER TABLE "whatsapp_messages"
  ALTER COLUMN "status" SET DEFAULT 'QUEUED';

CREATE UNIQUE INDEX "whatsapp_messages_provider_message_id_key" ON "whatsapp_messages"("provider_message_id");
CREATE UNIQUE INDEX "whatsapp_messages_idempotency_key_key" ON "whatsapp_messages"("idempotency_key");
CREATE INDEX "whatsapp_messages_provider_message_id_idx" ON "whatsapp_messages"("provider_message_id");

CREATE TABLE "whatsapp_webhook_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "phone_number_id" TEXT,
  "external_event_id" TEXT NOT NULL,
  "event_type" TEXT,
  "payload" JSONB NOT NULL,
  "headers" JSONB,
  "signature_valid" BOOLEAN,
  "processed_at" TIMESTAMP(3),
  "processing_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_webhook_events_external_event_id_key" ON "whatsapp_webhook_events"("external_event_id");
CREATE INDEX "whatsapp_webhook_events_organization_id_created_at_idx" ON "whatsapp_webhook_events"("organization_id", "created_at");
CREATE INDEX "whatsapp_webhook_events_phone_number_id_idx" ON "whatsapp_webhook_events"("phone_number_id");

ALTER TABLE "whatsapp_webhook_events"
  ADD CONSTRAINT "whatsapp_webhook_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "whatsapp_consents" (
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
  CONSTRAINT "whatsapp_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_consents_organization_id_phone_normalized_key" ON "whatsapp_consents"("organization_id", "phone_normalized");
CREATE INDEX "whatsapp_consents_organization_id_customer_id_idx" ON "whatsapp_consents"("organization_id", "customer_id");

ALTER TABLE "whatsapp_consents"
  ADD CONSTRAINT "whatsapp_consents_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "whatsapp_consents_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "whatsapp_templates" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'de',
  "category" "WhatsAppTemplateCategory" NOT NULL,
  "body_template" TEXT NOT NULL,
  "variable_schema" JSONB,
  "provider_status" "WhatsAppTemplateProviderStatus" NOT NULL DEFAULT 'DRAFT',
  "provider_template_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_templates_organization_id_name_language_key" ON "whatsapp_templates"("organization_id", "name", "language");
CREATE INDEX "whatsapp_templates_organization_id_category_idx" ON "whatsapp_templates"("organization_id", "category");

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
