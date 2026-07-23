-- Booking domain event consumer receipts v2 (Prompt 23)
-- Adds durable delivery state, business keys, and aggregate version tracking.

CREATE TYPE "BookingDomainEventConsumerReceiptStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'SKIPPED', 'STALE');

ALTER TABLE "booking_domain_event_consumer_receipts"
  ADD COLUMN "business_key" TEXT,
  ADD COLUMN "status" "BookingDomainEventConsumerReceiptStatus" NOT NULL DEFAULT 'SUCCEEDED',
  ADD COLUMN "aggregate_version" INTEGER,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "booking_domain_event_consumer_receipts"
SET "business_key" = CONCAT("consumer_id", ':', "outbox_event_id")
WHERE "business_key" IS NULL;

ALTER TABLE "booking_domain_event_consumer_receipts"
  ALTER COLUMN "business_key" SET NOT NULL;

CREATE UNIQUE INDEX "booking_domain_event_consumer_receipts_consumer_id_business_key_key"
  ON "booking_domain_event_consumer_receipts"("consumer_id", "business_key");

CREATE INDEX "booking_domain_event_consumer_receipts_status_processed_at_idx"
  ON "booking_domain_event_consumer_receipts"("status", "processed_at");
