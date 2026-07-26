-- Phase 2B.5: billing reconciliation drift expansion + manual acknowledgment.

ALTER TYPE "BillingReconciliationDriftType" ADD VALUE 'CUSTOMER_ID_MISMATCH';
ALTER TYPE "BillingReconciliationDriftType" ADD VALUE 'CANCELLATION_MISMATCH';
ALTER TYPE "BillingReconciliationDriftType" ADD VALUE 'RENEWAL_PERIOD_MISMATCH';
ALTER TYPE "BillingReconciliationDriftType" ADD VALUE 'INVOICE_STATUS_MISMATCH';
ALTER TYPE "BillingReconciliationDriftType" ADD VALUE 'PRODUCT_MISMATCH';

ALTER TABLE "billing_reconciliation_drifts"
  ADD COLUMN "acknowledged_at" TIMESTAMP(3),
  ADD COLUMN "acknowledged_by_user_id" TEXT;

ALTER TABLE "billing_reconciliation_drifts"
  ADD CONSTRAINT "billing_reconciliation_drifts_acknowledged_by_user_id_fkey"
  FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "billing_reconciliation_drifts_acknowledged_at_idx"
  ON "billing_reconciliation_drifts"("acknowledged_at");
