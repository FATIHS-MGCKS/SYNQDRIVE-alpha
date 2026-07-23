-- Booking financial state + invoice snapshot FK (Prompt 16).

CREATE TYPE "BookingFinancialState" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'PARTIALLY_PAID',
  'PAID',
  'REFUND_PENDING',
  'REFUNDED'
);

CREATE TYPE "BookingInvoiceProcessingState" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED'
);

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "financial_state" "BookingFinancialState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "invoice_processing_state" "BookingInvoiceProcessingState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "invoice_processing_error" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_processing_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "invoice_processing_next_retry_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "canonical_invoice_id" TEXT;

CREATE INDEX IF NOT EXISTS "bookings_financial_state_idx"
  ON "bookings" ("financial_state");

CREATE INDEX IF NOT EXISTS "bookings_invoice_processing_state_idx"
  ON "bookings" ("invoice_processing_state");

CREATE INDEX IF NOT EXISTS "bookings_canonical_invoice_id_idx"
  ON "bookings" ("canonical_invoice_id");

ALTER TABLE "org_invoices"
  ADD COLUMN IF NOT EXISTS "booking_price_snapshot_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_invoices_booking_price_snapshot_id_idx"
  ON "org_invoices" ("booking_price_snapshot_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_canonical_invoice_id_fkey'
  ) THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_canonical_invoice_id_fkey"
      FOREIGN KEY ("canonical_invoice_id")
      REFERENCES "org_invoices"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_invoices_booking_price_snapshot_id_fkey'
  ) THEN
    ALTER TABLE "org_invoices"
      ADD CONSTRAINT "org_invoices_booking_price_snapshot_id_fkey"
      FOREIGN KEY ("booking_price_snapshot_id")
      REFERENCES "booking_price_snapshots"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
