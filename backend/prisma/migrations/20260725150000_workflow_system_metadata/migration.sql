ALTER TABLE "org_workflows"
  ADD COLUMN IF NOT EXISTS "system_metadata" JSONB;

CREATE INDEX IF NOT EXISTS "org_workflows_system_metadata_catalog_key_idx"
  ON "org_workflows" ((system_metadata->>'catalogKey'))
  WHERE "is_template" = true AND "category" = 'task_automation_system';
