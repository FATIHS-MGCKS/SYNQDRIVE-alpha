-- EXP-021 S4B precondition: boundary_occurrence logical key + execution identity V2 (dormant, empty-state guarded).
BEGIN;

DO $$
DECLARE
  s4_rows bigint;
  s2_runs bigint;
  s2_intervals bigint;
BEGIN
  SELECT count(*) INTO s4_rows FROM di_v0_s4_work_items;
  SELECT count(*) INTO s2_runs FROM di_v0_shadow_runs;
  SELECT count(*) INTO s2_intervals FROM di_v0_shadow_intervals;
  IF s4_rows > 0 OR s2_runs > 0 OR s2_intervals > 0 THEN
    RAISE EXCEPTION 'di_v0_s4b_boundary_occurrence: requires empty S4 work items and empty S2 shadow tables (s4=%, s2_runs=%, s2_intervals=%)',
      s4_rows, s2_runs, s2_intervals;
  END IF;
END $$;

CREATE TABLE "di_v0_s4_trip_primary_boundary_seq" (
    "organization_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "next_boundary_occurrence" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "di_v0_s4_trip_primary_boundary_seq_pkey" PRIMARY KEY ("organization_id", "trip_id"),
    CONSTRAINT "di_v0_s4_trip_primary_boundary_seq_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_trip_primary_boundary_seq_trip_fkey" FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_trip_primary_boundary_seq_next_ck" CHECK ("next_boundary_occurrence" >= 1)
);

CREATE FUNCTION di_v0_s4_trip_primary_boundary_seq_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vehicle_trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.id = NEW.trip_id AND v.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'di_v0_s4_trip_primary_boundary_seq: trip % / organization % scope mismatch',
      NEW.trip_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER di_v0_s4_trip_primary_boundary_seq_scope_guard_trg
    BEFORE INSERT OR UPDATE OF "organization_id", "trip_id" ON "di_v0_s4_trip_primary_boundary_seq"
    FOR EACH ROW EXECUTE FUNCTION di_v0_s4_trip_primary_boundary_seq_scope_guard();

ALTER TABLE "di_v0_s4_work_items"
    ADD COLUMN "boundary_occurrence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "di_v0_s4_work_items"
    ADD CONSTRAINT "di_v0_s4_wi_boundary_occurrence_ck" CHECK ("boundary_occurrence" >= 0);

ALTER TABLE "di_v0_s4_work_items" DROP CONSTRAINT "di_v0_s4_wi_logical_key_uq";

ALTER TABLE "di_v0_s4_work_items"
    ADD CONSTRAINT "di_v0_s4_wi_logical_key_uq" UNIQUE (
      "organization_id",
      "trip_id",
      "boundary_fingerprint",
      "pipeline_version_key",
      "run_purpose",
      "purpose_discriminator",
      "boundary_occurrence"
    );

ALTER TABLE "di_v0_s4_work_items" DROP CONSTRAINT "di_v0_s4_wi_format_ck";

ALTER TABLE "di_v0_s4_work_items"
    ADD CONSTRAINT "di_v0_s4_wi_format_ck" CHECK (
      "boundary_fingerprint" ~ '^DI_V0_S4_BOUNDARY_FP_V1:sha256:[0-9a-f]{64}$'
      AND "pipeline_version_key" ~ '^DI_V0_S4_PIPELINE_V1:sha256:[0-9a-f]{64}$'
      AND ("combined_input_identity" IS NULL OR "combined_input_identity" ~ '^DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:[0-9a-f]{64}$')
      AND (
        "execution_identity" IS NULL
        OR "execution_identity" ~ '^DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:[0-9a-f]{64}$'
        OR "execution_identity" ~ '^DI_V0_S4_EXECUTION_IDENTITY_V2:sha256:[0-9a-f]{64}$'
      )
      AND ("pinned_snapshot_hash" IS NULL OR "pinned_snapshot_hash" ~ '^DI_V0_S4_EVIDENCE_V1:sha256:[0-9a-f]{64}$')
    );

CREATE OR REPLACE FUNCTION di_v0_s4_work_item_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'di_v0_s4_work_items: SUPERSEDED work item % is immutable', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.trip_id IS DISTINCT FROM OLD.trip_id
     OR NEW.source_family IS DISTINCT FROM OLD.source_family
     OR NEW.run_purpose IS DISTINCT FROM OLD.run_purpose
     OR NEW.purpose_discriminator IS DISTINCT FROM OLD.purpose_discriminator
     OR NEW.replay_source_snapshot_hash IS DISTINCT FROM OLD.replay_source_snapshot_hash
     OR NEW.reacquisition_request_id IS DISTINCT FROM OLD.reacquisition_request_id
     OR NEW.boundary_fingerprint IS DISTINCT FROM OLD.boundary_fingerprint
     OR NEW.boundary_occurrence IS DISTINCT FROM OLD.boundary_occurrence
     OR NEW.pipeline_version_key IS DISTINCT FROM OLD.pipeline_version_key
     OR NEW.pipeline_version_manifest IS DISTINCT FROM OLD.pipeline_version_manifest
     OR NEW.settlement_anchor_at IS DISTINCT FROM OLD.settlement_anchor_at
     OR NEW.eligible_at IS DISTINCT FROM OLD.eligible_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'di_v0_s4_work_items: identity columns of % are immutable', OLD.id;
  END IF;
  IF OLD.pinned_snapshot_hash IS NOT NULL AND (
       NEW.pinned_snapshot_hash IS DISTINCT FROM OLD.pinned_snapshot_hash
       OR NEW.pinned_at IS DISTINCT FROM OLD.pinned_at
       OR NEW.pinned_epoch IS DISTINCT FROM OLD.pinned_epoch) THEN
    RAISE EXCEPTION 'di_v0_s4_work_items: evidence pin of % is immutable once set', OLD.id;
  END IF;
  IF NEW.lease_epoch < OLD.lease_epoch THEN
    RAISE EXCEPTION 'di_v0_s4_work_items: lease_epoch of % must not decrease', OLD.id;
  END IF;
  IF OLD.shadow_run_id IS NOT NULL AND NEW.shadow_run_id IS DISTINCT FROM OLD.shadow_run_id THEN
    RAISE EXCEPTION 'di_v0_s4_work_items: shadow_run_id of % is immutable once set', OLD.id;
  END IF;
  IF OLD.execution_identity IS NOT NULL AND NEW.execution_identity IS DISTINCT FROM OLD.execution_identity THEN
    RAISE EXCEPTION 'di_v0_s4_work_items: execution_identity of % is immutable once set', OLD.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
