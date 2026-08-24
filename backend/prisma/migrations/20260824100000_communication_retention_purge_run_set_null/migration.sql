-- Preserve communication retention purge-run audit when organization is deleted (IAM pattern).
ALTER TABLE "communication_retention_purge_runs" DROP CONSTRAINT IF EXISTS "communication_retention_purge_runs_organization_id_fkey";
ALTER TABLE "communication_retention_purge_runs" ADD CONSTRAINT "communication_retention_purge_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
