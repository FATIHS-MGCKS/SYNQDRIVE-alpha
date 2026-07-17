-- Canonical org-scoped document extraction archive read-model index.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "document_extraction_archive_index" (
    "id" TEXT NOT NULL,
    "extraction_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "DocumentExtractionStatus" NOT NULL,
    "document_category" TEXT,
    "document_subtype" TEXT,
    "effective_document_type" "DocumentExtractionType",
    "vehicle_id" TEXT,
    "booking_id" TEXT,
    "customer_id" TEXT,
    "driver_id" TEXT,
    "vendor_id" TEXT,
    "created_by_id" TEXT,
    "source_file_name" TEXT,
    "invoice_number" TEXT,
    "case_reference" TEXT,
    "action_status" TEXT,
    "follow_up_status" TEXT,
    "document_date" TIMESTAMP(3),
    "search_text" TEXT NOT NULL DEFAULT '',
    "uploaded_at" TIMESTAMP(3) NOT NULL,
    "applied_at" TIMESTAMP(3),
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extraction_archive_index_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_extraction_archive_index_extraction_id_key"
  ON "document_extraction_archive_index"("extraction_id");

CREATE INDEX "doc_ext_archive_org_uploaded_at_idx"
  ON "document_extraction_archive_index"("organization_id", "uploaded_at");

CREATE INDEX "doc_ext_archive_org_status_idx"
  ON "document_extraction_archive_index"("organization_id", "status");

CREATE INDEX "doc_ext_archive_org_category_subtype_idx"
  ON "document_extraction_archive_index"("organization_id", "document_category", "document_subtype");

CREATE INDEX "doc_ext_archive_org_vehicle_idx"
  ON "document_extraction_archive_index"("organization_id", "vehicle_id");

CREATE INDEX "doc_ext_archive_org_booking_idx"
  ON "document_extraction_archive_index"("organization_id", "booking_id");

CREATE INDEX "doc_ext_archive_org_customer_idx"
  ON "document_extraction_archive_index"("organization_id", "customer_id");

CREATE INDEX "doc_ext_archive_org_driver_idx"
  ON "document_extraction_archive_index"("organization_id", "driver_id");

CREATE INDEX "doc_ext_archive_org_vendor_idx"
  ON "document_extraction_archive_index"("organization_id", "vendor_id");

CREATE INDEX "doc_ext_archive_org_uploader_idx"
  ON "document_extraction_archive_index"("organization_id", "created_by_id");

CREATE INDEX "doc_ext_archive_org_invoice_idx"
  ON "document_extraction_archive_index"("organization_id", "invoice_number");

CREATE INDEX "doc_ext_archive_org_case_ref_idx"
  ON "document_extraction_archive_index"("organization_id", "case_reference");

CREATE INDEX "doc_ext_archive_org_action_status_idx"
  ON "document_extraction_archive_index"("organization_id", "action_status");

CREATE INDEX "doc_ext_archive_org_follow_up_status_idx"
  ON "document_extraction_archive_index"("organization_id", "follow_up_status");

CREATE INDEX "doc_ext_archive_org_document_date_idx"
  ON "document_extraction_archive_index"("organization_id", "document_date");

-- Controlled fulltext over indexable metadata (no raw OCR blobs).
CREATE INDEX "document_extraction_archive_index_search_text_trgm_idx"
  ON "document_extraction_archive_index" USING gin ("search_text" gin_trgm_ops);

ALTER TABLE "document_extraction_archive_index"
  ADD CONSTRAINT "document_extraction_archive_index_extraction_id_fkey"
  FOREIGN KEY ("extraction_id") REFERENCES "vehicle_document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
