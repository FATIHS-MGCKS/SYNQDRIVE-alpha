-- Invite email delivery outbox + rate-limit attempts (Prompt 14)

CREATE TYPE "InviteEmailOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'DEAD_LETTER'
);

CREATE TABLE "invite_email_outbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "invite_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" "InviteEmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "token_ciphertext" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "sent_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invite_email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_email_outbox_idempotency_key_key" ON "invite_email_outbox"("idempotency_key");
CREATE INDEX "invite_email_outbox_organization_id_idx" ON "invite_email_outbox"("organization_id");
CREATE INDEX "invite_email_outbox_invite_id_idx" ON "invite_email_outbox"("invite_id");
CREATE INDEX "invite_email_outbox_status_available_at_idx" ON "invite_email_outbox"("status", "available_at");

ALTER TABLE "invite_email_outbox"
  ADD CONSTRAINT "invite_email_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invite_email_outbox"
  ADD CONSTRAINT "invite_email_outbox_invite_id_fkey"
  FOREIGN KEY ("invite_id") REFERENCES "organization_user_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invite_email_outbox"
  ADD CONSTRAINT "invite_email_outbox_sent_by_user_id_fkey"
  FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "organization_invite_attempts" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "organization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organization_invite_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_invite_attempts_scope_scope_key_created_at_idx"
  ON "organization_invite_attempts"("scope", "scope_key", "created_at");
