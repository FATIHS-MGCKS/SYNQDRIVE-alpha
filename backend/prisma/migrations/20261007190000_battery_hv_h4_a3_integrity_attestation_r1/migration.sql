-- M3.3-HV-H4-A3.3-O2-R1 — integrity attestation foundation (Strategy C invalidation).
-- SQL issuance is intentionally NOT deployed: TS/SQL full-verify parity is not proven (see O2-R1 closure tests).
-- pgcrypto: required for CI parity helpers only. Production CREATE EXTENSION authority is NOT proven from repo.

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

REVOKE ALL ON TABLE "public"."battery_hv_charge_session_evidence_integrity_attestations" FROM PUBLIC;

-- Non-authoritative parity measurement helpers (NOT production issuance authority).
CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_energy_tag_canonical_json_v1(e jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
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
    v := lower(to_json((e->>'value')::double precision)::text);
    v := regexp_replace(v, 'e([+-])0+([0-9])', 'e\1\2', 'g');
    RETURN '{"kind":"FINITE","value":' || v || '}';
  END IF;
  RAISE EXCEPTION 'unsupported energy tag %', k;
END;
$$;

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
  SELECT CASE jsonb_typeof(v)
    WHEN 'null' THEN 'null'
    WHEN 'boolean' THEN v::text
    WHEN 'string' THEN to_json(v #>> '{}')::text
    WHEN 'number' THEN to_json((v #>> '{}')::double precision)::text
    ELSE to_json(v #>> '{}')::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_canonical_utf8_from_projection_jsonb_v1(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
  SELECT '[' ||
    to_json('SHA256_CANONICAL_ORDERED_JSON_V1'::text)::text || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'evidenceContractVersion') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'organizationId') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'vehicleId') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceHvChargeSessionId') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'segmentFingerprint') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'dimoSegmentId') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'providerSegmentId') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'source') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'startAt') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'endAt') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'isOngoing') || ',' ||
    public.m3_3_hv_h4_a3_energy_tag_canonical_json_v1(p->'energyAddedKwh') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'providerObservedAt') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'addedEnergyProvenance') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'qualityStatus') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'supersededBySegmentFingerprint') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'startedBeforeRange') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceCreatedAt') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceReceivedAt') || ',' ||
    public.m3_3_hv_h4_a3_json_array_elem_from_jsonb_v1(p->'sourceUpdatedAt') ||
  ']';
$$;

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_source_revision_fingerprint_from_projection_jsonb_v1(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
  SELECT encode(
    digest(public.m3_3_hv_h4_a3_canonical_utf8_from_projection_jsonb_v1(p), 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_revision_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.battery_hv_charge_session_evidence_integrity_attestations
  WHERE revision_id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_ack_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.battery_hv_charge_session_evidence_integrity_attestations
  WHERE durability_ack_id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER battery_hv_cs_evidence_rev_invalidate_attestation_trg
  AFTER UPDATE ON public.battery_hv_charge_session_evidence_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_revision_v1();

CREATE TRIGGER battery_hv_cs_evidence_ack_invalidate_attestation_trg
  AFTER UPDATE ON public.battery_hv_charge_session_evidence_acks
  FOR EACH ROW
  EXECUTE FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_ack_v1();

REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_canonical_utf8_from_projection_jsonb_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_source_revision_fingerprint_from_projection_jsonb_v1(jsonb) FROM PUBLIC;
