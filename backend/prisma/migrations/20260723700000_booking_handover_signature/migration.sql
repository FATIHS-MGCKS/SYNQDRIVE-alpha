-- Prompt 20 — Encrypted handover signature storage (no legacy data-URL backfill in SQL).

CREATE TYPE "HandoverSignatureRole" AS ENUM ('CUSTOMER', 'STAFF');

CREATE TYPE "BookingHandoverSignatureStorageStatus" AS ENUM (
  'PENDING_MIGRATION',
  'STORED',
  'LEGACY_CLEARED'
);

CREATE TABLE IF NOT EXISTS "booking_handover_signatures" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "protocol_id" TEXT NOT NULL,
  "role" "HandoverSignatureRole" NOT NULL,
  "signer_name" TEXT,
  "signed_at" TIMESTAMP(3) NOT NULL,
  "object_key" TEXT,
  "storage_provider" TEXT,
  "content_hash" TEXT,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "storage_status" "BookingHandoverSignatureStorageStatus" NOT NULL DEFAULT 'PENDING_MIGRATION',
  "migrated_at" TIMESTAMP(3),
  "legacy_cleared_at" TIMESTAMP(3),
  "migration_run_id" TEXT,
  "retention_class" TEXT NOT NULL DEFAULT 'HANDOVER_SIGNATURE',
  "deletion_eligible_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_handover_signatures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_handover_signatures_protocol_role_key"
  ON "booking_handover_signatures"("protocol_id", "role");

CREATE INDEX IF NOT EXISTS "booking_handover_signatures_org_booking_idx"
  ON "booking_handover_signatures"("organization_id", "booking_id");

CREATE INDEX IF NOT EXISTS "booking_handover_signatures_org_storage_status_idx"
  ON "booking_handover_signatures"("organization_id", "storage_status");

CREATE INDEX IF NOT EXISTS "booking_handover_signatures_org_retention_eligible_idx"
  ON "booking_handover_signatures"("organization_id", "retention_class", "deletion_eligible_at");

ALTER TABLE "booking_handover_signatures"
  ADD CONSTRAINT "booking_handover_signatures_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_signatures"
  ADD CONSTRAINT "booking_handover_signatures_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_signatures"
  ADD CONSTRAINT "booking_handover_signatures_protocol_id_fkey"
  FOREIGN KEY ("protocol_id") REFERENCES "booking_handover_protocols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "booking_handover_signature_access_tokens" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "signature_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_by_user_id" TEXT,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_handover_signature_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_handover_signature_access_tokens_token_hash_idx"
  ON "booking_handover_signature_access_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "booking_handover_signature_access_tokens_signature_expires_idx"
  ON "booking_handover_signature_access_tokens"("signature_id", "expires_at");

ALTER TABLE "booking_handover_signature_access_tokens"
  ADD CONSTRAINT "booking_handover_signature_access_tokens_signature_id_fkey"
  FOREIGN KEY ("signature_id") REFERENCES "booking_handover_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "booking_handover_signature_migration_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "protocol_id" TEXT NOT NULL,
  "signature_id" TEXT,
  "role" "HandoverSignatureRole" NOT NULL,
  "migration_run_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "detail" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_handover_signature_migration_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_handover_signature_migration_events_org_run_idx"
  ON "booking_handover_signature_migration_events"("organization_id", "migration_run_id");

CREATE INDEX IF NOT EXISTS "booking_handover_signature_migration_events_protocol_role_idx"
  ON "booking_handover_signature_migration_events"("protocol_id", "role");

ALTER TABLE "booking_handover_signature_migration_events"
  ADD CONSTRAINT "booking_handover_signature_migration_events_signature_id_fkey"
  FOREIGN KEY ("signature_id") REFERENCES "booking_handover_signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
