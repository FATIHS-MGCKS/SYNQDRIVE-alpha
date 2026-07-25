-- Workflow action run claim / heartbeat fields (Phase 5 Prompt 20)

ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "claimed_by_worker_id" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMP(3);
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "workflow_action_runs_status_lease_expires_at_idx"
  ON "workflow_action_runs"("status", "lease_expires_at");
