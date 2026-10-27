-- P3: optional per-field registration identity provenance (legacy vehicles remain null).
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "registration_identity_provenance" JSONB;
