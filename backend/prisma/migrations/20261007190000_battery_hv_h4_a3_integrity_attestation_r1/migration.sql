-- M3.3-HV-H4-A3.3-O2-R1 — integrity attestation foundation (Strategy C invalidation; issuance gated on TS/SQL parity in CI)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "battery_hv_charge_session_evidence_integrity_attestations" (
  "id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "durability_ack_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "segment_fingerprint" TEXT NOT NULL,
  "evidence_contract_version" TEXT NOT NULL,
  "source_revision_fingerprint" CHAR(64) NOT NULL,
  "durability_ack_contract_version" TEXT NOT NULL,
  "integrity_attestation_contract_version" TEXT NOT NULL,
  "attested_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "battery_hv_charge_session_evidence_integrity_attestations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battery_hv_cs_evidence_attestation_revision_contract"
  ON "battery_hv_charge_session_evidence_integrity_attestations"("revision_id", "integrity_attestation_contract_version");

CREATE UNIQUE INDEX "battery_hv_cs_evidence_attestation_ack_unique"
  ON "battery_hv_charge_session_evidence_integrity_attestations"("durability_ack_id");

CREATE INDEX "battery_hv_cs_evidence_attestation_revision_idx"
  ON "battery_hv_charge_session_evidence_integrity_attestations"("revision_id");

ALTER TABLE "battery_hv_charge_session_evidence_integrity_attestations"
  ADD CONSTRAINT "battery_hv_cs_evidence_attestation_revision_fkey"
  FOREIGN KEY ("revision_id") REFERENCES "battery_hv_charge_session_evidence_revisions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charge_session_evidence_integrity_attestations"
  ADD CONSTRAINT "battery_hv_cs_evidence_attestation_ack_fkey"
  FOREIGN KEY ("durability_ack_id") REFERENCES "battery_hv_charge_session_evidence_acks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

REVOKE ALL ON TABLE "battery_hv_charge_session_evidence_integrity_attestations" FROM PUBLIC;

-- Tagged energy JSON text (fixed key order, no JSONB whitespace) for tuple element 12.
CREATE OR REPLACE FUNCTION m3_3_hv_h4_a3_energy_tag_canonical_json_v1(e jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  k text := e->>'kind';
  v text;
BEGIN
  IF k = 'NULL' THEN
    RETURN '{"kind":"NULL"}';
  ELSIF k = 'NAN' THEN
    RETURN '{"kind":"NAN"}';
  ELSIF k = 'POSITIVE_INFINITY' THEN
    RETURN '{"kind":"POSITIVE_INFINITY"}';
  ELSIF k = 'NEGATIVE_INFINITY' THEN
    RETURN '{"kind":"NEGATIVE_INFINITY"}';
  ELSIF k = 'FINITE' THEN
    v := lower(e->'value'::text);
    v := regexp_replace(v, 'e([+-])0+([0-9])', 'e\1\2', 'g');
    RETURN '{"kind":"FINITE","value":' || v || '}';
  END IF;
  RAISE EXCEPTION 'unsupported energy tag %', k;
END;
$$;

-- JSON array element: null | boolean | string (TS JSON.stringify tuple semantics).
CREATE OR REPLACE FUNCTION m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE jsonb_typeof(v)
    WHEN 'null' THEN 'null'
    WHEN 'boolean' THEN v::text
    WHEN 'string' THEN to_json(v #>> '{}')::text
    ELSE to_json(v #>> '{}')::text
  END;
$$;

-- Canonical UTF-8 (compact JSON array) aligned to TS JSON.stringify(tuple) for normative field order.
CREATE OR REPLACE FUNCTION m3_3_hv_h4_a3_canonical_utf8_from_projection_jsonb_v1(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT '[' ||
    to_json('SHA256_CANONICAL_ORDERED_JSON_V1'::text)::text || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'evidenceContractVersion') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'organizationId') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'vehicleId') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceHvChargeSessionId') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'segmentFingerprint') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'dimoSegmentId') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'providerSegmentId') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'source') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'startAt') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'endAt') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'isOngoing') || ',' ||
    m3_3_hv_h4_a3_energy_tag_canonical_json_v1(p->'energyAddedKwh') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'providerObservedAt') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'addedEnergyProvenance') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'qualityStatus') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'supersededBySegmentFingerprint') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'startedBeforeRange') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceCreatedAt') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceReceivedAt') || ',' ||
    m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceUpdatedAt') ||
  ']';
