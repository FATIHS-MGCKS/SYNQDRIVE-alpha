-- C13.1 Communication retention lifecycle scaffolding

-- AlterEnum
ALTER TYPE "CommunicationAttachmentState" ADD VALUE 'PURGED';

-- AlterTable
ALTER TABLE "communication_message_contents" ADD COLUMN "content_purged_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "communication_reply_commands" ADD COLUMN "content_purged_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "communication_attachments" ADD COLUMN "purged_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN "content_purged_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "communication_retention_purge_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "trigger" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL,
    "correlation_id" TEXT,
    "report" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "communication_retention_purge_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_message_contents_organization_id_occurred_at_co_idx" ON "communication_message_contents"("organization_id", "occurred_at", "content_purged_at");

-- CreateIndex
CREATE INDEX "communication_reply_commands_organization_id_send_state_cre_idx" ON "communication_reply_commands"("organization_id", "send_state", "created_at");

-- CreateIndex
CREATE INDEX "communication_attachments_organization_id_state_created_at_idx" ON "communication_attachments"("organization_id", "state", "created_at");

-- CreateIndex
CREATE INDEX "communication_retention_purge_runs_organization_id_started_at_idx" ON "communication_retention_purge_runs"("organization_id", "started_at");

-- AddForeignKey
ALTER TABLE "communication_retention_purge_runs" ADD CONSTRAINT "communication_retention_purge_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
