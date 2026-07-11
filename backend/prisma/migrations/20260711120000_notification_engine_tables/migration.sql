-- V4.9.351 — Notification Engine persistent tables (additive, no data backfill)
--
-- Creates notifications, notification_occurrences, notification_receipts.
-- Partial unique index enforces at most one ACTIVE notification per
-- (organization_id, fingerprint, lifecycle_generation).
-- Prisma schema cannot express partial indexes — maintained here.

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO', 'SUCCESS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationDomain" AS ENUM ('OPERATIONS', 'VEHICLE_HEALTH', 'DRIVING_ANALYSIS', 'BOOKINGS', 'HANDOVERS', 'DOCUMENTS', 'BILLING', 'SECURITY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('VEHICLE', 'BOOKING', 'STATION', 'CUSTOMER', 'INVOICE', 'TRIP', 'FLEET', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "NotificationActionType" AS ENUM ('OPEN_VEHICLE', 'OPEN_VEHICLE_MODULE', 'OPEN_BOOKING', 'OPEN_HANDOVER_PICKUP', 'OPEN_HANDOVER_RETURN', 'OPEN_STATION', 'OPEN_BILLING', 'OPEN_RENTAL');

-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM ('DASHBOARD_INSIGHT', 'OPERATIONAL_ISSUE', 'PREDICTIVE_INSIGHT', 'DERIVED_INSIGHT', 'BOOKING_TILE', 'HEALTH_ALERT', 'RUNTIME', 'WORKFLOW', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationEventKind" AS ENUM ('EVENT', 'STATE');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "lifecycle_generation" INTEGER NOT NULL DEFAULT 1,
    "event_type" TEXT NOT NULL,
    "event_kind" "NotificationEventKind" NOT NULL,
    "condition_code" TEXT NOT NULL,
    "domain" "NotificationDomain" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'OPEN',
    "entity_type" "NotificationEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title_key" TEXT NOT NULL,
    "body_key" TEXT NOT NULL,
    "template_params" JSONB NOT NULL DEFAULT '{}',
    "action_type" "NotificationActionType" NOT NULL,
    "action_target" JSONB NOT NULL DEFAULT '{}',
    "source_type" "NotificationSourceType" NOT NULL,
    "primary_source_ref" TEXT NOT NULL,
    "legacy_insight_id" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "acknowledged_at" TIMESTAMP(3),
    "snoozed_until" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_occurrences" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_type" "NotificationSourceType" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "severity_at_occurrence" "NotificationSeverity" NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_receipts" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "snoozed_until" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organization_id_status_last_seen_at_idx" ON "notifications"("organization_id", "status", "last_seen_at");

-- CreateIndex
CREATE INDEX "notifications_organization_id_severity_status_idx" ON "notifications"("organization_id", "severity", "status");

-- CreateIndex
CREATE INDEX "notifications_organization_id_domain_status_idx" ON "notifications"("organization_id", "domain", "status");

-- CreateIndex
CREATE INDEX "notifications_entity_type_entity_id_idx" ON "notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_fingerprint_idx" ON "notifications"("fingerprint");

-- CreateIndex
CREATE INDEX "notifications_expires_at_idx" ON "notifications"("expires_at");

-- CreateIndex
CREATE INDEX "notifications_resolved_at_idx" ON "notifications"("resolved_at");

-- CreateIndex
CREATE INDEX "notifications_organization_id_fingerprint_lifecycle_genera_idx" ON "notifications"("organization_id", "fingerprint", "lifecycle_generation");

-- CreateIndex
CREATE INDEX "notification_occurrences_notification_id_occurred_at_idx" ON "notification_occurrences"("notification_id", "occurred_at");

-- CreateIndex
CREATE INDEX "notification_occurrences_organization_id_idx" ON "notification_occurrences"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_receipts_notification_id_user_id_key" ON "notification_receipts"("notification_id", "user_id");

-- CreateIndex
CREATE INDEX "notification_receipts_user_id_read_at_idx" ON "notification_receipts"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_receipts_organization_id_idx" ON "notification_receipts"("organization_id");

-- Partial unique index: one active notification per org + fingerprint + generation
CREATE UNIQUE INDEX "notifications_active_fingerprint_generation_key"
ON "notifications" ("organization_id", "fingerprint", "lifecycle_generation")
WHERE "status" IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED');

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_occurrences" ADD CONSTRAINT "notification_occurrences_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_occurrences" ADD CONSTRAINT "notification_occurrences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
