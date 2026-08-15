-- CI-R3B historical predecessor repair slot 11
-- after: 20260620180000_voice_assistant_tool_permissions
-- before: 20260620190000_whatsapp_business_platform

DO $$ BEGIN
    CREATE TYPE "WhatsAppAiMode" AS ENUM ('OFF', 'SUGGEST_ONLY', 'AUTO_SIMPLE', 'FULL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "org_whatsapp_configs" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"is_connected" BOOLEAN NOT NULL DEFAULT false,
"is_active" BOOLEAN NOT NULL DEFAULT false,
"phone_number" TEXT,
"business_name" TEXT,
"ai_mode" "WhatsAppAiMode" NOT NULL DEFAULT 'SUGGEST_ONLY'::"WhatsAppAiMode",
"ai_can_create_tasks" BOOLEAN NOT NULL DEFAULT false,
"ai_can_create_support" BOOLEAN NOT NULL DEFAULT false,
"ai_can_use_bookings" BOOLEAN NOT NULL DEFAULT true,
"ai_can_contact_vendors" BOOLEAN NOT NULL DEFAULT false,
"ai_escalation_enabled" BOOLEAN NOT NULL DEFAULT true,
"connected_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"connected_by_name" TEXT,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "org_whatsapp_configs_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"contact_phone" TEXT NOT NULL,
"contact_name" TEXT,
"last_message_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"last_message_preview" TEXT,
"unread_count" INTEGER NOT NULL DEFAULT 0,
"status" TEXT NOT NULL DEFAULT 'open',
"assigned_to" TEXT,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"conversation_id" TEXT NOT NULL,
"direction" TEXT NOT NULL,
"sender_type" TEXT NOT NULL,
"sender_name" TEXT,
"content" TEXT NOT NULL,
"ai_generated" BOOLEAN NOT NULL DEFAULT false,
"ai_suggested" BOOLEAN NOT NULL DEFAULT false,
"status" TEXT NOT NULL DEFAULT 'sent',
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'org_whatsapp_configs_organization_id_fkey'
    ) THEN
        ALTER TABLE "org_whatsapp_configs"
            ADD CONSTRAINT "org_whatsapp_configs_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_conversations_organization_id_fkey'
    ) THEN
        ALTER TABLE "whatsapp_conversations"
            ADD CONSTRAINT "whatsapp_conversations_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_conversation_id_fkey'
    ) THEN
        ALTER TABLE "whatsapp_messages"
            ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey"
            FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_organization_id_fkey'
    ) THEN
        ALTER TABLE "whatsapp_messages"
            ADD CONSTRAINT "whatsapp_messages_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "org_whatsapp_configs_organization_id_key" ON "org_whatsapp_configs"("organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_conversations_organization_id_contact_phone_key" ON "whatsapp_conversations"("organization_id", "contact_phone");

CREATE INDEX IF NOT EXISTS "org_whatsapp_configs_organization_id_idx" ON "org_whatsapp_configs"("organization_id");

CREATE INDEX IF NOT EXISTS "whatsapp_conversations_last_message_at_idx" ON "whatsapp_conversations"("last_message_at");

CREATE INDEX IF NOT EXISTS "whatsapp_conversations_organization_id_idx" ON "whatsapp_conversations"("organization_id");

CREATE INDEX IF NOT EXISTS "whatsapp_messages_conversation_id_created_at_idx" ON "whatsapp_messages"("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "whatsapp_messages_organization_id_idx" ON "whatsapp_messages"("organization_id");
