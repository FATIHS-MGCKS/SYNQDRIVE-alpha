-- Prompt 10/32: configurable four-eyes policy for legal document lifecycle
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "legal_document_four_eyes_enabled" BOOLEAN NOT NULL DEFAULT false;
