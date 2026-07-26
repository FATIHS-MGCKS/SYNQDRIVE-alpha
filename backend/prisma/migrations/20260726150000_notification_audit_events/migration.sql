-- CreateEnum
CREATE TYPE "NotificationAuditActorType" AS ENUM ('USER', 'SYSTEM', 'AUTOMATION', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "NotificationAuditEventType" AS ENUM (
  'NOTIFICATION_CREATED',
  'SEVERITY_ESCALATED',
  'ACKNOWLEDGED',
  'SNOOZED',
  'UNSNOOZED',
  'RESOLVED',
  'REOPENED',
  'ARCHIVED',
  'DELIVERY_FAILED',
  'DELIVERY_DEAD_LETTER',
  'WORKFLOW_TRIGGERED',
  'MANUAL_INTERVENTION',
  'POLICY_REJECTED',
  'INGEST_IGNORED'
);

-- CreateEnum
CREATE TYPE "NotificationAuditRetentionClass" AS ENUM ('TECHNICAL_LOG', 'REVISION_AUDIT', 'GOVERNANCE_AUDIT');

-- CreateTable
CREATE TABLE "notification_audit_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "notification_id" TEXT,
    "event_type" "NotificationAuditEventType" NOT NULL,
    "retention_class" "NotificationAuditRetentionClass" NOT NULL,
    "actor_type" "NotificationAuditActorType" NOT NULL,
    "actor_user_id" TEXT,
    "previous_state" JSONB,
    "next_state" JSONB,
    "reason_code" TEXT,
    "correlation_id" TEXT,
    "client_meta" JSONB,
    "payload_hash" TEXT,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_audit_events_organization_id_created_at_idx" ON "notification_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_audit_events_organization_id_notification_id_idx" ON "notification_audit_events"("organization_id", "notification_id");

-- CreateIndex
CREATE INDEX "notification_audit_events_organization_id_event_type_idx" ON "notification_audit_events"("organization_id", "event_type");

-- CreateIndex
CREATE INDEX "notification_audit_events_correlation_id_idx" ON "notification_audit_events"("correlation_id");

-- CreateIndex
CREATE INDEX "notification_audit_events_retention_class_created_at_idx" ON "notification_audit_events"("retention_class", "created_at");

-- AddForeignKey
ALTER TABLE "notification_audit_events" ADD CONSTRAINT "notification_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_audit_events" ADD CONSTRAINT "notification_audit_events_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
