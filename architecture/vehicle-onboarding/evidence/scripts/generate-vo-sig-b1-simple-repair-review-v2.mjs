#!/usr/bin/env node
/**
 * Generates VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V2.sql from an owner dry-run manifest JSON.
 * Offline only — does not connect to production.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlQuote(JSON.stringify(value))}::jsonb`;
}

const AUDIT_IDS = {
  '6fcca9d4-99d5-4be8-8985-e9369c53b7f6': '8c0d4deb-f4dc-4491-999e-18471d3d9921',
  '9ff5e350-cd4b-4e3a-956a-4f1770b017f2': '173f2ec5-6718-4b18-b358-17a7f7af5e12',
  '805b271c-ba87-4776-9e39-23e24d595c53': 'c9a34e17-3787-4347-8089-464e187f1f5c',
  '71b75519-3053-4836-8bcd-554680d592b2': 'a147b19c-7202-4201-9e13-6c2983344afa',
};

function buildPlanEntries(manifest) {
  const rows = [...manifest.rows].sort((a, b) => a.sourceLinkId.localeCompare(b.sourceLinkId));
  if (rows.length !== 4) {
    throw new Error(`Expected exactly 4 manifest rows, got ${rows.length}`);
  }
  return rows.map((row) => {
    if (row.eligibility !== 'ELIGIBLE' || !row.proposedMetadataV2) {
      throw new Error(`Row ${row.sourceLinkId} is not ELIGIBLE`);
    }
    const { reconciliationProvenance: _rp, ...connectionIdentityCore } = row.proposedMetadataV2;
    return {
      sourceLinkId: row.sourceLinkId,
      vehicleId: row.vehicleId,
      organizationId: row.organizationId,
      auditId: AUDIT_IDS[row.sourceLinkId] ?? randomUUID(),
      expectedBeforeFingerprint: row.currentMetadataFingerprint,
      approvalManifestEntry: row.approvalManifestEntry,
      connectionIdentityCore,
      telemetrySourceFamily: row.evidenceClassification,
      dimoMirrorId: row.sourceMirrorId,
      dimoExternalId: row.dimoExternalId,
      dimoTokenId: row.dimoTokenId,
      priorLinkLastVerifiedAt: row.proposedMetadataV2.priorLinkLastVerifiedAt,
    };
  });
}

function generateSql(manifest, planEntries) {
  const manifestFingerprint = manifest.manifestFingerprint;
  const organizationId = manifest.organizationId;
  const planJson = JSON.stringify(planEntries);

  return `-- GENERATED: VO-SIG-01 B1 simple four-link repair V2 (DO NOT EXECUTE without owner commit)
-- generator: architecture/vehicle-onboarding/evidence/scripts/generate-vo-sig-b1-simple-repair-review-v2.mjs
-- manifestFingerprint: ${manifestFingerprint}
-- organizationId: ${organizationId}
-- dependencies: PostgreSQL, pgcrypto (digest), tables vehicle_data_source_links, vehicles, vehicle_provider_consents, dimo_vehicles, vehicle_connection_identity_reconciliation_audits
-- Operator: set all vo_sig_b1.* session keys inside this transaction (is_local=false) before the DO block runs.
--   vo_sig_b1.run_id, vo_sig_b1.authorization_reference, vo_sig_b1.operator_reference,
--   vo_sig_b1.verified_at_iso, vo_sig_b1.production_release_sha (40-char lowercase hex)
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_metadata_storage(p_metadata jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_metadata IS NULL THEN 'SQL_ABSENT'
    WHEN p_metadata = 'null'::jsonb THEN 'JSON_NULL'
    ELSE 'OBJECT'
  END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_canonical_json_text(j jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text;
  k text;
  parts text[];
  elem jsonb;
BEGIN
  IF j IS NULL THEN
    RETURN 'null';
  END IF;
  t := jsonb_typeof(j);
  IF t = 'null' THEN
    RETURN 'null';
  ELSIF t = 'boolean' THEN
    RETURN j::text;
  ELSIF t = 'number' THEN
    RETURN j::text;
  ELSIF t = 'string' THEN
    RETURN to_jsonb(j #>> '{}')::text;
  ELSIF t = 'array' THEN
    parts := ARRAY[]::text[];
    FOR elem IN SELECT value FROM jsonb_array_elements(j) LOOP
      parts := array_append(parts, pg_temp.vo_sig_b1_canonical_json_text(elem));
    END LOOP;
    RETURN '[' || array_to_string(parts, ',') || ']';
  ELSIF t = 'object' THEN
    parts := ARRAY[]::text[];
    FOR k IN SELECT key FROM jsonb_object_keys(j) AS key ORDER BY key LOOP
      parts := array_append(parts, to_jsonb(k)::text || ':' || pg_temp.vo_sig_b1_canonical_json_text(j -> k));
    END LOOP;
    RETURN '{' || array_to_string(parts, ',') || '}';
  END IF;
  RETURN 'null';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_fingerprint_link_metadata(p_metadata jsonb, p_storage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(
      CASE
        WHEN p_storage IN ('SQL_ABSENT', 'JSON_NULL') THEN 'null'
        ELSE pg_temp.vo_sig_b1_canonical_json_text(p_metadata)
      END,
      'sha256'
    ),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_merge_connection_identity(p_metadata jsonb, p_storage text, p_ci jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_storage IN ('SQL_ABSENT', 'JSON_NULL') THEN jsonb_build_object('connectionIdentity', p_ci)
    ELSE p_metadata || jsonb_build_object('connectionIdentity', p_ci)
  END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_require_setting(p_key text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v text;
BEGIN
  v := current_setting(p_key, true);
  IF v IS NULL OR btrim(v) = '' THEN
    RAISE EXCEPTION 'UNRESOLVED_SETTING:%', p_key;
  END IF;
  IF v LIKE 'OWNER_SET_%' THEN
    RAISE EXCEPTION 'UNRESOLVED_PLACEHOLDER:%', p_key;
  END IF;
  RETURN v;
END;
$$;

CREATE TEMP TABLE vo_sig_b1_repair_before (
  link_id text PRIMARY KEY,
  vehicle_id text NOT NULL,
  organization_id text NOT NULL,
  consent_id text NOT NULL,
  dimo_vehicle_id text NOT NULL,
  before_metadata jsonb,
  before_storage text NOT NULL,
  before_last_verified_at timestamptz,
  expected_before_fp text NOT NULL,
  connection_identity_core jsonb NOT NULL,
  approval_manifest_entry jsonb NOT NULL,
  telemetry_source_family text NOT NULL,
  dimo_mirror_id text NOT NULL,
  dimo_external_id text NOT NULL,
  dimo_token_id integer NOT NULL,
  audit_id text NOT NULL
) ON COMMIT DROP;

DO $vo_sig_b1_repair$
DECLARE
  v_run_id text;
  v_auth_ref text;
  v_operator text;
  v_verified_at text;
  v_release_sha text;
  v_manifest text := ${sqlQuote(manifestFingerprint)};
  v_org text := ${sqlQuote(organizationId)};
  v_plan jsonb := ${sqlJson(planEntries)};
  v_row jsonb;
  v_link_id text;
  v_vehicle_id text;
  v_consent_id text;
  v_dimo_id text;
  v_before_metadata jsonb;
  v_before_storage text;
  v_before_lv timestamptz;
  v_expected_fp text;
  v_ci_core jsonb;
  v_ci jsonb;
  v_after_metadata jsonb;
  v_before_fp text;
  v_after_fp text;
  v_update_count integer := 0;
  v_insert_count integer := 0;
  v_guard_count integer;
  v_snap vo_sig_b1_repair_before%ROWTYPE;
BEGIN
  v_run_id := pg_temp.vo_sig_b1_require_setting('vo_sig_b1.run_id');
  v_auth_ref := pg_temp.vo_sig_b1_require_setting('vo_sig_b1.authorization_reference');
  v_operator := pg_temp.vo_sig_b1_require_setting('vo_sig_b1.operator_reference');
  v_verified_at := pg_temp.vo_sig_b1_require_setting('vo_sig_b1.verified_at_iso');
  v_release_sha := pg_temp.vo_sig_b1_require_setting('vo_sig_b1.production_release_sha');

  IF length(v_release_sha) <> 40 OR v_release_sha !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'INVALID_PRODUCTION_RELEASE_SHA';
  END IF;

  PERFORM 1
  FROM vehicle_data_source_links vdsl
  WHERE vdsl.id IN (
    '6fcca9d4-99d5-4be8-8985-e9369c53b7f6',
    '9ff5e350-cd4b-4e3a-956a-4f1770b017f2',
    '805b271c-ba87-4776-9e39-23e24d595c53',
    '71b75519-3053-4836-8bcd-554680d592b2'
  )
  ORDER BY vdsl.id
  FOR UPDATE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_plan) AS t(value) LOOP
    v_link_id := v_row->>'sourceLinkId';
    v_vehicle_id := v_row->>'vehicleId';

    SELECT vdsl.consent_id, vdsl.dimo_vehicle_id, vdsl.metadata, vdsl.last_verified_at
    INTO v_consent_id, v_dimo_id, v_before_metadata, v_before_lv
    FROM vehicle_data_source_links vdsl
    JOIN vehicles v ON v.id = vdsl.vehicle_id
    JOIN vehicle_provider_consents vpc ON vpc.id = vdsl.consent_id
    JOIN dimo_vehicles dv ON dv.id = vdsl.dimo_vehicle_id
    WHERE vdsl.id = v_link_id
      AND vdsl.vehicle_id = v_vehicle_id
      AND v.organization_id = v_org
      AND v.registry_lifecycle = 'ACTIVE'::"VehicleRegistryLifecycle"
      AND vdsl.is_active = true
      AND vdsl.provider = 'DIMO'
      AND vdsl.source_type = 'DIMO'
      AND vdsl.consent_id IS NOT NULL
      AND vdsl.dimo_vehicle_id IS NOT NULL
      AND (vdsl.metadata->'connectionIdentity') IS NULL
      AND vpc.vehicle_id = v_vehicle_id
      AND vpc.organization_id = v_org
      AND vpc.provider = 'DIMO'
      AND vpc.grant_type = 'DIMO_DIRECT'::"VehicleProviderConsentGrantType"
      AND vpc.status = 'ACTIVE'::"VehicleProviderConsentStatus"
      AND vpc.revoked_at IS NULL
      AND (vpc.expires_at IS NULL OR vpc.expires_at > NOW())
      AND (vpc.provider_vehicle_ref IS NULL OR btrim(vpc.provider_vehicle_ref) = '' OR vpc.provider_vehicle_ref = dv.external_id)
      AND (v.dimo_vehicle_id IS NULL OR v.dimo_vehicle_id = vdsl.dimo_vehicle_id)
      AND dv.id = (v_row->>'dimoMirrorId')
      AND dv.external_id = (v_row->>'dimoExternalId')
      AND dv.token_id = (v_row->>'dimoTokenId')::integer
    FOR UPDATE OF vdsl, v, vpc, dv;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'GUARD_FAILED:%', v_link_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM vehicle_data_source_links other
      JOIN vehicles ov ON ov.id = other.vehicle_id
      WHERE other.dimo_vehicle_id = v_dimo_id
        AND other.is_active = true
        AND other.id <> v_link_id
        AND other.provider = 'DIMO'
        AND other.source_type = 'DIMO'
        AND ov.organization_id <> v_org
    ) THEN
      RAISE EXCEPTION 'GUARD_DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT:%', v_link_id;
    END IF;

    PERFORM 1 FROM vehicles WHERE id = v_vehicle_id AND organization_id = v_org FOR UPDATE;
    PERFORM 1 FROM vehicle_provider_consents WHERE id = v_consent_id AND vehicle_id = v_vehicle_id AND organization_id = v_org FOR UPDATE;
    PERFORM 1 FROM dimo_vehicles WHERE id = v_dimo_id FOR UPDATE;
    PERFORM 1 FROM vehicle_data_source_links WHERE id = v_link_id AND vehicle_id = v_vehicle_id FOR UPDATE;

    v_before_storage := pg_temp.vo_sig_b1_metadata_storage(v_before_metadata);
    v_expected_fp := v_row->>'expectedBeforeFingerprint';
    v_before_fp := pg_temp.vo_sig_b1_fingerprint_link_metadata(v_before_metadata, v_before_storage);
    IF v_before_fp <> v_expected_fp THEN
      RAISE EXCEPTION 'BEFORE_FINGERPRINT_MISMATCH:%', v_link_id;
    END IF;

    INSERT INTO vo_sig_b1_repair_before (
      link_id, vehicle_id, organization_id, consent_id, dimo_vehicle_id,
      before_metadata, before_storage, before_last_verified_at, expected_before_fp,
      connection_identity_core, approval_manifest_entry, telemetry_source_family,
      dimo_mirror_id, dimo_external_id, dimo_token_id, audit_id
    ) VALUES (
      v_link_id,
      v_vehicle_id,
      v_org,
      v_consent_id,
      v_dimo_id,
      v_before_metadata,
      v_before_storage,
      v_before_lv,
      v_expected_fp,
      v_row->'connectionIdentityCore',
      v_row->'approvalManifestEntry',
      v_row->>'telemetrySourceFamily',
      v_row->>'dimoMirrorId',
      v_row->>'dimoExternalId',
      (v_row->>'dimoTokenId')::integer,
      v_row->>'auditId'
    );
  END LOOP;

  IF (SELECT count(*) FROM vo_sig_b1_repair_before) <> 4 THEN
    RAISE EXCEPTION 'BEFORE_SNAPSHOT_ROW_COUNT_MISMATCH';
  END IF;

  FOR v_snap IN SELECT * FROM vo_sig_b1_repair_before ORDER BY link_id LOOP
    v_link_id := v_snap.link_id;
    v_ci_core := v_snap.connection_identity_core;
    v_ci := v_ci_core || jsonb_build_object(
      'verifiedAt', v_verified_at,
      'reconciliationProvenance', jsonb_build_object(
        'runId', v_run_id,
        'authorizationReference', v_auth_ref,
        'operatorReference', v_operator,
        'evidenceCheckedAt', v_verified_at,
        'dryRunManifestFingerprint', v_manifest,
        'productionReleaseSha', v_release_sha
      )
    );

    v_after_metadata := pg_temp.vo_sig_b1_merge_connection_identity(
      v_snap.before_metadata,
      v_snap.before_storage,
      v_ci
    );

    v_before_fp := pg_temp.vo_sig_b1_fingerprint_link_metadata(
      v_snap.before_metadata,
      v_snap.before_storage
    );
    v_after_fp := pg_temp.vo_sig_b1_fingerprint_link_metadata(v_after_metadata, 'OBJECT');

    UPDATE vehicle_data_source_links vdsl
    SET metadata = v_after_metadata
    WHERE vdsl.id = v_link_id
      AND vdsl.is_active = true
      AND (vdsl.metadata->'connectionIdentity') IS NULL
      AND pg_temp.vo_sig_b1_fingerprint_link_metadata(
        vdsl.metadata,
        pg_temp.vo_sig_b1_metadata_storage(vdsl.metadata)
      ) = v_before_fp;

    GET DIAGNOSTICS v_guard_count = ROW_COUNT;
    IF v_guard_count <> 1 THEN
      RAISE EXCEPTION 'UPDATE_ROW_COUNT_MISMATCH:%', v_link_id;
    END IF;
    v_update_count := v_update_count + v_guard_count;

    INSERT INTO vehicle_connection_identity_reconciliation_audits (
      id, organization_id, vehicle_id, source_link_id, idempotency_key, outcome,
      before_metadata_fingerprint, after_metadata_fingerprint,
      before_metadata_json, after_metadata_json,
      before_last_verified_at, after_last_verified_at,
      evidence_provenance, operator_reference, authorization_reference, run_id, production_release_sha
    ) VALUES (
      v_snap.audit_id,
      v_snap.organization_id,
      v_snap.vehicle_id,
      v_link_id,
      format('legacy-ci-reconcile:%s:v2', v_link_id),
      'APPLIED',
      v_before_fp,
      v_after_fp,
      CASE
        WHEN v_snap.before_storage = 'SQL_ABSENT' THEN NULL
        WHEN v_snap.before_storage = 'JSON_NULL' THEN 'null'::jsonb
        ELSE v_snap.before_metadata
      END,
      v_after_metadata,
      v_snap.before_last_verified_at,
      v_snap.before_last_verified_at,
      jsonb_build_object(
        'telemetrySourceFamily', v_snap.telemetry_source_family,
        'approvalManifestEntry', v_snap.approval_manifest_entry,
        'approvedManifestFingerprint', v_manifest,
        'beforeMetadataStorageState', v_snap.before_storage,
        'verificationEvidence', v_ci_core->'verificationEvidence',
        'physicalEpisodeAttestation', jsonb_build_object(
          'independentlyProven', false,
          'reason', 'PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF'
        )
      ),
      v_operator,
      v_auth_ref,
      v_run_id,
      v_release_sha
    );
    v_insert_count := v_insert_count + 1;
  END LOOP;

  IF v_update_count <> 4 OR v_insert_count <> 4 THEN
    RAISE EXCEPTION 'ATOMICITY_ROW_COUNT_MISMATCH:updates=% inserts=%', v_update_count, v_insert_count;
  END IF;
END
$vo_sig_b1_repair$;

-- Owner replaces ROLLBACK with COMMIT after pre-flight validation + backup
ROLLBACK;
`;
}

function main() {
  const manifestPath = resolve(
    process.argv[2] ?? `${__dirname}/../vo-sig-b1-production-dry-run-manifest.json`,
  );
  const outPath = resolve(
    process.argv[3] ?? `${__dirname}/../VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V2.sql`,
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const planEntries = buildPlanEntries(manifest);
  const sql = generateSql(manifest, planEntries);
  writeFileSync(outPath, sql, 'utf8');
  const sha = createHash('sha256').update(sql).digest('hex');
  process.stdout.write(`${outPath}\nsha256=${sha}\nbytes=${Buffer.byteLength(sql)}\n`);
}

main();
