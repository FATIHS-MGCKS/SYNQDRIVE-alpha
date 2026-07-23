-- Prompt 10: cancellation fee rental rules + revisionssichere Audit-Tabellen

ALTER TABLE "organization_rental_rules"
  ADD COLUMN IF NOT EXISTS "cancellation_fee_percent_bps" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellation_free_hours_before_pickup" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellation_min_fee_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellation_max_fee_cents" INTEGER;

CREATE TABLE IF NOT EXISTS "booking_cancellation_audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "status_command_id" TEXT,
  "from_status" "BookingStatus",
  "to_status" "BookingStatus" NOT NULL,
  "reason_code" TEXT NOT NULL,
  "description" TEXT,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "fee_cents" INTEGER NOT NULL DEFAULT 0,
  "fee_currency" TEXT NOT NULL DEFAULT 'EUR',
  "actor_user_id" TEXT,
  "actor_display_name" TEXT,
  "request_ip_truncated" TEXT,
  "request_user_agent" TEXT,
  "process_status_json" JSONB,
  "content_hash" TEXT NOT NULL,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_cancellation_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "booking_status_override_audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "status_command_id" TEXT,
  "from_status" "BookingStatus" NOT NULL,
  "to_status" "BookingStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "affected_invariants" JSONB NOT NULL,
  "approval_request_id" TEXT,
  "actor_user_id" TEXT,
  "actor_display_name" TEXT,
  "request_ip_truncated" TEXT,
  "request_user_agent" TEXT,
  "content_hash" TEXT NOT NULL,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_status_override_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_cancellation_audit_events_org_booking_created_idx"
  ON "booking_cancellation_audit_events"("organization_id", "booking_id", "created_at");

CREATE INDEX IF NOT EXISTS "booking_cancellation_audit_events_org_created_idx"
  ON "booking_cancellation_audit_events"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "booking_status_override_audit_events_org_booking_created_idx"
  ON "booking_status_override_audit_events"("organization_id", "booking_id", "created_at");

CREATE INDEX IF NOT EXISTS "booking_status_override_audit_events_org_created_idx"
  ON "booking_status_override_audit_events"("organization_id", "created_at");

ALTER TABLE "booking_cancellation_audit_events"
  ADD CONSTRAINT "booking_cancellation_audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_cancellation_audit_events"
  ADD CONSTRAINT "booking_cancellation_audit_events_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_status_override_audit_events"
  ADD CONSTRAINT "booking_status_override_audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_status_override_audit_events"
  ADD CONSTRAINT "booking_status_override_audit_events_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
