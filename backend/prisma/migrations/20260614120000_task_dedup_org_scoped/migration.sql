-- Org-scoped dedup keys: allow the same dedupKey in different organizations.
DROP INDEX IF EXISTS "org_tasks_dedup_key_key";

CREATE UNIQUE INDEX "org_tasks_org_dedup_key" ON "org_tasks"("organization_id", "dedup_key");
