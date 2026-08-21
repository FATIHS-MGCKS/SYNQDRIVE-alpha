-- Communication Center C1 — canonical persistence foundation (additive only).
-- No data backfill; provider-native tables unchanged.

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('WHATSAPP', 'VOICE', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "CommunicationConversationStatus" AS ENUM ('AI_ACTIVE', 'WAITING_CUSTOMER', 'HUMAN_REQUIRED', 'HUMAN_ACTIVE', 'RESOLVED', 'FAILED');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CommunicationActorType" AS ENUM ('CUSTOMER', 'AI_AGENT', 'USER', 'SYSTEM', 'PROVIDER');

-- CreateEnum
CREATE TYPE "CommunicationProviderIdentity" AS ENUM ('META_WHATSAPP', 'SENT_DM', 'TWILIO', 'ELEVENLABS', 'RESEND');

-- CreateEnum
CREATE TYPE "CommunicationEventType" AS ENUM (
  'MESSAGE_RECEIVED',
  'MESSAGE_SENT',
  'MESSAGE_DELIVERED',
  'MESSAGE_READ',
  'MESSAGE_FAILED',
  'CALL_STARTED',
  'CALL_CONNECTED',
  'CALL_ENDED',
  'CALL_FAILED',
  'AI_INTENT_DETECTED',
  'AI_ACTION_STARTED',
  'AI_ACTION_COMPLETED',
  'AI_ACTION_FAILED',
  'HUMAN_REQUIRED',
  'HUMAN_ASSIGNED',
  'HUMAN_TAKEOVER',
  'CONVERSATION_RESOLVED',
  'CONVERSATION_REOPENED',
  'PROVIDER_ERROR'
);

-- CreateTable
CREATE TABLE "communication_conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "native_conversation_id" TEXT NOT NULL,
    "status" "CommunicationConversationStatus" NOT NULL DEFAULT 'AI_ACTIVE',
    "customer_id" TEXT,
    "booking_id" TEXT,
    "vehicle_id" TEXT,
    "station_id" TEXT,
    "assigned_user_id" TEXT,
    "assigned_agent_ref" TEXT,
    "assigned_agent_type" TEXT,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "event_type" "CommunicationEventType" NOT NULL,
    "direction" "CommunicationDirection",
    "provider_identity" "CommunicationProviderIdentity",
    "provider_event_id" TEXT,
    "provider_message_id" TEXT,
    "idempotency_key" TEXT,
    "actor_type" "CommunicationActorType",
    "actor_id" TEXT,
    "customer_id" TEXT,
    "booking_id" TEXT,
    "vehicle_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "redacted_payload_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communication_conversations_org_channel_native" ON "communication_conversations"("organization_id", "channel", "native_conversation_id");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_last_activity_at_idx" ON "communication_conversations"("organization_id", "last_activity_at");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_status_last_activity_idx" ON "communication_conversations"("organization_id", "status", "last_activity_at");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_channel_last_activit_idx" ON "communication_conversations"("organization_id", "channel", "last_activity_at");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_station_id_last_activ_idx" ON "communication_conversations"("organization_id", "station_id", "last_activity_at");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_assigned_user_id_st_idx" ON "communication_conversations"("organization_id", "assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_customer_id_idx" ON "communication_conversations"("organization_id", "customer_id");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_booking_id_idx" ON "communication_conversations"("organization_id", "booking_id");

-- CreateIndex
CREATE INDEX "communication_conversations_organization_id_vehicle_id_idx" ON "communication_conversations"("organization_id", "vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_events_org_idempotency_key" ON "communication_events"("organization_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "communication_events_org_provider_event" ON "communication_events"("organization_id", "channel", "provider_identity", "provider_event_id");

-- CreateIndex
CREATE INDEX "communication_events_organization_id_conversation_id_occurred_idx" ON "communication_events"("organization_id", "conversation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "communication_events_organization_id_event_type_occurred_at_idx" ON "communication_events"("organization_id", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "communication_events_organization_id_channel_occurred_at_idx" ON "communication_events"("organization_id", "channel", "occurred_at");

-- CreateIndex
CREATE INDEX "communication_events_organization_id_provider_message_id_idx" ON "communication_events"("organization_id", "provider_message_id");

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "communication_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (manual):
-- DROP TABLE IF EXISTS "communication_events";
-- DROP TABLE IF EXISTS "communication_conversations";
-- DROP TYPE IF EXISTS "CommunicationEventType";
-- DROP TYPE IF EXISTS "CommunicationProviderIdentity";
-- DROP TYPE IF EXISTS "CommunicationActorType";
-- DROP TYPE IF EXISTS "CommunicationDirection";
-- DROP TYPE IF EXISTS "CommunicationConversationStatus";
-- DROP TYPE IF EXISTS "CommunicationChannel";
