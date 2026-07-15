-- Prompt 08: usage ledger, payments, refunds, credit notes, billing domain outbox.
-- Financial history is append-only; Stripe IDs unique per stripe_mode.

-- CreateEnum
CREATE TYPE "BillingBillableVehicleAssignmentStatus" AS ENUM ('ACTIVE', 'EXCLUDED', 'ENDED');
CREATE TYPE "BillingQuantityEventType" AS ENUM (
  'VEHICLE_CONNECTED',
  'VEHICLE_DISCONNECTED',
  'VEHICLE_EXCLUDED',
  'VEHICLE_INCLUDED',
  'MANUAL_ADJUSTMENT',
  'SNAPSHOT_LOCK',
  'SUBSCRIPTION_SYNC'
);
CREATE TYPE "BillingQuantityEventSource" AS ENUM ('SYSTEM', 'STRIPE_WEBHOOK', 'ADMIN', 'SCHEDULER', 'API');
CREATE TYPE "BillingUsageSnapshotBasis" AS ENUM ('BILLABLE_VEHICLES', 'SUBSCRIPTION_ITEM_QUANTITY', 'MANUAL');
CREATE TYPE "BillingPaymentProvider" AS ENUM ('STRIPE', 'MANUAL');
CREATE TYPE "BillingPaymentStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED'
);
CREATE TYPE "BillingPaymentAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "BillingRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "BillingCreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID', 'APPLIED');
CREATE TYPE "BillingDomainEventOutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- Extend billing_invoices (Stripe ID unique per mode)
ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "stripe_mode" "BillingStripeMode";

UPDATE "billing_invoices"
SET "stripe_mode" = 'LIVE'
WHERE "stripe_mode" IS NULL
  AND "stripe_invoice_id" IS NOT NULL;

ALTER TABLE "billing_invoices"
  ALTER COLUMN "currency" TYPE CHAR(3)
  USING UPPER(LEFT("currency", 3));

ALTER TABLE "billing_invoices"
  ALTER COLUMN "currency" SET DEFAULT 'EUR';

DROP INDEX IF EXISTS "billing_invoices_stripe_invoice_id_key";

CREATE UNIQUE INDEX "billing_invoices_stripe_invoice_id_stripe_mode_key"
  ON "billing_invoices"("stripe_invoice_id", "stripe_mode");

-- Extend billing_invoice_lines (financial snapshot fields)
ALTER TABLE "billing_invoice_lines" ADD COLUMN IF NOT EXISTS "subscription_item_id" TEXT;
ALTER TABLE "billing_invoice_lines" ADD COLUMN IF NOT EXISTS "discount_cents" INTEGER DEFAULT 0;
ALTER TABLE "billing_invoice_lines" ADD COLUMN IF NOT EXISTS "net_cents" INTEGER;
ALTER TABLE "billing_invoice_lines" ADD COLUMN IF NOT EXISTS "product_snapshot_json" JSONB;
ALTER TABLE "billing_invoice_lines" ADD COLUMN IF NOT EXISTS "price_snapshot_json" JSONB;
ALTER TABLE "billing_invoice_lines" ADD COLUMN IF NOT EXISTS "stripe_invoice_line_id" TEXT;
ALTER TABLE "billing_invoice_lines" ADD COLUMN IF NOT EXISTS "stripe_mode" "BillingStripeMode";

CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoice_lines_stripe_invoice_line_id_stripe_mode_key"
  ON "billing_invoice_lines"("stripe_invoice_line_id", "stripe_mode");

CREATE INDEX IF NOT EXISTS "billing_invoice_lines_subscription_item_id_idx"
  ON "billing_invoice_lines"("subscription_item_id");

ALTER TABLE "billing_invoice_lines"
  ADD CONSTRAINT "billing_invoice_lines_subscription_item_id_fkey"
  FOREIGN KEY ("subscription_item_id") REFERENCES "billing_subscription_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Extend billing_usage_snapshots (period lock + calculation basis)
