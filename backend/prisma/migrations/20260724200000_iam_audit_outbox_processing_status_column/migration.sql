-- Align iam_audit_outbox column name with Prisma @map("processing_status")
-- (migrations originally created "status"; business_audit_outbox uses processing_status)

ALTER TABLE "iam_audit_outbox" RENAME COLUMN "status" TO "processing_status";

DROP INDEX IF EXISTS "iam_audit_outbox_status_next_retry_at_idx";
CREATE INDEX IF NOT EXISTS "iam_audit_outbox_processing_status_next_retry_at_idx"
  ON "iam_audit_outbox"("processing_status", "next_retry_at");
