-- Append-only lifecycle audit events for organization legal documents (Prompt 5/32)

CREATE TABLE IF NOT EXISTS "organization_legal_document_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "legal_document_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "previous_status" TEXT,
  "new_status" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "actor_display_name" TEXT,
  "reason" TEXT,
  "change_summary" TEXT,
  "version_label" TEXT NOT NULL,
  "checksum" TEXT,
  "language" TEXT NOT NULL,
  "jurisdiction" TEXT,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_legal_document_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "organization_legal_document_events"
  ADD CONSTRAINT "organization_legal_document_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_legal_document_events"
  ADD CONSTRAINT "organization_legal_document_events_legal_document_id_fkey"
  FOREIGN KEY ("legal_document_id") REFERENCES "organization_legal_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "organization_legal_document_events_org_created_idx"
  ON "organization_legal_document_events" ("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "organization_legal_document_events_doc_created_idx"
  ON "organization_legal_document_events" ("legal_document_id", "created_at");

CREATE INDEX IF NOT EXISTS "organization_legal_document_events_org_doc_created_idx"
  ON "organization_legal_document_events" ("organization_id", "legal_document_id", "created_at");
