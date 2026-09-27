-- EXP-021 S4A — DI V0 S4 dormant execution foundation (DI_V0_S4A_CONTRACT_V2).
-- Dormant only: four new tables plus S2 shadow-table guards. No seed rows, no backfill,
-- no ALTER / index / trigger on canonical tables. Reversible by dropping the new objects.
-- Prisma does not wrap migrations in a transaction, so the transaction is explicit.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Blocks concurrent S2 inserts between the emptiness proof and the guard creation.
LOCK TABLE "di_v0_shadow_runs", "di_v0_shadow_intervals" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "di_v0_shadow_runs") OR EXISTS (SELECT 1 FROM "di_v0_shadow_intervals") THEN
    RAISE EXCEPTION 'S4A migration requires empty S2 tables';
  END IF;
END $$;

-- ── Pipeline-version registry ─────────────────────────────────────────────

CREATE TABLE "di_v0_s4_pipeline_versions" (
    "pipeline_version_key" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "retired_at" TIMESTAMPTZ(6),
    "retired_by" TEXT,
    "retired_reason" TEXT,

    CONSTRAINT "di_v0_s4_pipeline_versions_pkey" PRIMARY KEY ("pipeline_version_key"),
    CONSTRAINT "di_v0_s4_pv_status_ck" CHECK ("status" IN ('ACTIVE', 'RETIRED')),
    CONSTRAINT "di_v0_s4_pv_key_format_ck" CHECK ("pipeline_version_key" ~ '^DI_V0_S4_PIPELINE_V1:sha256:[0-9a-f]{64}$'),
    CONSTRAINT "di_v0_s4_pv_manifest_ck" CHECK (jsonb_typeof("manifest") = 'object'),
    CONSTRAINT "di_v0_s4_pv_retired_ck" CHECK (
      ("status" = 'RETIRED') = ("retired_at" IS NOT NULL AND "retired_by" IS NOT NULL AND "retired_reason" IS NOT NULL)
    )
);

CREATE FUNCTION di_v0_s4_pipeline_version_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pipeline_version_key IS DISTINCT FROM OLD.pipeline_version_key
     OR NEW.manifest IS DISTINCT FROM OLD.manifest
     OR NEW.registered_at IS DISTINCT FROM OLD.registered_at THEN
    RAISE EXCEPTION 'di_v0_s4_pipeline_versions: identity columns are immutable';
  END IF;
  IF OLD.status = 'RETIRED' THEN
    RAISE EXCEPTION 'di_v0_s4_pipeline_versions: RETIRED pipeline version % is immutable (RETIRED->ACTIVE forbidden)', OLD.pipeline_version_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER di_v0_s4_pipeline_version_guard_trg
    BEFORE UPDATE ON "di_v0_s4_pipeline_versions"
    FOR EACH ROW EXECUTE FUNCTION di_v0_s4_pipeline_version_guard();

-- ── DB kill row (singleton, not seeded: a missing row means KILLED) ──────

CREATE TABLE "di_v0_s4_control" (
    "id" TEXT NOT NULL,
    "kill_state" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "di_v0_s4_control_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "di_v0_s4_control_id_ck" CHECK ("id" = 'GLOBAL'),
    CONSTRAINT "di_v0_s4_control_kill_state_ck" CHECK ("kill_state" IN ('KILLED', 'NOT_KILLED'))
);

-- ── S2 shadow-table guards (both tables proven empty above) ──────────────

ALTER TABLE "di_v0_shadow_runs"
    ADD CONSTRAINT "di_v0_shadow_runs_id_scope_uq" UNIQUE ("id", "organization_id", "trip_id");

