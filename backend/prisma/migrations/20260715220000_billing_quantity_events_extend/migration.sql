-- Prompt 14: extend quantity events with subscription/vehicle provenance and lifecycle event types.

ALTER TYPE "BillingQuantityEventType" ADD VALUE IF NOT EXISTS 'VEHICLE_ORG_TRANSFERRED';
ALTER TYPE "BillingQuantityEventType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_ACTIVATED';
ALTER TYPE "BillingQuantityEventType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAUSED';
ALTER TYPE "BillingQuantityEventType" ADD VALUE IF NOT EXISTS 'BASE_PLAN_CHANGED';
ALTER TYPE "BillingQuantityEventType" ADD VALUE IF NOT EXISTS 'ORG_BILLING_DEACTIVATED';

ALTER TABLE "billing_quantity_events"
  ADD COLUMN IF NOT EXISTS "subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "vehicle_id" TEXT;

CREATE INDEX IF NOT EXISTS "billing_quantity_events_subscription_id_effective_at_idx"
  ON "billing_quantity_events"("subscription_id", "effective_at");

CREATE INDEX IF NOT EXISTS "billing_quantity_events_vehicle_id_effective_at_idx"
  ON "billing_quantity_events"("vehicle_id", "effective_at");

ALTER TABLE "billing_quantity_events"
  ADD CONSTRAINT "billing_quantity_events_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_quantity_events"
  ADD CONSTRAINT "billing_quantity_events_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
