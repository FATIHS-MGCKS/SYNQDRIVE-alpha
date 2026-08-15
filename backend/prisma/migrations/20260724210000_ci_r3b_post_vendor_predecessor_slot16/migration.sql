-- CI-R3B historical predecessor repair slot 16
-- after: 20260724200000_iam_audit_outbox_processing_status_column
-- before: 20260725120000_chat_message_structured_payload

CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"role" TEXT NOT NULL,
"content" TEXT NOT NULL,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_organization_id_fkey'
    ) THEN
        ALTER TABLE "chat_messages"
            ADD CONSTRAINT "chat_messages_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "chat_messages_organization_id_created_at_idx" ON "chat_messages"("organization_id", "created_at");
