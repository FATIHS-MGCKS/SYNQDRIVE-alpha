-- Booking legal acceptance events (Prompt 17)
-- Append-only consent / acknowledgment / signature proof for bookings.
-- No backfill from legacy privacyAccepted booleans — historical rows start empty.

CREATE TYPE "BookingLegalAcceptanceActorType" AS ENUM (
  'CUSTOMER',
  'STAFF_USER',
  'SYSTEM',
  'AUTHORIZED_DRIVER'
);

CREATE TYPE "BookingLegalAcceptanceEventKind" AS ENUM (
  'ACCEPTANCE',
  'REVOCATION',
  'CORRECTION'
);

CREATE TYPE "BookingLegalAcceptanceType" AS ENUM (
  'TERMS_CONTRACT_ACCEPTANCE',
  'PRIVACY_NOTICE_ACKNOWLEDGMENT',
  'MARKETING_CONSENT',
  'OTHER_CONSENT',
  'RENTAL_CONTRACT_SIGNATURE',
  'HANDOVER_SIGNATURE',
  'RETURN_SIGNATURE'
);

CREATE TYPE "BookingLegalAcceptanceLegalBasis" AS ENUM (
  'CONTRACT',
  'LEGAL_OBLIGATION',
  'LEGITIMATE_INTEREST',
  'CONSENT',
  'NOTICE_ACKNOWLEDGMENT'
);

CREATE TABLE IF NOT EXISTS "booking_legal_acceptances" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "actor_type" "BookingLegalAcceptanceActorType" NOT NULL,
  "actor_id" TEXT,
  "event_kind" "BookingLegalAcceptanceEventKind" NOT NULL DEFAULT 'ACCEPTANCE',
  "acceptance_type" "BookingLegalAcceptanceType" NOT NULL,
  "document_type" TEXT NOT NULL,
  "document_version" TEXT NOT NULL,
  "immutable_document_hash" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "legal_basis" "BookingLegalAcceptanceLegalBasis" NOT NULL,
  "purpose" TEXT,
  "accepted_at" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "related_acceptance_id" TEXT,
  "legal_document_id" TEXT,
  "generated_document_id" TEXT,
  "handover_protocol_id" TEXT,
  "request_id" TEXT,
  "metadata" JSONB,
  "retention_class" TEXT NOT NULL DEFAULT 'LEGAL_ACCEPTANCE',
  "retain_until" TIMESTAMP(3),
  "legal_hold" BOOLEAN NOT NULL DEFAULT false,
  "legal_hold_reason" TEXT,
  "legal_hold_set_at" TIMESTAMP(3),
  "legal_hold_set_by_user_id" TEXT,
  "deletion_eligible_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_legal_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_legal_acceptances_org_request_id_key"
  ON "booking_legal_acceptances"("organization_id", "request_id")
  WHERE "request_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_org_booking_idx"
  ON "booking_legal_acceptances"("organization_id", "booking_id");

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_org_customer_idx"
  ON "booking_legal_acceptances"("organization_id", "customer_id");

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_org_document_type_idx"
  ON "booking_legal_acceptances"("organization_id", "document_type");

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_org_accepted_at_idx"
  ON "booking_legal_acceptances"("organization_id", "accepted_at");

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_org_type_accepted_idx"
  ON "booking_legal_acceptances"("organization_id", "acceptance_type", "accepted_at");

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_org_retention_eligible_idx"
  ON "booking_legal_acceptances"("organization_id", "retention_class", "deletion_eligible_at");

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_org_legal_hold_idx"
  ON "booking_legal_acceptances"("organization_id", "legal_hold");

CREATE INDEX IF NOT EXISTS "booking_legal_acceptances_related_acceptance_idx"
  ON "booking_legal_acceptances"("related_acceptance_id");

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_legal_document_id_fkey"
  FOREIGN KEY ("legal_document_id") REFERENCES "organization_legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_generated_document_id_fkey"
  FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_handover_protocol_id_fkey"
  FOREIGN KEY ("handover_protocol_id") REFERENCES "booking_handover_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_legal_acceptances"
  ADD CONSTRAINT "booking_legal_acceptances_related_acceptance_id_fkey"
  FOREIGN KEY ("related_acceptance_id") REFERENCES "booking_legal_acceptances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
