-- Prompt 28: transactional billing outbox with delivery tracking and dead letter support.

CREATE TYPE "BillingDomainEventOutboxDeliveryStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'DEAD_LETTER'
);

ALTER TYPE "BillingDomainEventOutboxStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "BillingDomainEventOutboxStatus" ADD VALUE 'DEAD_LETTER';

ALTER TABLE "billing_domain_event_outbox"
  ADD COLUMN "organization_id" TEXT,
  ADD COLUMN "next_retry_at" TIMESTAMP(3),
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "lock_owner" TEXT;

CREATE INDEX "billing_domain_event_outbox_status_next_retry_at_idx"
  ON "billing_domain_event_outbox"("status", "next_retry_at");

CREATE INDEX "billing_domain_event_outbox_organization_id_occurred_at_idx"
  ON "billing_domain_event_outbox"("organization_id", "occurred_at");

CREATE TABLE "billing_domain_event_outbox_deliveries" (
  "id" TEXT NOT NULL,
  "outbox_event_id" TEXT NOT NULL,
  "consumer_id" TEXT NOT NULL,
  "status" "BillingDomainEventOutboxDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "last_error" TEXT,
  "delivered_at" TIMESTAMP(3),
  "locked_at" TIMESTAMP(3),
  "lock_owner" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_domain_event_outbox_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_domain_event_outbox_deliveries_outbox_event_id_consumer_id_key"
  ON "billing_domain_event_outbox_deliveries"("outbox_event_id", "consumer_id");

CREATE INDEX "billing_domain_event_outbox_deliveries_status_next_retry_at_idx"
  ON "billing_domain_event_outbox_deliveries"("status", "next_retry_at");

CREATE INDEX "billing_domain_event_outbox_deliveries_consumer_id_status_idx"
  ON "billing_domain_event_outbox_deliveries"("consumer_id", "status");

ALTER TABLE "billing_domain_event_outbox_deliveries"
  ADD CONSTRAINT "billing_domain_event_outbox_deliveries_outbox_event_id_fkey"
  FOREIGN KEY ("outbox_event_id") REFERENCES "billing_domain_event_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
