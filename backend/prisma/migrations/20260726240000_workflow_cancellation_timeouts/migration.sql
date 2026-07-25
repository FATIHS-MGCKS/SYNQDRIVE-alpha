-- Workflow cancellation metadata (Phase 5 Prompt 23)

ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" TEXT;
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "cancelled_by_actor_type" "WorkflowRuntimeStatusActorType";
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;

CREATE INDEX IF NOT EXISTS "workflow_runs_org_cancelled_at_idx"
  ON "workflow_runs"("organization_id", "cancelled_at");

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
