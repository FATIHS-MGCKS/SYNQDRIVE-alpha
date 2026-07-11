-- Notification delivery transactional outbox (V4.9.358)

CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');
CREATE TYPE "NotificationDeliveryTransition" AS ENUM ('OPEN_CREATED', 'SEVERITY_ESCALATED', 'ACKNOWLEDGED', 'RESOLVED', 'REOPENED');
CREATE TYPE "NotificationDeliveryOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED');

ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'NOTIFICATION';

CREATE TABLE "notification_delivery_outbox" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "lifecycle_generation" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "delivery_transition" "NotificationDeliveryTransition" NOT NULL,
    "channel" "NotificationDeliveryChannel" NOT NULL,
    "recipient_id" TEXT,
    "audience_key" TEXT NOT NULL,
    "payload_ref" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationDeliveryOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "outbound_email_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_delivery_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_delivery_outbox_idempotency_key_key" ON "notification_delivery_outbox"("idempotency_key");
CREATE INDEX "notification_delivery_outbox_status_available_at_idx" ON "notification_delivery_outbox"("status", "available_at");
CREATE INDEX "notification_delivery_outbox_organization_id_status_idx" ON "notification_delivery_outbox"("organization_id", "status");
CREATE INDEX "notification_delivery_outbox_notification_id_idx" ON "notification_delivery_outbox"("notification_id");

ALTER TABLE "notification_delivery_outbox" ADD CONSTRAINT "notification_delivery_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_delivery_outbox" ADD CONSTRAINT "notification_delivery_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