ALTER TABLE "billing_usage_snapshots" ADD COLUMN IF NOT EXISTS "subscription_item_id" TEXT;
ALTER TABLE "billing_usage_snapshots" ADD COLUMN IF NOT EXISTS "calculated_quantity" INTEGER;
ALTER TABLE "billing_usage_snapshots" ADD COLUMN IF NOT EXISTS "calculation_basis" "BillingUsageSnapshotBasis";
ALTER TABLE "billing_usage_snapshots" ADD COLUMN IF NOT EXISTS "source_hash" TEXT;
ALTER TABLE "billing_usage_snapshots" ADD COLUMN IF NOT EXISTS "source_revision" INTEGER;
ALTER TABLE "billing_usage_snapshots" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);
ALTER TABLE "billing_usage_snapshots" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;

ALTER TABLE "billing_usage_snapshots"
  ALTER COLUMN "currency" TYPE CHAR(3)
  USING UPPER(LEFT("currency", 3));

ALTER TABLE "billing_usage_snapshots"
  ALTER COLUMN "currency" SET DEFAULT 'EUR';

CREATE INDEX IF NOT EXISTS "billing_usage_snapshots_subscription_item_id_period_start_idx"
  ON "billing_usage_snapshots"("subscription_item_id", "period_start");

CREATE INDEX IF NOT EXISTS "billing_usage_snapshots_locked_at_idx"
  ON "billing_usage_snapshots"("locked_at");

ALTER TABLE "billing_usage_snapshots"
  ADD CONSTRAINT "billing_usage_snapshots_subscription_item_id_fkey"
  FOREIGN KEY ("subscription_item_id") REFERENCES "billing_subscription_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_usage_snapshots"
  ADD CONSTRAINT "billing_usage_snapshots_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Billable vehicle assignments
CREATE TABLE "billing_billable_vehicle_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "subscription_item_id" TEXT NOT NULL,
    "billable_from" TIMESTAMP(3) NOT NULL,
    "billable_until" TIMESTAMP(3),
    "status" "BillingBillableVehicleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason_code" TEXT,
    "reason_note" TEXT,
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_billable_vehicle_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_billable_vehicle_assignments_organization_id_vehicle_id_status_idx"
  ON "billing_billable_vehicle_assignments"("organization_id", "vehicle_id", "status");

CREATE INDEX "billing_billable_vehicle_assignments_subscription_item_id_billable_from_idx"
  ON "billing_billable_vehicle_assignments"("subscription_item_id", "billable_from");

CREATE INDEX "billing_billable_vehicle_assignments_vehicle_id_billable_from_idx"
  ON "billing_billable_vehicle_assignments"("vehicle_id", "billable_from");

ALTER TABLE "billing_billable_vehicle_assignments"
  ADD CONSTRAINT "billing_billable_vehicle_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_billable_vehicle_assignments"
  ADD CONSTRAINT "billing_billable_vehicle_assignments_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_billable_vehicle_assignments"
  ADD CONSTRAINT "billing_billable_vehicle_assignments_subscription_item_id_fkey"
  FOREIGN KEY ("subscription_item_id") REFERENCES "billing_subscription_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_billable_vehicle_assignments"
  ADD CONSTRAINT "billing_billable_vehicle_assignments_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only quantity ledger
CREATE TABLE "billing_quantity_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subscription_item_id" TEXT NOT NULL,
    "event_type" "BillingQuantityEventType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "source" "BillingQuantityEventSource" NOT NULL,
    "actor_user_id" TEXT,
    "reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_quantity_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_quantity_events_idempotency_key_key"
  ON "billing_quantity_events"("idempotency_key");

CREATE INDEX "billing_quantity_events_organization_id_effective_at_idx"
  ON "billing_quantity_events"("organization_id", "effective_at");

CREATE INDEX "billing_quantity_events_subscription_item_id_effective_at_idx"
  ON "billing_quantity_events"("subscription_item_id", "effective_at");

CREATE INDEX "billing_quantity_events_event_type_effective_at_idx"
  ON "billing_quantity_events"("event_type", "effective_at");

