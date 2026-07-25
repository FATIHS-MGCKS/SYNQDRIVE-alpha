-- Workflow action run execution fields (Phase 5 Prompt 21)

ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "timeout_at" TIMESTAMP(3);
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "input_snapshot" JSONB;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "result_summary" JSONB;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "error_code" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "error_category" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "error_summary" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "provider_reference" TEXT;
ALTER TABLE "workflow_action_runs" ADD COLUMN IF NOT EXISTS "blocking_on_failure" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "workflow_action_runs_org_status_next_attempt_idx"
  ON "workflow_action_runs"("organization_id", "status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "workflow_action_runs_timeout_at_idx"
  ON "workflow_action_runs"("timeout_at")
  WHERE "status" = 'RUNNING';
