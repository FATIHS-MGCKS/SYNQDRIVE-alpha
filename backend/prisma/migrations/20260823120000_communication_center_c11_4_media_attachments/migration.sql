-- C11.4 Communication Center media attachments

CREATE TYPE "CommunicationReplyContentType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT');
CREATE TYPE "CommunicationAttachmentState" AS ENUM ('UPLOADING', 'READY', 'FAILED');
CREATE TYPE "CommunicationAttachmentMediaType" AS ENUM ('IMAGE', 'DOCUMENT');

ALTER TABLE "communication_reply_commands"
  ADD COLUMN "content_type" "CommunicationReplyContentType" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "attachment_id" TEXT,
  ADD COLUMN "payload_hash" TEXT;

-- Legacy C11.2 rows keep payload_hash NULL; runtime backfills via buildReplyPayloadHash on replay.

ALTER TABLE "communication_reply_commands"
  ALTER COLUMN "text" SET DEFAULT '';

ALTER TABLE "whatsapp_messages"
  ADD COLUMN "provider_media_id" TEXT,
  ADD COLUMN "media_attachment_id" TEXT;

CREATE TABLE "communication_attachments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "media_type" "CommunicationAttachmentMediaType" NOT NULL,
  "state" "CommunicationAttachmentState" NOT NULL DEFAULT 'UPLOADING',
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "storage_provider" TEXT NOT NULL,
  "uploader_user_id" TEXT,
  "reserved_command_id" TEXT,
  "native_message_id" TEXT,
  "sealed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "communication_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "communication_attachments_organization_id_conversation_id_cre_idx"
  ON "communication_attachments"("organization_id", "conversation_id", "created_at");

CREATE INDEX "communication_attachments_organization_id_conversation_id_sta_idx"
  ON "communication_attachments"("organization_id", "conversation_id", "state");

CREATE INDEX "communication_attachments_organization_id_native_message_id_idx"
  ON "communication_attachments"("organization_id", "native_message_id");

ALTER TABLE "communication_attachments"
  ADD CONSTRAINT "communication_attachments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "communication_attachments"
  ADD CONSTRAINT "communication_attachments_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "communication_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
