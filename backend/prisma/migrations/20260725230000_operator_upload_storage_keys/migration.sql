-- Operator upload private object storage metadata (Prompt 22)
ALTER TABLE "operator_uploads" ADD COLUMN IF NOT EXISTS "storage_object_key" TEXT;
ALTER TABLE "operator_uploads" ADD COLUMN IF NOT EXISTS "storage_provider" TEXT;

CREATE INDEX IF NOT EXISTS "operator_uploads_storage_object_key_idx"
  ON "operator_uploads" ("storage_object_key");