CREATE FUNCTION di_v0_shadow_run_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = NEW.trip_id AND t.vehicle_id = NEW.vehicle_id AND v.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'di_v0_shadow_runs: trip % / vehicle % / organization % scope mismatch',
      NEW.trip_id, NEW.vehicle_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER di_v0_shadow_run_scope_guard_trg
    BEFORE INSERT OR UPDATE OF "organization_id", "vehicle_id", "trip_id" ON "di_v0_shadow_runs"
    FOR EACH ROW EXECUTE FUNCTION di_v0_shadow_run_scope_guard();

CREATE FUNCTION di_v0_shadow_interval_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM di_v0_shadow_runs r WHERE r.id = NEW.shadow_run_id AND r.organization_id = NEW.organization_id AND r.vehicle_id = NEW.vehicle_id AND r.trip_id = NEW.trip_id) THEN
    RAISE EXCEPTION 'di_v0_shadow_intervals: parent run % scope mismatch', NEW.shadow_run_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER di_v0_shadow_interval_scope_guard_trg
    BEFORE INSERT OR UPDATE OF "shadow_run_id", "organization_id", "vehicle_id", "trip_id" ON "di_v0_shadow_intervals"
    FOR EACH ROW EXECUTE FUNCTION di_v0_shadow_interval_scope_guard();

-- ── Evidence snapshots (content-addressed, immutable) ────────────────────

CREATE TABLE "di_v0_s4_evidence_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "container_version" TEXT NOT NULL,
    "boundary_fingerprint" TEXT NOT NULL,
    "acquisition_window_start" TIMESTAMPTZ(6) NOT NULL,
    "acquisition_window_end" TIMESTAMPTZ(6) NOT NULL,
    "channel_manifest" JSONB NOT NULL,
    "payload_gzip" BYTEA NOT NULL,
    "payload_bytes" INTEGER NOT NULL,
    "uncompressed_bytes" INTEGER NOT NULL,
    "retention_until" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "di_v0_s4_evidence_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "di_v0_s4_es_org_hash_uq" UNIQUE ("organization_id", "snapshot_hash"),
    CONSTRAINT "di_v0_s4_es_scope_hash_uq" UNIQUE ("organization_id", "trip_id", "snapshot_hash"),
    CONSTRAINT "di_v0_s4_es_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_es_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_es_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_es_hash_format_ck" CHECK ("snapshot_hash" ~ '^DI_V0_S4_EVIDENCE_V1:sha256:[0-9a-f]{64}$'),
    CONSTRAINT "di_v0_s4_es_container_version_ck" CHECK ("container_version" = 'DI_V0_S4_EVIDENCE_CONTAINER_V1'),
    CONSTRAINT "di_v0_s4_es_fp_format_ck" CHECK ("boundary_fingerprint" ~ '^DI_V0_S4_BOUNDARY_FP_V1:sha256:[0-9a-f]{64}$'),
    CONSTRAINT "di_v0_s4_es_window_ck" CHECK (
      "acquisition_window_start" < "acquisition_window_end"
      AND "acquisition_window_end" - "acquisition_window_start" <= interval '28800 seconds'
    ),
    CONSTRAINT "di_v0_s4_es_manifest_ck" CHECK (jsonb_typeof("channel_manifest") = 'array'),
    CONSTRAINT "di_v0_s4_es_size_ck" CHECK (
      "payload_bytes" > 0 AND "uncompressed_bytes" > 0 AND "uncompressed_bytes" <= 16777216
      AND "payload_bytes" = octet_length("payload_gzip")
    )
);

CREATE FUNCTION di_v0_s4_evidence_snapshot_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = NEW.trip_id AND t.vehicle_id = NEW.vehicle_id AND v.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'di_v0_s4_evidence_snapshots: trip % / vehicle % / organization % scope mismatch',
      NEW.trip_id, NEW.vehicle_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER di_v0_s4_evidence_snapshot_scope_guard_trg
    BEFORE INSERT ON "di_v0_s4_evidence_snapshots"
    FOR EACH ROW EXECUTE FUNCTION di_v0_s4_evidence_snapshot_scope_guard();

