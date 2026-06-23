-- V4.9.50 — Multi-tenant SaaS support ticket system upgrade.

CREATE TYPE "SupportTicketStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE "SupportTicketPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "SupportTicketCategory" AS ENUM (
  'APP',
  'VEHICLE',
  'BOOKING',
  'BILLING',
  'DIMO_TELEMETRY',
  'ACCOUNT',
  'DOCUMENTS',
  'DATA_AUTHORIZATION',
  'HEALTH',
  'OTHER'
);

CREATE TYPE "SupportTicketRelatedEntityType" AS ENUM (
  'VEHICLE',
  'BOOKING',
  'INVOICE',
  'CUSTOMER',
  'USER',
  'AUTHORIZATION',
  'CONNECTIVITY',
  'HEALTH',
  'OTHER'
);

CREATE TYPE "SupportMessageSenderRole" AS ENUM (
  'USER',
  'MASTER_ADMIN',
  'SYSTEM'
);

-- Ensure support_messages exists (schema may have drifted ahead of older DBs).
CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "sender_id" TEXT,
  "sender_name" TEXT NOT NULL,
  "sender_role" TEXT NOT NULL DEFAULT 'user',
  "content" TEXT NOT NULL,
  "image_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_messages_ticket_id_created_at_idx"
  ON "support_messages"("ticket_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_ticket_id_fkey'
  ) THEN
    ALTER TABLE "support_messages"
      ADD CONSTRAINT "support_messages_ticket_id_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Ticket number sequence / column
CREATE SEQUENCE IF NOT EXISTS "support_tickets_ticket_number_seq";

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "ticket_number" INTEGER;

UPDATE "support_tickets"
SET "ticket_number" = nextval('support_tickets_ticket_number_seq')
WHERE "ticket_number" IS NULL;

ALTER TABLE "support_tickets"
  ALTER COLUMN "ticket_number" SET DEFAULT nextval('support_tickets_ticket_number_seq');

ALTER TABLE "support_tickets"
  ALTER COLUMN "ticket_number" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_ticket_number_key"
  ON "support_tickets"("ticket_number");

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;

-- Rename last_activity_at → last_message_at when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'last_activity_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'last_message_at'
  ) THEN
    ALTER TABLE "support_tickets" RENAME COLUMN "last_activity_at" TO "last_message_at";
  END IF;
END $$;

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "category" "SupportTicketCategory" NOT NULL DEFAULT 'OTHER';

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "related_entity_type" "SupportTicketRelatedEntityType";

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "related_entity_id" TEXT;

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "source_page" TEXT;

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "last_message_by_role" "SupportMessageSenderRole";

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "first_response_at" TIMESTAMP(3);

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "reopened_at" TIMESTAMP(3);

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "unread_for_user" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "unread_for_admin" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Migrate status enum
ALTER TABLE "support_tickets"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "support_tickets"
  ALTER COLUMN "status" TYPE "SupportTicketStatus"
  USING (
    CASE "status"::text
      WHEN 'OPEN' THEN 'OPEN'::"SupportTicketStatus"
      WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::"SupportTicketStatus"
      WHEN 'WAITING' THEN 'WAITING_FOR_CUSTOMER'::"SupportTicketStatus"
      WHEN 'RESOLVED' THEN 'RESOLVED'::"SupportTicketStatus"
      WHEN 'CLOSED' THEN 'CLOSED'::"SupportTicketStatus"
      ELSE 'OPEN'::"SupportTicketStatus"
    END
  );

ALTER TABLE "support_tickets"
  ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- Migrate priority enum
ALTER TABLE "support_tickets"
  ALTER COLUMN "priority" DROP DEFAULT;

ALTER TABLE "support_tickets"
  ALTER COLUMN "priority" TYPE "SupportTicketPriority"
  USING (
    CASE "priority"::text
      WHEN 'LOW' THEN 'LOW'::"SupportTicketPriority"
      WHEN 'MEDIUM' THEN 'NORMAL'::"SupportTicketPriority"
      WHEN 'NORMAL' THEN 'NORMAL'::"SupportTicketPriority"
      WHEN 'HIGH' THEN 'HIGH'::"SupportTicketPriority"
      WHEN 'URGENT' THEN 'CRITICAL'::"SupportTicketPriority"
      WHEN 'CRITICAL' THEN 'CRITICAL'::"SupportTicketPriority"
      ELSE 'NORMAL'::"SupportTicketPriority"
    END
  );

ALTER TABLE "support_tickets"
  ALTER COLUMN "priority" SET DEFAULT 'NORMAL';

-- Message extensions
ALTER TABLE "support_messages"
  ADD COLUMN IF NOT EXISTS "is_internal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "support_messages"
  ADD COLUMN IF NOT EXISTS "attachments" JSONB;

-- Migrate sender_role to enum
ALTER TABLE "support_messages"
  ALTER COLUMN "sender_role" DROP DEFAULT;

ALTER TABLE "support_messages"
  ALTER COLUMN "sender_role" TYPE "SupportMessageSenderRole"
  USING (
    CASE lower("sender_role")
      WHEN 'admin' THEN 'MASTER_ADMIN'::"SupportMessageSenderRole"
      WHEN 'master_admin' THEN 'MASTER_ADMIN'::"SupportMessageSenderRole"
      WHEN 'system' THEN 'SYSTEM'::"SupportMessageSenderRole"
      ELSE 'USER'::"SupportMessageSenderRole"
    END
  );

ALTER TABLE "support_messages"
  ALTER COLUMN "sender_role" SET DEFAULT 'USER';

-- Indexes
CREATE INDEX IF NOT EXISTS "support_tickets_category_idx" ON "support_tickets"("category");
CREATE INDEX IF NOT EXISTS "support_tickets_last_message_at_idx" ON "support_tickets"("last_message_at");
CREATE INDEX IF NOT EXISTS "support_tickets_assigned_to_idx" ON "support_tickets"("assigned_to");
CREATE INDEX IF NOT EXISTS "support_tickets_unread_for_admin_idx" ON "support_tickets"("unread_for_admin");

-- Drop legacy enums when unused
DROP TYPE IF EXISTS "TicketStatus";
DROP TYPE IF EXISTS "TicketPriority";
