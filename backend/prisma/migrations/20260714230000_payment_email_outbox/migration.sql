-- Payment email outbox + outbound email source types for end-customer payments

CREATE TYPE "PaymentEmailType" AS ENUM (
  'BOOKING_PAYMENT_REQUEST',
  'PAYMENT_CONFIRMATION',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'PAYMENT_REFUND',
  'PAYMENT_DISPUTE'
);

CREATE TYPE "PaymentEmailOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'DEAD_LETTER'
);

ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'BOOKING_PAYMENT_REQUEST';
ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMATION';
ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'PAYMENT_EXPIRED';
ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUND';
ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'PAYMENT_DISPUTE';

ALTER TABLE "booking_payment_requests"
  ADD COLUMN IF NOT EXISTS "last_email_error_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_email_error_message" TEXT;

ALTER TABLE "outbound_emails"
  ADD COLUMN IF NOT EXISTS "booking_payment_request_id" TEXT;

CREATE TABLE "payment_email_outbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "payment_request_id" TEXT NOT NULL,
  "email_type" "PaymentEmailType" NOT NULL,
  "status" "PaymentEmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outbound_email_id" TEXT,
  "error_message" TEXT,
  "sent_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "processed_at" TIMESTAMP(3),

  CONSTRAINT "payment_email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_email_outbox_idempotency_key_key" ON "payment_email_outbox"("idempotency_key");
CREATE INDEX "payment_email_outbox_organization_id_idx" ON "payment_email_outbox"("organization_id");
CREATE INDEX "payment_email_outbox_payment_request_id_idx" ON "payment_email_outbox"("payment_request_id");
CREATE INDEX "payment_email_outbox_status_available_at_idx" ON "payment_email_outbox"("status", "available_at");

ALTER TABLE "payment_email_outbox"
  ADD CONSTRAINT "payment_email_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_email_outbox"
  ADD CONSTRAINT "payment_email_outbox_payment_request_id_fkey"
  FOREIGN KEY ("payment_request_id") REFERENCES "booking_payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_email_outbox"
  ADD CONSTRAINT "payment_email_outbox_outbound_email_id_fkey"
  FOREIGN KEY ("outbound_email_id") REFERENCES "outbound_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_emails"
  ADD CONSTRAINT "outbound_emails_booking_payment_request_id_fkey"
  FOREIGN KEY ("booking_payment_request_id") REFERENCES "booking_payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "outbound_emails_booking_payment_request_id_idx" ON "outbound_emails"("booking_payment_request_id");
