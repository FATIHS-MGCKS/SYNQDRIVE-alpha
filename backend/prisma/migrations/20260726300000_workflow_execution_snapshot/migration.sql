-- Immutable workflow execution snapshot (Phase 3 Prompt 13)

CREATE TABLE IF NOT EXISTS "workflow_execution_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "content_hash" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_execution_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_execution_snapshots_workflow_run_id_key"
  ON "workflow_execution_snapshots"("workflow_run_id");

CREATE INDEX IF NOT EXISTS "workflow_execution_snapshots_org_captured_idx"
  ON "workflow_execution_snapshots"("organization_id", "captured_at");

CREATE INDEX IF NOT EXISTS "workflow_execution_snapshots_content_hash_idx"
  ON "workflow_execution_snapshots"("content_hash");

ALTER TABLE "workflow_execution_snapshots" ADD CONSTRAINT "workflow_execution_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_execution_snapshots" ADD CONSTRAINT "workflow_execution_snapshots_workflow_run_id_fkey"
  FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
