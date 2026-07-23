-- Legal document delivery evidence (Prompt 18/32)
-- Append-only customer contact proof for legal texts (not consent).

CREATE TABLE IF NOT EXISTS "legal_document_delivery_evidence" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "legal_document_id" TEXT NOT NULL,
  "generated_document_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "version_label" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "checksum" TEXT,
  "presented_at" TIMESTAMP(3) NOT NULL,
  "delivery_channel" TEXT NOT NULL,
  "delivery_status" TEXT NOT NULL,
  "delivered_at" TIMESTAMP(3),
  "acknowledged_at" TIMESTAMP(3),
  "acknowledgment_method" TEXT,
  "signature_reference" TEXT,
  "actor_user_id" TEXT,
  "recipient_snapshot" JSONB NOT NULL,
  "request_id" TEXT,
  "outbound_email_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_document_delivery_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "legal_document_delivery_evidence_org_request_id_key"
  ON "legal_document_delivery_evidence"("organization_id", "request_id")
  WHERE "request_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "legal_document_delivery_evidence_org_booking_idx"
  ON "legal_document_delivery_evidence"("organization_id", "booking_id");

CREATE INDEX IF NOT EXISTS "legal_document_delivery_evidence_org_booking_doc_type_idx"
  ON "legal_document_delivery_evidence"("organization_id", "booking_id", "document_type");

CREATE INDEX IF NOT EXISTS "legal_document_delivery_evidence_generated_document_idx"
  ON "legal_document_delivery_evidence"("generated_document_id");

CREATE INDEX IF NOT EXISTS "legal_document_delivery_evidence_outbound_email_idx"
  ON "legal_document_delivery_evidence"("outbound_email_id");

ALTER TABLE "legal_document_delivery_evidence"
  ADD CONSTRAINT "legal_document_delivery_evidence_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_document_delivery_evidence"
  ADD CONSTRAINT "legal_document_delivery_evidence_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_document_delivery_evidence"
  ADD CONSTRAINT "legal_document_delivery_evidence_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_document_delivery_evidence"
  ADD CONSTRAINT "legal_document_delivery_evidence_legal_document_id_fkey"
  FOREIGN KEY ("legal_document_id") REFERENCES "organization_legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_document_delivery_evidence"
  ADD CONSTRAINT "legal_document_delivery_evidence_generated_document_id_fkey"
  FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_document_delivery_evidence"
  ADD CONSTRAINT "legal_document_delivery_evidence_outbound_email_id_fkey"
  FOREIGN KEY ("outbound_email_id") REFERENCES "outbound_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
