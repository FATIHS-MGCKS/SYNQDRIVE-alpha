-- Legal document privacy pointers + GeneratedDocument relations (Prompt 2/32)
--
-- Adds nullable privacy_document_id to booking bundles and rental contracts.
-- Introduces FK relations from legal snapshot pointers (terms / withdrawal / privacy)
-- to generated_documents with ON DELETE SET NULL so historical booking/contract
-- rows are never cascade-deleted when a document row is removed.
--
-- Backward compatible: additive columns only; no data rewrite; no NOT NULL constraints.
-- Existing terms/withdrawal FKs use NOT VALID so orphan historical ids do not block deploy.

-- 1) New nullable privacy pointer columns
ALTER TABLE "booking_document_bundles"
  ADD COLUMN IF NOT EXISTS "privacy_document_id" TEXT;

ALTER TABLE "rental_contracts"
  ADD COLUMN IF NOT EXISTS "privacy_document_id" TEXT;

-- 2) Indexes for legal pointer lookups
CREATE INDEX IF NOT EXISTS "booking_document_bundles_terms_document_id_idx"
  ON "booking_document_bundles"("terms_document_id");

CREATE INDEX IF NOT EXISTS "booking_document_bundles_withdrawal_document_id_idx"
  ON "booking_document_bundles"("withdrawal_document_id");

CREATE INDEX IF NOT EXISTS "booking_document_bundles_privacy_document_id_idx"
  ON "booking_document_bundles"("privacy_document_id");

CREATE INDEX IF NOT EXISTS "rental_contracts_terms_document_id_idx"
  ON "rental_contracts"("terms_document_id");

CREATE INDEX IF NOT EXISTS "rental_contracts_withdrawal_document_id_idx"
  ON "rental_contracts"("withdrawal_document_id");

CREATE INDEX IF NOT EXISTS "rental_contracts_privacy_document_id_idx"
  ON "rental_contracts"("privacy_document_id");

-- 3) Foreign keys to generated_documents (SET NULL on delete — preserve bundle/contract rows)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_document_bundles_terms_document_id_fkey') THEN
    ALTER TABLE "booking_document_bundles"
      ADD CONSTRAINT "booking_document_bundles_terms_document_id_fkey"
      FOREIGN KEY ("terms_document_id") REFERENCES "generated_documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_document_bundles_withdrawal_document_id_fkey') THEN
    ALTER TABLE "booking_document_bundles"
      ADD CONSTRAINT "booking_document_bundles_withdrawal_document_id_fkey"
      FOREIGN KEY ("withdrawal_document_id") REFERENCES "generated_documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_document_bundles_privacy_document_id_fkey') THEN
    ALTER TABLE "booking_document_bundles"
      ADD CONSTRAINT "booking_document_bundles_privacy_document_id_fkey"
      FOREIGN KEY ("privacy_document_id") REFERENCES "generated_documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_contracts_terms_document_id_fkey') THEN
    ALTER TABLE "rental_contracts"
      ADD CONSTRAINT "rental_contracts_terms_document_id_fkey"
      FOREIGN KEY ("terms_document_id") REFERENCES "generated_documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_contracts_withdrawal_document_id_fkey') THEN
    ALTER TABLE "rental_contracts"
      ADD CONSTRAINT "rental_contracts_withdrawal_document_id_fkey"
      FOREIGN KEY ("withdrawal_document_id") REFERENCES "generated_documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_contracts_privacy_document_id_fkey') THEN
    ALTER TABLE "rental_contracts"
      ADD CONSTRAINT "rental_contracts_privacy_document_id_fkey"
      FOREIGN KEY ("privacy_document_id") REFERENCES "generated_documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
