-- EXP-021 S4A — TEST-ONLY. Reverts 20260927200000_di_v0_s4a_dormant_foundation on an ephemeral
-- database so the S4A migration can be exercised against a pre-S4A baseline. Never run on
-- Production (di-v0-s4a-postgres-bootstrap.sh refuses non-local URLs).

BEGIN;

DROP TABLE "di_v0_s4_work_items";
DROP TABLE "di_v0_s4_evidence_snapshots";
DROP TABLE "di_v0_s4_control";
DROP TABLE "di_v0_s4_pipeline_versions";

DROP TRIGGER di_v0_shadow_interval_scope_guard_trg ON "di_v0_shadow_intervals";
DROP TRIGGER di_v0_shadow_run_scope_guard_trg ON "di_v0_shadow_runs";
ALTER TABLE "di_v0_shadow_runs" DROP CONSTRAINT "di_v0_shadow_runs_id_scope_uq";

DROP FUNCTION di_v0_s4_work_item_immutable_guard();
DROP FUNCTION di_v0_s4_work_item_scope_guard();
DROP FUNCTION di_v0_s4_evidence_snapshot_immutable_guard();
DROP FUNCTION di_v0_s4_evidence_snapshot_scope_guard();
DROP FUNCTION di_v0_shadow_interval_scope_guard();
DROP FUNCTION di_v0_shadow_run_scope_guard();
DROP FUNCTION di_v0_s4_pipeline_version_guard();

DELETE FROM "_prisma_migrations" WHERE migration_name = '20260927200000_di_v0_s4a_dormant_foundation';

COMMIT;
