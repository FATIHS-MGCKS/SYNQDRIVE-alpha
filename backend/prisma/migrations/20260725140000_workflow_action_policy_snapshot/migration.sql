-- Workflow action run policy snapshot (Phase 7 Prompt 32)
ALTER TABLE "org_workflow_action_runs"
  ADD COLUMN IF NOT EXISTS "policy_snapshot" JSONB;
