-- Prompt 27: billing reconciliation drift detection.

CREATE TYPE "BillingReconciliationDriftType" AS ENUM (
  'LOCAL_SUBSCRIPTION_WITHOUT_STRIPE',
  'STRIPE_SUBSCRIPTION_WITHOUT_LOCAL',
  'STATUS_MISMATCH',
  'WRONG_PRICE_ID',
  'MISSING_ITEM',
  'EXTRA_ITEM',
  'QUANTITY_MISMATCH',
  'BILLING_ANCHOR_MISMATCH',
  'MISSING_DISCOUNT',
  'MISSING_DEFAULT_PAYMENT_METHOD',
  'MISSING_LOCAL_INVOICE',
  'MISSING_LOCAL_PAYMENT',
  'STUCK_WEBHOOK',
  'TEST_LIVE_MODE_CONFLICT'
);

CREATE TYPE "BillingReconciliationDriftSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TYPE "BillingReconciliationRunStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED'
);

CREATE TABLE "billing_reconciliation_runs" (
  "id" TEXT NOT NULL,
  "stripe_mode" "BillingStripeMode" NOT NULL,
  "status" "BillingReconciliationRunStatus" NOT NULL DEFAULT 'PENDING',
  "cursor" TEXT,
  "total_scanned" INTEGER NOT NULL DEFAULT 0,
  "drift_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "batch_size" INTEGER NOT NULL DEFAULT 25,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "last_error" TEXT,
  "organization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_reconciliation_drifts" (
  "id" TEXT NOT NULL,
  "run_id" TEXT,
  "organization_id" TEXT NOT NULL,
  "subscription_id" TEXT,
  "drift_type" "BillingReconciliationDriftType" NOT NULL,
  "severity" "BillingReconciliationDriftSeverity" NOT NULL,
  "local_value" TEXT,
  "stripe_value" TEXT,
  "suggested_action" TEXT NOT NULL,
  "auto_fixable" BOOLEAN NOT NULL DEFAULT false,
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_user_id" TEXT,
  "stripe_mode" "BillingStripeMode",
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_reconciliation_drifts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_reconciliation_drifts_idempotency_key_key"
  ON "billing_reconciliation_drifts"("idempotency_key");

CREATE INDEX "billing_reconciliation_runs_status_created_at_idx"
  ON "billing_reconciliation_runs"("status", "created_at");

CREATE INDEX "billing_reconciliation_runs_organization_id_created_at_idx"
  ON "billing_reconciliation_runs"("organization_id", "created_at");

CREATE INDEX "billing_reconciliation_drifts_organization_id_resolved_at_detected_at_idx"
  ON "billing_reconciliation_drifts"("organization_id", "resolved_at", "detected_at");

CREATE INDEX "billing_reconciliation_drifts_subscription_id_resolved_at_idx"
  ON "billing_reconciliation_drifts"("subscription_id", "resolved_at");

CREATE INDEX "billing_reconciliation_drifts_drift_type_severity_idx"
  ON "billing_reconciliation_drifts"("drift_type", "severity");

ALTER TABLE "billing_reconciliation_runs"
  ADD CONSTRAINT "billing_reconciliation_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_reconciliation_drifts"
  ADD CONSTRAINT "billing_reconciliation_drifts_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "billing_reconciliation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_reconciliation_drifts"
  ADD CONSTRAINT "billing_reconciliation_drifts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_reconciliation_drifts"
  ADD CONSTRAINT "billing_reconciliation_drifts_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_reconciliation_drifts"
  ADD CONSTRAINT "billing_reconciliation_drifts_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
