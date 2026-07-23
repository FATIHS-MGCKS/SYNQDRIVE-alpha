-- Booking legal document presentation snapshots (Prompt 18)
-- Immutable versioned snapshots with cryptographic hash for legal acceptance binding.

CREATE TYPE "BookingLegalDocumentSnapshotContext" AS ENUM (
  'CHECKOUT',
  'RENTAL_CONTRACT',
  'HANDOVER',
  'STATIC_LEGAL_ATTACH',
  'MANUAL'
);

CREATE TYPE "BookingLegalDocumentSnapshotIntegrityStatus" AS ENUM (
  'VERIFIED',
  'UNVERIFIED',
  'CHECKSUM_MISMATCH',
  'MISSING_OBJECT'
);

CREATE TABLE IF NOT EXISTS "booking_legal_document_snapshots" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "template_key" TEXT,
  "template_version" TEXT,
  "rendered_version" TEXT NOT NULL,
  "hash_algorithm" TEXT NOT NULL DEFAULT 'sha256',
  "content_hash" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "generated_document_id" TEXT NOT NULL,
  "legal_document_id" TEXT,
  "presentation_context" "BookingLegalDocumentSnapshotContext" NOT NULL,
  "integrity_status" "BookingLegalDocumentSnapshotIntegrityStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "integrity_verified_at" TIMESTAMP(3),
  "idempotency_key" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_legal_document_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_legal_document_snapshots_org_idempotency_key"
  ON "booking_legal_document_snapshots"("organization_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "booking_legal_document_snapshots_org_booking_idx"
  ON "booking_legal_document_snapshots"("organization_id", "booking_id");

CREATE INDEX IF NOT EXISTS "booking_legal_document_snapshots_org_booking_doc_type_idx"
  ON "booking_legal_document_snapshots"("organization_id", "booking_id", "document_type");

CREATE INDEX IF NOT EXISTS "booking_legal_document_snapshots_org_hash_idx"
  ON "booking_legal_document_snapshots"("organization_id", "content_hash");

CREATE INDEX IF NOT EXISTS "booking_legal_document_snapshots_generated_document_idx"
  ON "booking_legal_document_snapshots"("generated_document_id");

CREATE TABLE IF NOT EXISTS "booking_legal_document_snapshot_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "snapshot_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "detail" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_legal_document_snapshot_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_legal_document_snapshot_events_org_booking_created_idx"
  ON "booking_legal_document_snapshot_events"("organization_id", "booking_id", "created_at");

CREATE INDEX IF NOT EXISTS "booking_legal_document_snapshot_events_snapshot_created_idx"
  ON "booking_legal_document_snapshot_events"("snapshot_id", "created_at");

ALTER TABLE "booking_legal_document_snapshots"
  ADD CONSTRAINT "booking_legal_document_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_document_snapshots"
  ADD CONSTRAINT "booking_legal_document_snapshots_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_document_snapshots"
  ADD CONSTRAINT "booking_legal_document_snapshots_generated_document_id_fkey"
  FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_legal_document_snapshots"
  ADD CONSTRAINT "booking_legal_document_snapshots_legal_document_id_fkey"
  FOREIGN KEY ("legal_document_id") REFERENCES "organization_legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_legal_document_snapshot_events"
  ADD CONSTRAINT "booking_legal_document_snapshot_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_document_snapshot_events"
  ADD CONSTRAINT "booking_legal_document_snapshot_events_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_document_snapshot_events"
  ADD CONSTRAINT "booking_legal_document_snapshot_events_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "booking_legal_document_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_acceptances"
  ADD COLUMN IF NOT EXISTS "legal_document_snapshot_id" TEXT;

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_snapshot_idx"
  ON "booking_legal_acceptances"("legal_document_snapshot_id");

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_legal_document_snapshot_id_fkey"
  FOREIGN KEY ("legal_document_snapshot_id") REFERENCES "booking_legal_document_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
