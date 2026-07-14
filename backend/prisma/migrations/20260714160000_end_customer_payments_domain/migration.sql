-- End-customer payments domain (Stripe Connect) — separate from modules/billing.
-- Additive, backward-compatible migration. No data backfill.

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE');
CREATE TYPE "StripeAccountGeneration" AS ENUM ('V1', 'V2');
CREATE TYPE "OrganizationPaymentAccountStatus" AS ENUM ('PENDING', 'ONBOARDING', 'ACTIVE', 'RESTRICTED', 'DISABLED', 'REJECTED');
CREATE TYPE "BookingPaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "BookingPaymentRequestStatus" AS ENUM ('DRAFT', 'CHECKOUT_PENDING', 'PROCESSING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "BookingPaymentPurpose" AS ENUM ('BOOKING_INVOICE', 'INVOICE_SETTLEMENT');
CREATE TYPE "PaymentTransactionType" AS ENUM ('CHARGE', 'APPLICATION_FEE', 'REFUND', 'REFUND_APPLICATION_FEE', 'DISPUTE', 'DISPUTE_REVERSAL', 'ADJUSTMENT');
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "StripeConnectWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterTable: derived booking payment summary (not financial source of truth)
ALTER TABLE "bookings" ADD COLUMN "payment_status" "BookingPaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- AlterTable: link manual invoice payments to Connect payment requests when applicable
ALTER TABLE "org_invoice_payments" ADD COLUMN "stripe_payment_intent_id" TEXT;
ALTER TABLE "org_invoice_payments" ADD COLUMN "stripe_charge_id" TEXT;
ALTER TABLE "org_invoice_payments" ADD COLUMN "booking_payment_request_id" TEXT;

-- Drop existing cascade FK on org_invoice_payments for finance history preservation
ALTER TABLE "org_invoice_payments" DROP CONSTRAINT IF EXISTS "org_invoice_payments_invoice_id_fkey";
ALTER TABLE "org_invoice_payments" ADD CONSTRAINT "org_invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "organization_payment_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "status" "OrganizationPaymentAccountStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_connected_account_id" TEXT,
    "stripe_account_generation" "StripeAccountGeneration" NOT NULL DEFAULT 'V1',
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "default_currency" TEXT NOT NULL DEFAULT 'EUR',
    "details_submitted" BOOLEAN NOT NULL DEFAULT false,
    "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "disabled_reason" TEXT,
    "requirements_currently_due" JSONB,
    "requirements_past_due" JSONB,
    "requirements_pending_verification" JSONB,
    "bank_account_last4" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_stripe_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_payment_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_payment_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "purpose" "BookingPaymentPurpose" NOT NULL,
    "status" "BookingPaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "amount_cents" INTEGER NOT NULL,
    "paid_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "refunded_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stripe_connected_account_id" TEXT,
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_charge_id" TEXT,
    "stripe_application_fee_id" TEXT,
    "commissionable_amount_cents" INTEGER,
    "application_fee_amount_cents" INTEGER,
    "fee_rate_bps" INTEGER,
    "fixed_fee_cents" INTEGER,
    "checkout_url" TEXT,
    "checkout_created_at" TIMESTAMP(3),
    "checkout_expires_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "send_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_payment_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "payment_request_id" TEXT NOT NULL,
    "type" "PaymentTransactionType" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "provider_object_type" TEXT,
    "provider_object_id" TEXT,
    "provider_event_id" TEXT,
    "parent_transaction_id" TEXT,
    "balance_impact_cents" INTEGER NOT NULL DEFAULT 0,
    "application_fee_impact_cents" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stripe_connect_webhook_events" (
    "id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "stripe_connected_account_id" TEXT,
    "organization_id" TEXT,
    "event_type" TEXT NOT NULL,
    "object_id" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "processing_status" "StripeConnectWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload_hash" TEXT,
    "safe_event_data" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "stripe_connect_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_payment_accounts_organization_id_provider_key" ON "organization_payment_accounts"("organization_id", "provider");
