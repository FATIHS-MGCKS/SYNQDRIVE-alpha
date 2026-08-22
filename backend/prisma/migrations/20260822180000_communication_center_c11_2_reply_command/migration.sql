-- CreateEnum
CREATE TYPE "CommunicationReplySendState" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "communication_reply_commands" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "client_idempotency_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "send_state" "CommunicationReplySendState" NOT NULL DEFAULT 'PENDING',
    "native_message_id" TEXT,
    "canonical_event_id" TEXT,
    "failure_code" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_reply_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_reply_commands_organization_id_conversation_id_idx" ON "communication_reply_commands"("organization_id", "conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "communication_reply_commands_org_conversation_key" ON "communication_reply_commands"("organization_id", "conversation_id", "client_idempotency_key");

-- AddForeignKey
ALTER TABLE "communication_reply_commands" ADD CONSTRAINT "communication_reply_commands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_reply_commands" ADD CONSTRAINT "communication_reply_commands_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "communication_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
