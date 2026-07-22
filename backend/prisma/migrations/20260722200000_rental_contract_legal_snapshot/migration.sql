-- Rental contract immutable legal reference snapshot (Prompt 17/32)
--
-- Stores verification-grade metadata for each legal text version frozen at
-- contract generation time. Additive only — existing snapshot JSON unchanged.

ALTER TABLE "rental_contracts"
  ADD COLUMN IF NOT EXISTS "legal_refs_snapshot" JSONB;

ALTER TABLE "rental_contracts"
  ADD COLUMN IF NOT EXISTS "legal_snapshot_frozen_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "rental_contracts_legal_snapshot_frozen_at_idx"
  ON "rental_contracts"("legal_snapshot_frozen_at");
