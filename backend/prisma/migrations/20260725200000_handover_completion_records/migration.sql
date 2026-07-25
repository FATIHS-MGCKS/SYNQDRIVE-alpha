-- Prompt 17: tamper-evident handover completion records + protocol versioning

ALTER TABLE "booking_handover_protocols"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "superseded_by_id" UUID,
  ADD COLUMN "superseded_at" TIMESTAMPTZ;

DROP INDEX IF EXISTS "booking_handover_protocols_booking_id_kind_key";

CREATE UNIQUE INDEX "booking_handover_protocols_current_booking_kind_idx"
  ON "booking_handover_protocols" ("booking_id", "kind")
  WHERE "is_current" = true;

CREATE INDEX "booking_handover_protocols_booking_id_kind_is_current_idx"
  ON "booking_handover_protocols" ("booking_id", "kind", "is_current");

CREATE INDEX "booking_handover_protocols_superseded_by_id_idx"
  ON "booking_handover_protocols" ("superseded_by_id");

ALTER TABLE "booking_handover_protocols"
  ADD CONSTRAINT "booking_handover_protocols_superseded_by_id_fkey"
  FOREIGN KEY ("superseded_by_id") REFERENCES "booking_handover_protocols"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "HandoverCompletionAuditEventType" AS ENUM ('CREATED', 'CORRECTED', 'SUPERSEDED');

CREATE TABLE "booking_handover_completion_records" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "customer_id" UUID,
  "station_id" UUID,
  "protocol_id" UUID NOT NULL,
  "kind" "HandoverKind" NOT NULL,
  "document_version" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "payload_canonical" JSONB NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "signed_content_hash" TEXT NOT NULL,
  "completed_at" TIMESTAMPTZ NOT NULL,
  "completed_by_user_id" UUID,
  "completed_by_name" TEXT,
  "previous_version_id" UUID,
  "superseded_by_id" UUID,
  "superseded_at" TIMESTAMPTZ,
  "correction_reason" TEXT,
  "override_user_id" UUID,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_handover_completion_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_handover_completion_records_booking_id_kind_version_key"
  ON "booking_handover_completion_records" ("booking_id", "kind", "version");

CREATE UNIQUE INDEX "booking_handover_completion_records_current_booking_kind_idx"
  ON "booking_handover_completion_records" ("booking_id", "kind")
  WHERE "is_current" = true;

CREATE INDEX "booking_handover_completion_records_organization_id_idx"
  ON "booking_handover_completion_records" ("organization_id");

CREATE INDEX "booking_handover_completion_records_protocol_id_idx"
  ON "booking_handover_completion_records" ("protocol_id");

CREATE INDEX "booking_handover_completion_records_booking_id_kind_is_current_idx"
  ON "booking_handover_completion_records" ("booking_id", "kind", "is_current");

CREATE INDEX "booking_handover_completion_records_superseded_by_id_idx"
  ON "booking_handover_completion_records" ("superseded_by_id");

ALTER TABLE "booking_handover_completion_records"
  ADD CONSTRAINT "booking_handover_completion_records_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_completion_records"
  ADD CONSTRAINT "booking_handover_completion_records_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_completion_records"
  ADD CONSTRAINT "booking_handover_completion_records_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_completion_records"
  ADD CONSTRAINT "booking_handover_completion_records_protocol_id_fkey"
  FOREIGN KEY ("protocol_id") REFERENCES "booking_handover_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_handover_completion_records"
  ADD CONSTRAINT "booking_handover_completion_records_previous_version_id_fkey"
  FOREIGN KEY ("previous_version_id") REFERENCES "booking_handover_completion_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_handover_completion_records"
  ADD CONSTRAINT "booking_handover_completion_records_superseded_by_id_fkey"
  FOREIGN KEY ("superseded_by_id") REFERENCES "booking_handover_completion_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "booking_handover_completion_audit_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "kind" "HandoverKind" NOT NULL,
  "event_type" "HandoverCompletionAuditEventType" NOT NULL,
  "completion_record_id" UUID NOT NULL,
  "previous_completion_record_id" UUID,
  "new_completion_record_id" UUID,
  "actor_user_id" UUID,
  "actor_display_name" TEXT,
  "correction_reason" TEXT,
  "payload_hash" TEXT,
  "signed_content_hash" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_handover_completion_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_handover_completion_audit_events_organization_id_idx"
  ON "booking_handover_completion_audit_events" ("organization_id");

CREATE INDEX "booking_handover_completion_audit_events_booking_id_kind_idx"
  ON "booking_handover_completion_audit_events" ("booking_id", "kind");

CREATE INDEX "booking_handover_completion_audit_events_completion_record_id_idx"
  ON "booking_handover_completion_audit_events" ("completion_record_id");

ALTER TABLE "booking_handover_completion_audit_events"
  ADD CONSTRAINT "booking_handover_completion_audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_completion_audit_events"
  ADD CONSTRAINT "booking_handover_completion_audit_events_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_completion_audit_events"
  ADD CONSTRAINT "booking_handover_completion_audit_events_completion_record_id_fkey"
  FOREIGN KEY ("completion_record_id") REFERENCES "booking_handover_completion_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
