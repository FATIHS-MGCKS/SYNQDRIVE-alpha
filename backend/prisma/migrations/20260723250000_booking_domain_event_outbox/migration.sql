-- Booking domain event transactional outbox (Prompt 22)

CREATE TYPE "BookingDomainEventOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'DEAD_LETTER'
);

CREATE TABLE "booking_domain_event_outbox" (
  "id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "aggregate_version" INTEGER NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "causation_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "status" "BookingDomainEventOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "last_error" TEXT,
  "lock_owner" TEXT,
  "locked_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "booking_domain_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_domain_event_consumer_receipts" (
  "id" TEXT NOT NULL,
  "outbox_event_id" TEXT NOT NULL,
  "consumer_id" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_domain_event_consumer_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_domain_event_outbox_idempotency_key_key"
  ON "booking_domain_event_outbox"("idempotency_key");

CREATE INDEX "booking_domain_event_outbox_organization_id_occurred_at_idx"
  ON "booking_domain_event_outbox"("organization_id", "occurred_at");

CREATE INDEX "booking_domain_event_outbox_status_next_retry_at_idx"
  ON "booking_domain_event_outbox"("status", "next_retry_at");

CREATE INDEX "booking_domain_event_outbox_aggregate_id_aggregate_version_idx"
  ON "booking_domain_event_outbox"("aggregate_id", "aggregate_version");

CREATE INDEX "booking_domain_event_outbox_event_type_occurred_at_idx"
  ON "booking_domain_event_outbox"("event_type", "occurred_at");

CREATE UNIQUE INDEX "booking_domain_event_consumer_receipts_outbox_event_id_consumer_id_key"
  ON "booking_domain_event_consumer_receipts"("outbox_event_id", "consumer_id");

CREATE INDEX "booking_domain_event_consumer_receipts_consumer_id_processed_at_idx"
  ON "booking_domain_event_consumer_receipts"("consumer_id", "processed_at");

ALTER TABLE "booking_domain_event_outbox"
  ADD CONSTRAINT "booking_domain_event_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_domain_event_consumer_receipts"
  ADD CONSTRAINT "booking_domain_event_consumer_receipts_outbox_event_id_fkey"
  FOREIGN KEY ("outbox_event_id") REFERENCES "booking_domain_event_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
