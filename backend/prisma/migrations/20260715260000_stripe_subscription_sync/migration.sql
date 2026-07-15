-- Prompt 22: Stripe subscription orchestrator sync status on local contract.

ALTER TABLE "billing_subscriptions"
  ADD COLUMN "stripe_sync_status" "BillingStripeMappingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "last_stripe_synced_at" TIMESTAMP(3),
  ADD COLUMN "last_stripe_sync_error" TEXT;

CREATE INDEX "billing_subscriptions_stripe_sync_status_idx"
  ON "billing_subscriptions"("stripe_sync_status");