$$;

CREATE OR REPLACE FUNCTION m3_3_hv_h4_a3_source_revision_fingerprint_from_projection_jsonb_v1(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT encode(
    digest(m3_3_hv_h4_a3_canonical_utf8_from_projection_jsonb_v1(p), 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION m3_3_hv_h4_a3_invalidate_attestations_for_revision_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM battery_hv_charge_session_evidence_integrity_attestations
  WHERE revision_id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION m3_3_hv_h4_a3_invalidate_attestations_for_ack_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM battery_hv_charge_session_evidence_integrity_attestations
  WHERE durability_ack_id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER battery_hv_cs_evidence_rev_invalidate_attestation_trg
  AFTER UPDATE ON battery_hv_charge_session_evidence_revisions
  FOR EACH ROW
  EXECUTE FUNCTION m3_3_hv_h4_a3_invalidate_attestations_for_revision_v1();

CREATE TRIGGER battery_hv_cs_evidence_ack_invalidate_attestation_trg
  AFTER UPDATE ON battery_hv_charge_session_evidence_acks
  FOR EACH ROW
  EXECUTE FUNCTION m3_3_hv_h4_a3_invalidate_attestations_for_ack_v1();

-- Issuance (SECURITY DEFINER) — full verify embedded; certified only when TS/SQL golden parity passes in CI.
CREATE OR REPLACE FUNCTION m3_3_hv_h4_a3_issue_integrity_attestation_v1(
  p_revision_id text,
  p_integrity_attestation_contract_version text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rev battery_hv_charge_session_evidence_revisions%ROWTYPE;
  v_ack battery_hv_charge_session_evidence_acks%ROWTYPE;
  v_proj jsonb;
  v_fp text;
  v_attestation_id text;
  v_now timestamp(3);
BEGIN
  IF p_integrity_attestation_contract_version IS DISTINCT FROM 'M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_V1' THEN
    RAISE EXCEPTION 'UNSUPPORTED_INTEGRITY_ATTESTATION_CONTRACT';
  END IF;

  SELECT * INTO v_rev
  FROM battery_hv_charge_session_evidence_revisions
  WHERE id = p_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVISION_NOT_FOUND';
  END IF;

  IF v_rev.evidence_contract_version IS DISTINCT FROM 'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1' THEN
    RAISE EXCEPTION 'UNSUPPORTED_EVIDENCE_CONTRACT';
  END IF;

  v_proj := v_rev.scientific_evidence_json::jsonb;
  v_fp := m3_3_hv_h4_a3_source_revision_fingerprint_from_projection_jsonb_v1(v_proj);

  IF v_fp IS DISTINCT FROM v_rev.source_revision_fingerprint THEN
    RAISE EXCEPTION 'FINGERPRINT_MISMATCH';
  END IF;

  -- Mirror coherence (finite-only float mirror policy)
  IF v_rev.organization_id IS DISTINCT FROM (v_proj->>'organizationId')
    OR v_rev.vehicle_id IS DISTINCT FROM (v_proj->>'vehicleId')
    OR v_rev.segment_fingerprint IS DISTINCT FROM (v_proj->>'segmentFingerprint')
    OR v_rev.evidence_contract_version IS DISTINCT FROM (v_proj->>'evidenceContractVersion')
    OR v_rev.source_hv_charge_session_id IS DISTINCT FROM (v_proj->>'sourceHvChargeSessionId')
    OR v_rev.source IS DISTINCT FROM (v_proj->>'source')
    OR v_rev.is_ongoing IS DISTINCT FROM (v_proj->>'isOngoing')::boolean
    OR v_rev.started_before_range IS DISTINCT FROM (v_proj->>'startedBeforeRange')::boolean
    OR v_rev.dimo_segment_id IS DISTINCT FROM (v_proj->>'dimoSegmentId')
    OR v_rev.provider_segment_id IS DISTINCT FROM (v_proj->>'providerSegmentId')
    OR v_rev.added_energy_provenance IS DISTINCT FROM (v_proj->>'addedEnergyProvenance')
    OR v_rev.quality_status IS DISTINCT FROM (v_proj->>'qualityStatus')
    OR v_rev.superseded_by_segment_fingerprint IS DISTINCT FROM (v_proj->>'supersededBySegmentFingerprint')
  THEN
    RAISE EXCEPTION 'MIRROR_INCOHERENT';
  END IF;

  IF (v_proj->>'startAt')::timestamptz IS DISTINCT FROM v_rev.start_at THEN
    RAISE EXCEPTION 'MIRROR_INCOHERENT';
  END IF;

  IF (v_proj->>'endAt') IS NULL THEN
    IF v_rev.end_at IS NOT NULL THEN
      RAISE EXCEPTION 'MIRROR_INCOHERENT';
    END IF;
  ELSIF (v_proj->>'endAt')::timestamptz IS DISTINCT FROM v_rev.end_at THEN
    RAISE EXCEPTION 'MIRROR_INCOHERENT';
  END IF;

  IF (v_proj->>'sourceCreatedAt')::timestamptz IS DISTINCT FROM v_rev.source_created_at
    OR (v_proj->>'sourceReceivedAt')::timestamptz IS DISTINCT FROM v_rev.source_received_at
    OR (v_proj->>'sourceUpdatedAt')::timestamptz IS DISTINCT FROM v_rev.source_updated_at
  THEN
    RAISE EXCEPTION 'MIRROR_INCOHERENT';
  END IF;

  IF (v_proj->>'providerObservedAt') IS NULL THEN
    IF v_rev.provider_observed_at IS NOT NULL THEN
      RAISE EXCEPTION 'MIRROR_INCOHERENT';
    END IF;
  ELSIF (v_proj->>'providerObservedAt')::timestamptz IS DISTINCT FROM v_rev.provider_observed_at THEN
    RAISE EXCEPTION 'MIRROR_INCOHERENT';
  END IF;

  CASE (v_proj->'energyAddedKwh'->>'kind')
    WHEN 'FINITE' THEN
      IF v_rev.energy_added_kwh IS DISTINCT FROM (v_proj->'energyAddedKwh'->>'value')::double precision THEN
        RAISE EXCEPTION 'MIRROR_INCOHERENT';
      END IF;
    ELSE
      IF v_rev.energy_added_kwh IS NOT NULL THEN
        RAISE EXCEPTION 'MIRROR_INCOHERENT';
      END IF;
  END CASE;

  SELECT * INTO v_ack
  FROM battery_hv_charge_session_evidence_acks
  WHERE revision_id = v_rev.id
    AND durability_ack_contract_version = 'M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACK_MISSING';
  END IF;

  IF v_ack.organization_id IS DISTINCT FROM v_rev.organization_id
    OR v_ack.vehicle_id IS DISTINCT FROM v_rev.vehicle_id
    OR v_ack.segment_fingerprint IS DISTINCT FROM v_rev.segment_fingerprint
    OR v_ack.evidence_contract_version IS DISTINCT FROM v_rev.evidence_contract_version
    OR v_ack.source_revision_fingerprint IS DISTINCT FROM v_rev.source_revision_fingerprint
    OR v_ack.revision_id IS DISTINCT FROM v_rev.id
  THEN
    RAISE EXCEPTION 'ACK_MISMATCH';
  END IF;

  v_now := CURRENT_TIMESTAMP;
  v_attestation_id := gen_random_uuid()::text;

  INSERT INTO battery_hv_charge_session_evidence_integrity_attestations (
    id,
    revision_id,
    durability_ack_id,
    organization_id,
    vehicle_id,
    segment_fingerprint,
    evidence_contract_version,
    source_revision_fingerprint,
    durability_ack_contract_version,
    integrity_attestation_contract_version,
    attested_at,
    created_at
  ) VALUES (
    v_attestation_id,
    v_rev.id,
    v_ack.id,
    v_rev.organization_id,
    v_rev.vehicle_id,
    v_rev.segment_fingerprint,
    v_rev.evidence_contract_version,
    v_rev.source_revision_fingerprint,
    v_ack.durability_ack_contract_version,
    p_integrity_attestation_contract_version,
    v_now,
    v_now
  )
  ON CONFLICT (revision_id, integrity_attestation_contract_version) DO NOTHING
  RETURNING id INTO v_attestation_id;

  IF v_attestation_id IS NULL THEN
    SELECT id INTO v_attestation_id
    FROM battery_hv_charge_session_evidence_integrity_attestations
    WHERE revision_id = v_rev.id
      AND integrity_attestation_contract_version = p_integrity_attestation_contract_version;
  END IF;

  RETURN v_attestation_id;
END;
$$;

REVOKE ALL ON FUNCTION m3_3_hv_h4_a3_issue_integrity_attestation_v1(text, text) FROM PUBLIC;
