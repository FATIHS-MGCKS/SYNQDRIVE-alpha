-- Outbound email: org settings, verified domains, send audit trail

-- AlterEnum ActivityAction
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SEND';

-- AlterEnum ActivityEntity
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'OUTBOUND_EMAIL';

-- CreateEnum
CREATE TYPE "OrgEmailMode" AS ENUM ('SYNQDRIVE_DEFAULT', 'CUSTOM_DOMAIN');
CREATE TYPE "OrgEmailDomainStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING_DNS', 'VERIFYING', 'VERIFIED', 'FAILED');
CREATE TYPE "OutboundEmailSourceType" AS ENUM ('BOOKING_DOCUMENTS', 'INVOICE_SINGLE', 'TEST');
CREATE TYPE "OutboundEmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SENT_SIMULATED');
CREATE TYPE "OutboundEmailEventType" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'OPENED');

-- CreateTable org_email_settings
CREATE TABLE "org_email_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mode" "OrgEmailMode" NOT NULL DEFAULT 'SYNQDRIVE_DEFAULT',
    "default_from_name" TEXT,
    "reply_to_email" TEXT,
    "signature_html" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_email_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_email_settings_organization_id_key" ON "org_email_settings"("organization_id");

ALTER TABLE "org_email_settings" ADD CONSTRAINT "org_email_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable org_email_domains
CREATE TABLE "org_email_domains" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "OrgEmailDomainStatus" NOT NULL DEFAULT 'PENDING_DNS',
    "provider_domain_id" TEXT,
    "from_local_part" TEXT NOT NULL DEFAULT 'noreply',
    "dns_records" JSONB,
    "failure_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_checked_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_email_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_email_domains_organization_id_domain_key" ON "org_email_domains"("organization_id", "domain");
CREATE INDEX "org_email_domains_organization_id_idx" ON "org_email_domains"("organization_id");
CREATE INDEX "org_email_domains_status_idx" ON "org_email_domains"("status");

ALTER TABLE "org_email_domains" ADD CONSTRAINT "org_email_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable outbound_emails
CREATE TABLE "outbound_emails" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "customer_id" TEXT,
    "invoice_id" TEXT,
    "source_type" "OutboundEmailSourceType" NOT NULL,
    "status" "OutboundEmailStatus" NOT NULL DEFAULT 'QUEUED',
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to_email" TEXT,
    "to_email" TEXT NOT NULL,
    "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "body_text" TEXT,
    "body_html" TEXT,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "sent_by_user_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbound_emails_organization_id_idx" ON "outbound_emails"("organization_id");
CREATE INDEX "outbound_emails_organization_id_booking_id_idx" ON "outbound_emails"("organization_id", "booking_id");
CREATE INDEX "outbound_emails_organization_id_customer_id_idx" ON "outbound_emails"("organization_id", "customer_id");
CREATE INDEX "outbound_emails_status_idx" ON "outbound_emails"("status");
CREATE INDEX "outbound_emails_created_at_idx" ON "outbound_emails"("created_at");

ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable outbound_email_attachments
CREATE TABLE "outbound_email_attachments" (
    "id" TEXT NOT NULL,
    "outbound_email_id" TEXT NOT NULL,
    "generated_document_id" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "document_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_email_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbound_email_attachments_outbound_email_id_idx" ON "outbound_email_attachments"("outbound_email_id");
CREATE INDEX "outbound_email_attachments_generated_document_id_idx" ON "outbound_email_attachments"("generated_document_id");

ALTER TABLE "outbound_email_attachments" ADD CONSTRAINT "outbound_email_attachments_outbound_email_id_fkey" FOREIGN KEY ("outbound_email_id") REFERENCES "outbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_email_attachments" ADD CONSTRAINT "outbound_email_attachments_generated_document_id_fkey" FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable outbound_email_events
CREATE TABLE "outbound_email_events" (
    "id" TEXT NOT NULL,
    "outbound_email_id" TEXT NOT NULL,
    "event_type" "OutboundEmailEventType" NOT NULL,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_email_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbound_email_events_outbound_email_id_idx" ON "outbound_email_events"("outbound_email_id");
CREATE INDEX "outbound_email_events_event_type_idx" ON "outbound_email_events"("event_type");

ALTER TABLE "outbound_email_events" ADD CONSTRAINT "outbound_email_events_outbound_email_id_fkey" FOREIGN KEY ("outbound_email_id") REFERENCES "outbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
