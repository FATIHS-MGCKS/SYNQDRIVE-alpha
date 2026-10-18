-- EXP-021 S4A — TEST-ONLY. Reverts 20260927200000_di_v0_s4a_dormant_foundation on an ephemeral
-- database so the S4A migration can be exercised against a pre-S4A baseline. Never run on
-- Production (di-v0-s4a-postgres-bootstrap.sh refuses non-local URLs).

BEGIN;

DROP TABLE IF EXISTS "di_v0_s4_research_runs_v1";
DROP TABLE IF EXISTS "di_v0_s4_research_outbox_v1";
DROP TABLE IF EXISTS "di_v0_s4_research_osm_cache_v1";

DROP TABLE "di_v0_s4_work_items";
DROP TABLE "di_v0_s4_trip_primary_boundary_seq";
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
DROP FUNCTION di_v0_s4_trip_primary_boundary_seq_scope_guard();

DELETE FROM "_prisma_migrations" WHERE migration_name IN (
  '20260927200000_di_v0_s4a_dormant_foundation',
  '20260928120000_di_v0_s4b_boundary_occurrence_and_execution_v2',
  '20261013120000_di_v0_s4_near_realtime_eligible_ck',
  '20261017183000_di_v0_s4_research_v1',
  '20261017194500_di_v0_s4_research_outbox_intent_v2',
  '20261017203000_di_v0_s4_research_runs_idempotency_fix'
);

COMMIT;