CREATE FUNCTION di_v0_s4_evidence_snapshot_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'di_v0_s4_evidence_snapshots: rows are immutable (UPDATE forbidden)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER di_v0_s4_evidence_snapshot_immutable_guard_trg
    BEFORE UPDATE ON "di_v0_s4_evidence_snapshots"
    FOR EACH ROW EXECUTE FUNCTION di_v0_s4_evidence_snapshot_immutable_guard();

-- ── Work items ────────────────────────────────────────────────────────────

CREATE TABLE "di_v0_s4_work_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "source_family" TEXT NOT NULL,
    "run_purpose" TEXT NOT NULL,
    "purpose_discriminator" TEXT NOT NULL,
    "replay_source_snapshot_hash" TEXT,
    "reacquisition_request_id" TEXT,
    "boundary_fingerprint" TEXT NOT NULL,
    "pipeline_version_key" TEXT NOT NULL,
    "pipeline_version_manifest" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "lease_epoch" BIGINT NOT NULL DEFAULT 0,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(6),
    "lease_acquired_at" TIMESTAMPTZ(6),
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "settlement_anchor_at" TIMESTAMPTZ(6) NOT NULL,
    "eligible_at" TIMESTAMPTZ(6) NOT NULL,
    "pinned_snapshot_hash" TEXT,
    "pinned_at" TIMESTAMPTZ(6),
    "pinned_epoch" BIGINT,
    "combined_input_identity" TEXT,
    "shadow_run_id" TEXT,
    "execution_identity" TEXT,
    "failure_class" TEXT,
    "failure_reason" TEXT,
    "skip_reason" TEXT,
    "superseded_reason" TEXT,
    "superseded_by_work_item_id" TEXT,
    "superseded_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "di_v0_s4_work_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "di_v0_s4_wi_logical_key_uq" UNIQUE ("organization_id", "trip_id", "boundary_fingerprint", "pipeline_version_key", "run_purpose", "purpose_discriminator"),
    CONSTRAINT "di_v0_s4_wi_id_scope_uq" UNIQUE ("id", "organization_id", "trip_id"),
    CONSTRAINT "di_v0_s4_wi_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_wi_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_wi_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "di_v0_s4_wi_pipeline_version_fkey" FOREIGN KEY ("pipeline_version_key") REFERENCES "di_v0_s4_pipeline_versions"("pipeline_version_key") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "di_v0_s4_wi_shadow_run_scope_fkey" FOREIGN KEY ("shadow_run_id", "organization_id", "trip_id") REFERENCES "di_v0_shadow_runs"("id", "organization_id", "trip_id") ON DELETE CASCADE,
    CONSTRAINT "di_v0_s4_wi_pinned_snapshot_scope_fkey" FOREIGN KEY ("organization_id", "trip_id", "pinned_snapshot_hash") REFERENCES "di_v0_s4_evidence_snapshots"("organization_id", "trip_id", "snapshot_hash") ON DELETE CASCADE,
    CONSTRAINT "di_v0_s4_wi_replay_snapshot_scope_fkey" FOREIGN KEY ("organization_id", "trip_id", "replay_source_snapshot_hash") REFERENCES "di_v0_s4_evidence_snapshots"("organization_id", "trip_id", "snapshot_hash") ON DELETE CASCADE,
    -- Deferred: T11 marks the predecessor SUPERSEDED (pointing at the successor id) before the
    -- successor PRIMARY can be inserted without violating di_v0_s4_wi_active_primary_uq.
    CONSTRAINT "di_v0_s4_wi_superseded_by_scope_fkey" FOREIGN KEY ("superseded_by_work_item_id", "organization_id", "trip_id") REFERENCES "di_v0_s4_work_items"("id", "organization_id", "trip_id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "di_v0_s4_wi_status_ck" CHECK ("status" IN ('PENDING', 'LEASED', 'FAILED_RETRYABLE', 'COMPLETED', 'FAILED_TERMINAL', 'SKIPPED_INELIGIBLE', 'SUPERSEDED')),
    CONSTRAINT "di_v0_s4_wi_source_family_ck" CHECK ("source_family" IN ('RUPTELA_R1', 'API_SYNTHETIC', 'UNKNOWN')),
    CONSTRAINT "di_v0_s4_wi_purpose_ck" CHECK (
      ("run_purpose" = 'PRIMARY' AND "purpose_discriminator" = 'PRIMARY'
        AND "replay_source_snapshot_hash" IS NULL AND "reacquisition_request_id" IS NULL)
      OR ("run_purpose" = 'RECALIBRATION_REPLAY' AND "replay_source_snapshot_hash" IS NOT NULL
        AND "purpose_discriminator" = "replay_source_snapshot_hash"
        AND "pinned_snapshot_hash" IS NOT NULL AND "pinned_snapshot_hash" = "replay_source_snapshot_hash"
        AND "reacquisition_request_id" IS NULL)
      OR ("run_purpose" = 'REACQUISITION' AND "reacquisition_request_id" IS NOT NULL
        AND "purpose_discriminator" = "reacquisition_request_id"
        AND "replay_source_snapshot_hash" IS NULL)
    ),
    CONSTRAINT "di_v0_s4_wi_lease_ck" CHECK (("status" = 'LEASED') = ("lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL)),
    CONSTRAINT "di_v0_s4_wi_lease_acquired_ck" CHECK (("lease_owner" IS NULL) = ("lease_acquired_at" IS NULL)),
    CONSTRAINT "di_v0_s4_wi_next_attempt_ck" CHECK (("status" IN ('PENDING', 'FAILED_RETRYABLE')) = ("next_attempt_at" IS NOT NULL)),
    CONSTRAINT "di_v0_s4_wi_completed_ck" CHECK (
      "status" <> 'COMPLETED' OR (
        "shadow_run_id" IS NOT NULL AND "pinned_snapshot_hash" IS NOT NULL AND "combined_input_identity" IS NOT NULL
        AND "execution_identity" IS NOT NULL AND "completed_at" IS NOT NULL
      )
    ),
    CONSTRAINT "di_v0_s4_wi_shadow_run_state_ck" CHECK ("shadow_run_id" IS NULL OR "status" IN ('COMPLETED', 'SUPERSEDED')),
    CONSTRAINT "di_v0_s4_wi_skip_ck" CHECK ("status" <> 'SKIPPED_INELIGIBLE' OR ("skip_reason" IS NOT NULL AND "pinned_snapshot_hash" IS NULL)),
    CONSTRAINT "di_v0_s4_wi_superseded_ck" CHECK (("status" = 'SUPERSEDED') = ("superseded_reason" IS NOT NULL AND "superseded_at" IS NOT NULL)),
    CONSTRAINT "di_v0_s4_wi_superseded_reason_ck" CHECK (
      "superseded_reason" IS NULL OR "superseded_reason" IN ('BOUNDARY_CHANGED', 'TRIP_NOT_COMPLETED', 'TRIP_CANCELLED', 'PIPELINE_RETIRED', 'OPERATOR')
    ),
    CONSTRAINT "di_v0_s4_wi_pin_all_or_none_ck" CHECK (
      ("pinned_snapshot_hash" IS NULL AND "pinned_at" IS NULL AND "pinned_epoch" IS NULL)
      OR ("pinned_snapshot_hash" IS NOT NULL AND "pinned_at" IS NOT NULL AND "pinned_epoch" IS NOT NULL)
    ),
    CONSTRAINT "di_v0_s4_wi_attempts_ck" CHECK ("attempt_count" BETWEEN 0 AND 5),
    CONSTRAINT "di_v0_s4_wi_epoch_ck" CHECK ("lease_epoch" >= 0),
    CONSTRAINT "di_v0_s4_wi_failure_class_ck" CHECK ("failure_class" IS NULL OR "failure_class" IN ('RETRYABLE', 'TERMINAL', 'EXHAUSTED')),
    CONSTRAINT "di_v0_s4_wi_failure_reason_ck" CHECK ("failure_reason" IS NULL OR "failure_reason" ~ '^[A-Z0-9_]{1,128}$'),
    CONSTRAINT "di_v0_s4_wi_skip_reason_ck" CHECK ("skip_reason" IS NULL OR "skip_reason" ~ '^[A-Z0-9_]{1,128}$'),
    CONSTRAINT "di_v0_s4_wi_failed_retryable_ck" CHECK ("status" <> 'FAILED_RETRYABLE' OR ("failure_class" = 'RETRYABLE' AND "failure_reason" IS NOT NULL)),
    CONSTRAINT "di_v0_s4_wi_failed_terminal_ck" CHECK ("status" <> 'FAILED_TERMINAL' OR ("failure_class" IN ('TERMINAL', 'EXHAUSTED') AND "failure_reason" IS NOT NULL)),
    CONSTRAINT "di_v0_s4_wi_format_ck" CHECK (
      "boundary_fingerprint" ~ '^DI_V0_S4_BOUNDARY_FP_V1:sha256:[0-9a-f]{64}$'
      AND "pipeline_version_key" ~ '^DI_V0_S4_PIPELINE_V1:sha256:[0-9a-f]{64}$'
      AND ("combined_input_identity" IS NULL OR "combined_input_identity" ~ '^DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:[0-9a-f]{64}$')
      AND ("execution_identity" IS NULL OR "execution_identity" ~ '^DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:[0-9a-f]{64}$')
      AND ("pinned_snapshot_hash" IS NULL OR "pinned_snapshot_hash" ~ '^DI_V0_S4_EVIDENCE_V1:sha256:[0-9a-f]{64}$')
    ),
    CONSTRAINT "di_v0_s4_wi_manifest_ck" CHECK (jsonb_typeof("pipeline_version_manifest") = 'object'),
    CONSTRAINT "di_v0_s4_wi_eligible_ck" CHECK ("eligible_at" = "settlement_anchor_at" + interval '24 hours')
);

CREATE UNIQUE INDEX "di_v0_s4_wi_active_primary_uq"
    ON "di_v0_s4_work_items"("organization_id", "trip_id", "pipeline_version_key")
    WHERE "run_purpose" = 'PRIMARY' AND "status" <> 'SUPERSEDED';

CREATE INDEX "di_v0_s4_wi_claim_idx"
    ON "di_v0_s4_work_items"("status", "next_attempt_at")
    WHERE "status" IN ('PENDING', 'FAILED_RETRYABLE');

CREATE INDEX "di_v0_s4_wi_reap_idx"
    ON "di_v0_s4_work_items"("lease_expires_at")
    WHERE "status" = 'LEASED';

CREATE INDEX "di_v0_s4_wi_org_trip_idx"
    ON "di_v0_s4_work_items"("organization_id", "trip_id");

CREATE FUNCTION di_v0_s4_work_item_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = NEW.trip_id AND t.vehicle_id = NEW.vehicle_id AND v.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'di_v0_s4_work_items: trip % / vehicle % / organization % scope mismatch',
      NEW.trip_id, NEW.vehicle_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER di_v0_s4_work_item_scope_guard_trg
    BEFORE INSERT OR UPDATE OF "organization_id", "vehicle_id", "trip_id" ON "di_v0_s4_work_items"
    FOR EACH ROW EXECUTE FUNCTION di_v0_s4_work_item_scope_guard();

CREATE FUNCTION di_v0_s4_work_item_immutable_guard()
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

CREATE TRIGGER di_v0_s4_work_item_immutable_guard_trg
    BEFORE UPDATE ON "di_v0_s4_work_items"
    FOR EACH ROW EXECUTE FUNCTION di_v0_s4_work_item_immutable_guard();

COMMIT;
