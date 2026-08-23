-- C9.1: canonical template reply command fields
ALTER TYPE "CommunicationReplyContentType" ADD VALUE IF NOT EXISTS 'TEMPLATE';

ALTER TABLE "communication_reply_commands"
  ADD COLUMN IF NOT EXISTS "template_id" TEXT,
  ADD COLUMN IF NOT EXISTS "template_variables" JSONB;