ALTER TABLE "billing_quantity_events"
  ADD CONSTRAINT "billing_quantity_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_quantity_events"
  ADD CONSTRAINT "billing_quantity_events_subscription_item_id_fkey"
  FOREIGN KEY ("subscription_item_id") REFERENCES "billing_subscription_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_quantity_events"
  ADD CONSTRAINT "billing_quantity_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- SaaS payments
CREATE TABLE "billing_payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "BillingPaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "stripe_payment_intent_id" TEXT,
    "stripe_charge_id" TEXT,
    "stripe_mode" "BillingStripeMode",
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_payments_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "billing_payments_stripe_payment_intent_id_stripe_mode_key"
  ON "billing_payments"("stripe_payment_intent_id", "stripe_mode");

CREATE UNIQUE INDEX "billing_payments_stripe_charge_id_stripe_mode_key"
  ON "billing_payments"("stripe_charge_id", "stripe_mode");

CREATE INDEX "billing_payments_invoice_id_status_idx"
  ON "billing_payments"("invoice_id", "status");

ALTER TABLE "billing_payments"
  ADD CONSTRAINT "billing_payments_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only payment attempts
CREATE TABLE "billing_payment_attempts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "BillingPaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "BillingPaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "stripe_charge_id" TEXT,
    "stripe_mode" "BillingStripeMode",
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_payment_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_payment_attempts_attempt_number_check" CHECK ("attempt_number" >= 1)
);

CREATE UNIQUE INDEX "billing_payment_attempts_payment_id_attempt_number_key"
  ON "billing_payment_attempts"("payment_id", "attempt_number");

CREATE UNIQUE INDEX "billing_payment_attempts_stripe_charge_id_stripe_mode_key"
  ON "billing_payment_attempts"("stripe_charge_id", "stripe_mode");

CREATE INDEX "billing_payment_attempts_payment_id_attempted_at_idx"
  ON "billing_payment_attempts"("payment_id", "attempted_at");

ALTER TABLE "billing_payment_attempts"
  ADD CONSTRAINT "billing_payment_attempts_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "billing_payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only refunds
CREATE TABLE "billing_refunds" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "status" "BillingRefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "stripe_refund_id" TEXT,
    "stripe_mode" "BillingStripeMode",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_refunds_amount_cents_check" CHECK ("amount_cents" >= 0)
);

CREATE UNIQUE INDEX "billing_refunds_stripe_refund_id_stripe_mode_key"
  ON "billing_refunds"("stripe_refund_id", "stripe_mode");

CREATE INDEX "billing_refunds_payment_id_created_at_idx"
  ON "billing_refunds"("payment_id", "created_at");

CREATE INDEX "billing_refunds_invoice_id_idx"
  ON "billing_refunds"("invoice_id");

ALTER TABLE "billing_refunds"
  ADD CONSTRAINT "billing_refunds_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "billing_payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_refunds"
  ADD CONSTRAINT "billing_refunds_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only credit notes
CREATE TABLE "billing_credit_notes" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "refund_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "status" "BillingCreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "stripe_credit_note_id" TEXT,
    "stripe_mode" "BillingStripeMode",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_credit_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_credit_notes_amount_cents_check" CHECK ("amount_cents" >= 0)
);

CREATE UNIQUE INDEX "billing_credit_notes_stripe_credit_note_id_stripe_mode_key"
  ON "billing_credit_notes"("stripe_credit_note_id", "stripe_mode");

CREATE INDEX "billing_credit_notes_invoice_id_status_idx"
  ON "billing_credit_notes"("invoice_id", "status");

CREATE INDEX "billing_credit_notes_refund_id_idx"
  ON "billing_credit_notes"("refund_id");

ALTER TABLE "billing_credit_notes"
  ADD CONSTRAINT "billing_credit_notes_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_credit_notes"
  ADD CONSTRAINT "billing_credit_notes_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "billing_refunds"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Billing domain event outbox
CREATE TABLE "billing_domain_event_outbox" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "status" "BillingDomainEventOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_domain_event_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_domain_event_outbox_retry_count_check" CHECK ("retry_count" >= 0)
);

