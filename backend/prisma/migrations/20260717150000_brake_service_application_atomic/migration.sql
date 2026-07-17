-- Prompt 9: atomic brake service application inbox + transactional outbox

CREATE TYPE "BrakeServiceApplicationStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'APPLIED',
  'HISTORY_ONLY',
  'FAILED'
);

CREATE TYPE "BrakeServiceOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "BrakeServiceOutboxEventType" AS ENUM (
  'RECALCULATE',
  'RESOLVE_ALERTS',
  'NOTIFY'
);

CREATE TABLE "brake_service_applications" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "client_request_id" TEXT,
  "external_document_id" TEXT,
  "request_hash" TEXT NOT NULL,
  "request_payload" JSONB NOT NULL,
  "status" "BrakeServiceApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "service_event_id" TEXT,
  "result_json" JSONB,
  "audit_log" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "actor_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "applied_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),

  CONSTRAINT "brake_service_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brake_service_applications_org_vehicle_idempotency_key_key"
  ON "brake_service_applications"("organization_id", "vehicle_id", "idempotency_key");

CREATE UNIQUE INDEX "brake_service_applications_service_event_id_key"
  ON "brake_service_applications"("service_event_id");

CREATE INDEX "brake_service_applications_vehicle_id_created_at_idx"
  ON "brake_service_applications"("vehicle_id", "created_at");

CREATE INDEX "brake_service_applications_status_created_at_idx"
  ON "brake_service_applications"("status", "created_at");

ALTER TABLE "brake_service_applications"
  ADD CONSTRAINT "brake_service_applications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brake_service_applications"
  ADD CONSTRAINT "brake_service_applications_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brake_service_applications"
  ADD CONSTRAINT "brake_service_applications_service_event_id_fkey"
  FOREIGN KEY ("service_event_id") REFERENCES "vehicle_service_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "brake_service_outbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "service_event_id" TEXT NOT NULL,
  "event_type" "BrakeServiceOutboxEventType" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "BrakeServiceOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brake_service_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brake_service_outbox_idempotency_key_key"
  ON "brake_service_outbox"("idempotency_key");

CREATE INDEX "brake_service_outbox_status_available_at_idx"
  ON "brake_service_outbox"("status", "available_at");

CREATE INDEX "brake_service_outbox_application_id_idx"
  ON "brake_service_outbox"("application_id");

ALTER TABLE "brake_service_outbox"
  ADD CONSTRAINT "brake_service_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brake_service_outbox"
  ADD CONSTRAINT "brake_service_outbox_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brake_service_outbox"
  ADD CONSTRAINT "brake_service_outbox_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "brake_service_applications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brake_service_outbox"
  ADD CONSTRAINT "brake_service_outbox_service_event_id_fkey"
  FOREIGN KEY ("service_event_id") REFERENCES "vehicle_service_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_service_events"
  ADD COLUMN IF NOT EXISTS "brake_application_status" "BrakeServiceApplicationStatus";
