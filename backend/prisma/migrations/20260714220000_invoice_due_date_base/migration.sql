-- Invoice due-date base + payment-terms snapshot (V4.9.435)
CREATE TYPE "InvoiceDueDateBase" AS ENUM ('INVOICE_DATE', 'ISSUE_DATE', 'BOOKING_START', 'CUSTOM');

ALTER TABLE "org_invoices"
  ADD COLUMN "due_date_base" "InvoiceDueDateBase",
  ADD COLUMN "payment_terms_days_at_create" INTEGER;