CREATE UNIQUE INDEX "organization_payment_accounts_stripe_connected_account_id_key" ON "organization_payment_accounts"("stripe_connected_account_id");
CREATE INDEX "organization_payment_accounts_organization_id_status_idx" ON "organization_payment_accounts"("organization_id", "status");

CREATE UNIQUE INDEX "booking_payment_requests_organization_id_idempotency_key_key" ON "booking_payment_requests"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "booking_payment_requests_stripe_acct_checkout_session_key" ON "booking_payment_requests"("stripe_connected_account_id", "stripe_checkout_session_id");
CREATE UNIQUE INDEX "booking_payment_requests_stripe_acct_payment_intent_key" ON "booking_payment_requests"("stripe_connected_account_id", "stripe_payment_intent_id");
CREATE UNIQUE INDEX "booking_payment_requests_stripe_acct_charge_key" ON "booking_payment_requests"("stripe_connected_account_id", "stripe_charge_id");
CREATE INDEX "booking_payment_requests_organization_id_idx" ON "booking_payment_requests"("organization_id");
CREATE INDEX "booking_payment_requests_booking_id_purpose_status_idx" ON "booking_payment_requests"("booking_id", "purpose", "status");
CREATE INDEX "booking_payment_requests_invoice_id_idx" ON "booking_payment_requests"("invoice_id");
CREATE INDEX "booking_payment_requests_customer_id_idx" ON "booking_payment_requests"("customer_id");
CREATE INDEX "booking_payment_requests_status_idx" ON "booking_payment_requests"("status");

CREATE UNIQUE INDEX "payment_transactions_provider_provider_event_id_type_key" ON "payment_transactions"("provider", "provider_event_id", "type");
CREATE INDEX "payment_transactions_organization_id_occurred_at_idx" ON "payment_transactions"("organization_id", "occurred_at");
CREATE INDEX "payment_transactions_payment_request_id_idx" ON "payment_transactions"("payment_request_id");
CREATE INDEX "payment_transactions_provider_object_type_provider_object_id_idx" ON "payment_transactions"("provider_object_type", "provider_object_id");

CREATE UNIQUE INDEX "stripe_connect_webhook_events_stripe_event_id_key" ON "stripe_connect_webhook_events"("stripe_event_id");
CREATE INDEX "stripe_connect_webhook_events_processing_status_received_at_idx" ON "stripe_connect_webhook_events"("processing_status", "received_at");
CREATE INDEX "stripe_connect_webhook_events_organization_id_received_at_idx" ON "stripe_connect_webhook_events"("organization_id", "received_at");
CREATE INDEX "stripe_connect_webhook_events_stripe_connected_account_id_idx" ON "stripe_connect_webhook_events"("stripe_connected_account_id");

CREATE UNIQUE INDEX "org_invoice_payments_booking_payment_request_id_key" ON "org_invoice_payments"("booking_payment_request_id");
CREATE INDEX "org_invoice_payments_stripe_payment_intent_id_idx" ON "org_invoice_payments"("stripe_payment_intent_id");
CREATE INDEX "org_invoice_payments_stripe_charge_id_idx" ON "org_invoice_payments"("stripe_charge_id");

-- AddForeignKey
ALTER TABLE "organization_payment_accounts" ADD CONSTRAINT "organization_payment_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_payment_requests" ADD CONSTRAINT "booking_payment_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_payment_requests" ADD CONSTRAINT "booking_payment_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_payment_requests" ADD CONSTRAINT "booking_payment_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_payment_requests" ADD CONSTRAINT "booking_payment_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "booking_payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_parent_transaction_id_fkey" FOREIGN KEY ("parent_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stripe_connect_webhook_events" ADD CONSTRAINT "stripe_connect_webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_invoice_payments" ADD CONSTRAINT "org_invoice_payments_booking_payment_request_id_fkey" FOREIGN KEY ("booking_payment_request_id") REFERENCES "booking_payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
