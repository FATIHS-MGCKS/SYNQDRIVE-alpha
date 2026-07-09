-- CreateEnum
CREATE TYPE "OrgEmailMode" AS ENUM ('SYNQDRIVE_DEFAULT', 'VERIFIED_DOMAIN');

-- CreateEnum
CREATE TYPE "OrgEmailDomainStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING_DNS', 'VERIFYING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboundEmailSourceType" AS ENUM ('BOOKING_DOCUMENTS', 'INVOICE', 'HANDOVER', 'CUSTOMER_DOCUMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "OutboundEmailStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'SENT_SIMULATED');

-- CreateEnum
CREATE TYPE "OutboundEmailEventType" AS ENUM ('CREATED', 'QUEUED', 'SENT', 'FAILED', 'BOUNCED', 'OPENED', 'CLICKED', 'DOMAIN_USED', 'FALLBACK_USED');

-- CreateTable
CREATE TABLE "org_email_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mode" "OrgEmailMode" NOT NULL DEFAULT 'SYNQDRIVE_DEFAULT',
    "default_from_name" TEXT,
    "default_reply_to_email" TEXT,
    "signature_html" TEXT,
    "signature_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_email_domains" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to_email" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'dev',
    "provider_domain_id" TEXT,
    "status" "OrgEmailDomainStatus" NOT NULL DEFAULT 'PENDING_DNS',
    "dns_records" JSONB NOT NULL DEFAULT '[]',
    "last_checked_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_email_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_emails" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "customer_id" TEXT,
    "invoice_id" TEXT,
    "source_type" "OutboundEmailSourceType" NOT NULL,
    "to" TEXT NOT NULL,
    "cc" JSONB,
    "bcc" JSONB,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "body_html" TEXT,
    "status" "OutboundEmailStatus" NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT NOT NULL DEFAULT 'dev',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "sent_by_user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "outbound_email_events" (
    "id" TEXT NOT NULL,
    "outbound_email_id" TEXT NOT NULL,
    "event_type" "OutboundEmailEventType" NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_email_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_email_settings_organization_id_key" ON "org_email_settings"("organization_id");

-- CreateIndex
CREATE INDEX "org_email_domains_organization_id_idx" ON "org_email_domains"("organization_id");

-- CreateIndex
CREATE INDEX "org_email_domains_status_idx" ON "org_email_domains"("status");

-- CreateIndex
CREATE UNIQUE INDEX "org_email_domains_organization_id_domain_key" ON "org_email_domains"("organization_id", "domain");

-- CreateIndex
CREATE INDEX "outbound_emails_organization_id_idx" ON "outbound_emails"("organization_id");

-- CreateIndex
CREATE INDEX "outbound_emails_booking_id_idx" ON "outbound_emails"("booking_id");

-- CreateIndex
CREATE INDEX "outbound_emails_customer_id_idx" ON "outbound_emails"("customer_id");

-- CreateIndex
CREATE INDEX "outbound_emails_invoice_id_idx" ON "outbound_emails"("invoice_id");

-- CreateIndex
CREATE INDEX "outbound_emails_status_idx" ON "outbound_emails"("status");

-- CreateIndex
CREATE INDEX "outbound_emails_sent_by_user_id_idx" ON "outbound_emails"("sent_by_user_id");

-- CreateIndex
CREATE INDEX "outbound_email_attachments_outbound_email_id_idx" ON "outbound_email_attachments"("outbound_email_id");

-- CreateIndex
CREATE INDEX "outbound_email_attachments_generated_document_id_idx" ON "outbound_email_attachments"("generated_document_id");

-- CreateIndex
CREATE INDEX "outbound_email_events_outbound_email_id_idx" ON "outbound_email_events"("outbound_email_id");

-- CreateIndex
CREATE INDEX "outbound_email_events_event_type_idx" ON "outbound_email_events"("event_type");

-- AddForeignKey
ALTER TABLE "org_email_settings" ADD CONSTRAINT "org_email_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_email_domains" ADD CONSTRAINT "org_email_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_email_attachments" ADD CONSTRAINT "outbound_email_attachments_outbound_email_id_fkey" FOREIGN KEY ("outbound_email_id") REFERENCES "outbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_email_events" ADD CONSTRAINT "outbound_email_events_outbound_email_id_fkey" FOREIGN KEY ("outbound_email_id") REFERENCES "outbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
