-- V4.7.59 — Service / TÜV / BOKraft auto-tasks
--
-- 1) New insight types for the compliance detector (TÜV / BOKraft overdue).
--    Added as labels only; no row in this migration references them, so the
--    Postgres "unsafe use of new enum value" restriction does not apply.
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'TUV_OVERDUE';
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'BOKRAFT_OVERDUE';

-- 2) OrgTask gets provenance + idempotency columns for the Insight→Task bridge.
--    Both nullable so existing operator-created tasks stay valid without a
--    backfill. A partial-friendly UNIQUE index on dedup_key allows multiple
--    NULLs (Postgres treats NULLs as distinct) while enforcing one task per
--    (vehicle, condition) for system-generated rows.
ALTER TABLE "org_tasks" ADD COLUMN "source" TEXT;
ALTER TABLE "org_tasks" ADD COLUMN "dedup_key" TEXT;

CREATE UNIQUE INDEX "org_tasks_dedup_key_key" ON "org_tasks"("dedup_key");
CREATE INDEX "org_tasks_organization_id_source_idx" ON "org_tasks"("organization_id", "source");