CREATE UNIQUE INDEX "billing_domain_event_outbox_idempotency_key_key"
  ON "billing_domain_event_outbox"("idempotency_key");

CREATE INDEX "billing_domain_event_outbox_status_occurred_at_idx"
  ON "billing_domain_event_outbox"("status", "occurred_at");

CREATE INDEX "billing_domain_event_outbox_aggregate_type_aggregate_id_idx"
  ON "billing_domain_event_outbox"("aggregate_type", "aggregate_id");

CREATE INDEX "billing_domain_event_outbox_event_type_occurred_at_idx"
  ON "billing_domain_event_outbox"("event_type", "occurred_at");

-- Append-only guards (financial ledger tables)
CREATE OR REPLACE FUNCTION billing_deny_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23506';
END;
$$;

DROP TRIGGER IF EXISTS billing_quantity_events_append_only ON "billing_quantity_events";
CREATE TRIGGER billing_quantity_events_append_only
  BEFORE UPDATE OR DELETE ON "billing_quantity_events"
  FOR EACH ROW
  EXECUTE FUNCTION billing_deny_row_mutation();

DROP TRIGGER IF EXISTS billing_payment_attempts_append_only ON "billing_payment_attempts";
CREATE TRIGGER billing_payment_attempts_append_only
  BEFORE UPDATE OR DELETE ON "billing_payment_attempts"
  FOR EACH ROW
  EXECUTE FUNCTION billing_deny_row_mutation();

DROP TRIGGER IF EXISTS billing_refunds_append_only ON "billing_refunds";
CREATE TRIGGER billing_refunds_append_only
  BEFORE UPDATE OR DELETE ON "billing_refunds"
  FOR EACH ROW
  EXECUTE FUNCTION billing_deny_row_mutation();

DROP TRIGGER IF EXISTS billing_credit_notes_append_only ON "billing_credit_notes";
CREATE TRIGGER billing_credit_notes_append_only
  BEFORE UPDATE OR DELETE ON "billing_credit_notes"
  FOR EACH ROW
  EXECUTE FUNCTION billing_deny_row_mutation();

DROP TRIGGER IF EXISTS billing_invoice_lines_append_only ON "billing_invoice_lines";
CREATE TRIGGER billing_invoice_lines_append_only
  BEFORE UPDATE OR DELETE ON "billing_invoice_lines"
  FOR EACH ROW
  EXECUTE FUNCTION billing_deny_row_mutation();

CREATE OR REPLACE FUNCTION billing_guard_locked_usage_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."locked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Locked billing usage snapshot % is immutable', OLD."id"
        USING ERRCODE = '23506';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."locked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Locked billing usage snapshot % cannot be deleted', OLD."id"
        USING ERRCODE = '23506';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_usage_snapshots_locked_guard ON "billing_usage_snapshots";
CREATE TRIGGER billing_usage_snapshots_locked_guard
  BEFORE UPDATE OR DELETE ON "billing_usage_snapshots"
  FOR EACH ROW
  EXECUTE FUNCTION billing_guard_locked_usage_snapshot();

CREATE OR REPLACE FUNCTION billing_guard_domain_event_outbox_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."event_type" IS DISTINCT FROM OLD."event_type"
       OR NEW."aggregate_type" IS DISTINCT FROM OLD."aggregate_type"
       OR NEW."aggregate_id" IS DISTINCT FROM OLD."aggregate_id"
       OR NEW."payload_version" IS DISTINCT FROM OLD."payload_version"
       OR NEW."payload" IS DISTINCT FROM OLD."payload"
       OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
       OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
      RAISE EXCEPTION 'Billing domain event outbox row % payload is immutable', OLD."id"
        USING ERRCODE = '23506';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Billing domain event outbox row % cannot be deleted', OLD."id"
      USING ERRCODE = '23506';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_domain_event_outbox_immutable_payload ON "billing_domain_event_outbox";
CREATE TRIGGER billing_domain_event_outbox_immutable_payload
  BEFORE UPDATE OR DELETE ON "billing_domain_event_outbox"
  FOR EACH ROW
  EXECUTE FUNCTION billing_guard_domain_event_outbox_update();
