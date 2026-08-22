-- Communication Center C7.2 — canonical message content layer

CREATE TYPE "CommunicationMessageContentType" AS ENUM (
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'DOCUMENT',
  'LOCATION',
  'CONTACT',
  'MIXED',
  'UNSUPPORTED'
);

ALTER TABLE "communication_conversations"
  ADD COLUMN "last_message_preview" TEXT,
  ADD COLUMN "last_content_at" TIMESTAMP(3),
  ADD COLUMN "last_content_id" TEXT;

CREATE TABLE "communication_message_contents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "communication_event_id" TEXT NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "direction" "CommunicationDirection" NOT NULL,
  "provider_identity" "CommunicationProviderIdentity",
  "provider_message_id" TEXT,
  "native_message_id" TEXT NOT NULL,
  "content_type" "CommunicationMessageContentType" NOT NULL,
  "text" TEXT,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "has_attachments" BOOLEAN NOT NULL DEFAULT false,
  "attachment_count" INTEGER NOT NULL DEFAULT 0,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "communication_message_contents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "communication_message_contents_communication_event_id_key"
  ON "communication_message_contents"("communication_event_id");

CREATE UNIQUE INDEX "communication_message_contents_org_idempotency_key"
  ON "communication_message_contents"("organization_id", "idempotency_key");

CREATE INDEX "communication_message_contents_org_conversation_occurred_idx"
  ON "communication_message_contents"("organization_id", "conversation_id", "occurred_at");

CREATE INDEX "communication_message_contents_org_channel_native_message_idx"
  ON "communication_message_contents"("organization_id", "channel", "native_message_id");

ALTER TABLE "communication_message_contents"
  ADD CONSTRAINT "communication_message_contents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "communication_message_contents"
  ADD CONSTRAINT "communication_message_contents_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "communication_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "communication_message_contents"
  ADD CONSTRAINT "communication_message_contents_communication_event_id_fkey"
  FOREIGN KEY ("communication_event_id") REFERENCES "communication_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
