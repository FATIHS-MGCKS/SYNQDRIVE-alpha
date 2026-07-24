-- Workflow action capability remediation fields

ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "remediation_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "remediation_reason" TEXT;
ALTER TABLE "org_workflows" ADD COLUMN IF NOT EXISTS "remediation_detected_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "org_workflows_organization_id_remediation_required_idx"
  ON "org_workflows"("organization_id", "remediation_required");

-- Disable workflows that reference known non-production action types.
UPDATE "org_workflows"
SET
  "status" = 'INVALID',
  "enabled" = false,
  "remediation_required" = true,
  "remediation_reason" = 'Workflow contains actions that are not production-capable',
  "remediation_detected_at" = CURRENT_TIMESTAMP
WHERE "actions"::text ~ '(ai_execute|ai_send_message|ai_book_appointment|change_cleaning_status|assign_vendor|channel\.email\.send|channel\.whatsapp\.send|channel\.sms\.send|voice\.call\.initiate|customer\.contact\.send|invoice\.charge|booking\.cancel)';
