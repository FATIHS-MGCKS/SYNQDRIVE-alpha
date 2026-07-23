-- Booking preparation artifact state (Prompt 24)

CREATE TYPE "BookingPreparationArtifactType" AS ENUM (
  'PRICING',
  'INVOICE',
  'PAYMENT',
  'LEGAL_DOCUMENTS',
  'RENTAL_AGREEMENT',
  'PICKUP_TASK',
  'RETURN_TASK',
  'CUSTOMER_EMAIL',
  'INTERNAL_NOTIFICATION'
);

CREATE TYPE "BookingPreparationArtifactStatus" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'RETRY_SCHEDULED'
);

CREATE TABLE "booking_preparation_artifact_states" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "artifact_type" "BookingPreparationArtifactType" NOT NULL,
  "status" "BookingPreparationArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "required" BOOLEAN NOT NULL DEFAULT true,
  "blocks_pickup" BOOLEAN NOT NULL DEFAULT false,
  "blocks_return" BOOLEAN NOT NULL DEFAULT false,
  "last_error" TEXT,
  "last_error_code" TEXT,
  "last_attempt_at" TIMESTAMP(3),
  "ready_at" TIMESTAMP(3),
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "source_ref" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "booking_preparation_artifact_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_preparation_recovery_attempts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "artifact_type" "BookingPreparationArtifactType" NOT NULL,
  "action" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_preparation_recovery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_preparation_artifact_states_booking_id_artifact_type_key"
  ON "booking_preparation_artifact_states"("booking_id", "artifact_type");
CREATE INDEX "booking_preparation_artifact_states_organization_id_status_idx"
  ON "booking_preparation_artifact_states"("organization_id", "status");
CREATE INDEX "booking_preparation_artifact_states_organization_id_booking_id_idx"
  ON "booking_preparation_artifact_states"("organization_id", "booking_id");
CREATE INDEX "booking_preparation_artifact_states_status_updated_at_idx"
  ON "booking_preparation_artifact_states"("status", "updated_at");

CREATE UNIQUE INDEX "booking_preparation_recovery_attempts_idempotency_key_key"
  ON "booking_preparation_recovery_attempts"("idempotency_key");
CREATE INDEX "booking_preparation_recovery_attempts_organization_id_booking_id_idx"
  ON "booking_preparation_recovery_attempts"("organization_id", "booking_id");
CREATE INDEX "booking_preparation_recovery_attempts_booking_id_artifact_type_created_at_idx"
  ON "booking_preparation_recovery_attempts"("booking_id", "artifact_type", "created_at");

ALTER TABLE "booking_preparation_artifact_states"
  ADD CONSTRAINT "booking_preparation_artifact_states_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_preparation_artifact_states"
  ADD CONSTRAINT "booking_preparation_artifact_states_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_preparation_recovery_attempts"
  ADD CONSTRAINT "booking_preparation_recovery_attempts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_preparation_recovery_attempts"
  ADD CONSTRAINT "booking_preparation_recovery_attempts_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_preparation_recovery_attempts"
  ADD CONSTRAINT "booking_preparation_recovery_attempts_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
