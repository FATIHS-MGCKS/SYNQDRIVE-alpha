-- V4.9.68 — Canonical technical observations (extends vehicle_complaints)

-- Lifecycle + source enums
ALTER TYPE "ComplaintLifecycleStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "ComplaintLifecycleStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "ComplaintLifecycleStatus" ADD VALUE IF NOT EXISTS 'DISMISSED';

ALTER TYPE "ComplaintSource" ADD VALUE IF NOT EXISTS 'OPERATOR_RETURN';
ALTER TYPE "ComplaintSource" ADD VALUE IF NOT EXISTS 'OPERATOR_HANDOVER';
ALTER TYPE "ComplaintSource" ADD VALUE IF NOT EXISTS 'CUSTOMER_REPORT';
ALTER TYPE "ComplaintSource" ADD VALUE IF NOT EXISTS 'STAFF_INSPECTION';
ALTER TYPE "ComplaintSource" ADD VALUE IF NOT EXISTS 'AI_UPLOAD';
ALTER TYPE "ComplaintSource" ADD VALUE IF NOT EXISTS 'SYSTEM_IMPORT';

CREATE TYPE "TechnicalObservationCategory" AS ENUM (
  'EXTERIOR',
  'INTERIOR',
  'LIGHTS',
  'WIPERS_WINDOWS',
  'WHEELS_TIRES',
  'ELECTRONICS_CONTROLS',
  'NOISE_VIBRATION',
  'DRIVING_BEHAVIOR',
  'COMFORT',
  'OTHER'
);

CREATE TYPE "TechnicalObservationAffectedArea" AS ENUM (
  'FRONT',
  'REAR',
  'LEFT',
  'RIGHT',
  'INTERIOR',
  'DASHBOARD',
  'LIGHTS',
  'WHEELS',
  'TIRES',
  'ENGINE_BAY',
  'TRUNK',
  'UNKNOWN'
);

ALTER TABLE "vehicle_complaints"
  ADD COLUMN IF NOT EXISTS "created_by_worker_id" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "category" "TechnicalObservationCategory",
  ADD COLUMN IF NOT EXISTS "affected_area" "TechnicalObservationAffectedArea",
  ADD COLUMN IF NOT EXISTS "blocks_rental" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "booking_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "driver_id" TEXT,
  ADD COLUMN IF NOT EXISTS "handover_protocol_id" TEXT,
  ADD COLUMN IF NOT EXISTS "station_id" TEXT,
  ADD COLUMN IF NOT EXISTS "location_context" TEXT,
  ADD COLUMN IF NOT EXISTS "resolved_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dismissed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dismissed_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "converted_to_task_id" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_damage_id" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_service_event_id" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_service_case_id" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_service_task_id" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_complaints_organization_id_vehicle_id_status_idx"
  ON "vehicle_complaints"("organization_id", "vehicle_id", "status");

CREATE INDEX IF NOT EXISTS "vehicle_complaints_booking_id_idx"
  ON "vehicle_complaints"("booking_id");
