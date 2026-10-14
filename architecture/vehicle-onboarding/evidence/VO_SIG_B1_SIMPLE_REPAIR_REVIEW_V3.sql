-- GENERATED: VO-SIG-01 B1 simple four-link repair V3 (DO NOT EXECUTE without owner commit)
-- generator: architecture/vehicle-onboarding/evidence/scripts/generate-vo-sig-b1-simple-repair-review-v3.mjs
-- manifestFingerprint: f9f2a17be4c361be04dc88afd4e12bb3034a4b64e84a504641a999a06cddef73
-- organizationId: faa710c9-6d91-4079-a7d5-91fdccdec14a
-- dependencies: PostgreSQL, pgcrypto extension (digest must already exist; script does not CREATE EXTENSION), tables vehicle_data_source_links, vehicles, vehicle_provider_consents, dimo_vehicles, vehicle_connection_identity_reconciliation_audits
-- Operator: set all vo_sig_b1.* session keys inside this transaction (is_local=false) before the DO block runs.
--   vo_sig_b1.run_id, vo_sig_b1.authorization_reference, vo_sig_b1.operator_reference,
--   vo_sig_b1.verified_at_iso, vo_sig_b1.production_release_sha (40-char lowercase hex)
BEGIN;



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


CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_json_stringify_node(j jsonb)
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
      parts := array_append(parts, pg_temp.vo_sig_b1_json_stringify_node(elem));
    END LOOP;
    RETURN '[' || array_to_string(parts, ',') || ']';
  ELSIF t = 'object' THEN
    parts := ARRAY[]::text[];
    FOR k, elem IN SELECT * FROM jsonb_each(j) LOOP
      parts := array_append(parts, to_jsonb(k)::text || ':' || pg_temp.vo_sig_b1_json_stringify_node(elem));
    END LOOP;
    RETURN '{' || array_to_string(parts, ',') || '}';
  END IF;
  RETURN 'null';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_sha256_node_json(j jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(
      CASE
        WHEN j IS NULL THEN 'null'
        ELSE pg_temp.vo_sig_b1_json_stringify_node(j)
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
  v_manifest text := 'f9f2a17be4c361be04dc88afd4e12bb3034a4b64e84a504641a999a06cddef73';
  v_org text := 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  v_plan jsonb := '[{"sourceLinkId":"6fcca9d4-99d5-4be8-8985-e9369c53b7f6","vehicleId":"8c850ff1-4201-432b-af2e-2711dbc7ca48","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","auditId":"8c0d4deb-f4dc-4491-999e-18471d3d9921","expectedBeforeFingerprint":"53ebd44ce1a8fab5f2e5073c9667fef3b2ae948aa36d366c55c18e535d76bc6f","approvalManifestEntry":{"sourceLinkId":"6fcca9d4-99d5-4be8-8985-e9369c53b7f6","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"8c850ff1-4201-432b-af2e-2711dbc7ca48","currentMetadataFingerprint":"53ebd44ce1a8fab5f2e5073c9667fef3b2ae948aa36d366c55c18e535d76bc6f","sourceEvidenceFingerprint":{"rawJsonSha256":"05c3ee737aebde3e371bf0e5c948998dd2f5f289cfd4f4a13b92e49e14156758","externalId":"187784","tokenId":187784,"dimoMirrorId":"623a3934-d75a-4b23-9830-ae970f49d55a"},"verifiedModality":"HARDWARE_DEVICE","physicalDeviceReference":"R1-865918076152229","telemetrySourceFamily":"RUPTELA_R1","deviceBindingAssurance":"PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED","providerDeviceIdHash":"38a87ca065855fa3e45e5c566f9f1bd8","dimoTokenId":187784,"dimoExternalId":"187784","sourceMirrorId":"623a3934-d75a-4b23-9830-ae970f49d55a"},"connectionIdentityCore":{"version":"vo-source-link-connection-identity-v2","contractVersion":"vo-connection-identity-v1","origin":"LEGACY_RECONCILIATION","preActivationScope":"LEGACY_NO_ONBOARDING_SOURCE_REF","preActivationProviderSourceRefId":null,"providerSourceLinkId":"6fcca9d4-99d5-4be8-8985-e9369c53b7f6","provider":"DIMO","sourceMirrorId":"623a3934-d75a-4b23-9830-ae970f49d55a","providerVehicleReference":"187784","proposedModality":null,"verifiedModality":"HARDWARE_DEVICE","modalityVerification":"VERIFIED_PROVIDER_EVIDENCE","physicalDeviceReference":"R1-865918076152229","deviceBindingAssurance":"PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED","providerDeviceIdHash":"38a87ca065855fa3e45e5c566f9f1bd8","dimoTokenId":187784,"verificationEvidence":["DIMO_RAW_JSON:RUPTELA_R1","serial:R1-865918076152229"],"verifiedAt":"2026-10-14T11:26:20.154Z","priorLinkLastVerifiedAt":"2026-08-25T18:52:48.114Z","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"8c850ff1-4201-432b-af2e-2711dbc7ca48","sourceEvidenceFingerprint":{"rawJsonSha256":"05c3ee737aebde3e371bf0e5c948998dd2f5f289cfd4f4a13b92e49e14156758","externalId":"187784","tokenId":187784,"dimoMirrorId":"623a3934-d75a-4b23-9830-ae970f49d55a"},"physicalEpisodeAttestation":{"independentlyProven":false,"reason":"PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF"}},"telemetrySourceFamily":"RUPTELA_R1","dimoMirrorId":"623a3934-d75a-4b23-9830-ae970f49d55a","dimoExternalId":"187784","dimoTokenId":187784,"priorLinkLastVerifiedAt":"2026-08-25T18:52:48.114Z"},{"sourceLinkId":"71b75519-3053-4836-8bcd-554680d592b2","vehicleId":"c10351f8-b6a2-4258-947f-631aeaa6d359","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","auditId":"a147b19c-7202-4201-9e13-6c2983344afa","expectedBeforeFingerprint":"3d1709fae07f81c8ed33ca9d497e8f6e60107e3b3b695ebe093941469e50eb64","approvalManifestEntry":{"sourceLinkId":"71b75519-3053-4836-8bcd-554680d592b2","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"c10351f8-b6a2-4258-947f-631aeaa6d359","currentMetadataFingerprint":"3d1709fae07f81c8ed33ca9d497e8f6e60107e3b3b695ebe093941469e50eb64","sourceEvidenceFingerprint":{"rawJsonSha256":"c8c8fc45c68da72e287bf3a503c0c154e25522aaad8beb109d4106cc5f888ec0","externalId":"187361","tokenId":187361,"dimoMirrorId":"b41a6acf-d693-47cd-b5ce-07c55bbdd526"},"verifiedModality":"HARDWARE_DEVICE","physicalDeviceReference":"R1-861773070120068","telemetrySourceFamily":"RUPTELA_R1","deviceBindingAssurance":"PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED","providerDeviceIdHash":"0086fe48384fb1c09aa97be36935f99a","dimoTokenId":187361,"dimoExternalId":"187361","sourceMirrorId":"b41a6acf-d693-47cd-b5ce-07c55bbdd526"},"connectionIdentityCore":{"version":"vo-source-link-connection-identity-v2","contractVersion":"vo-connection-identity-v1","origin":"LEGACY_RECONCILIATION","preActivationScope":"LEGACY_NO_ONBOARDING_SOURCE_REF","preActivationProviderSourceRefId":null,"providerSourceLinkId":"71b75519-3053-4836-8bcd-554680d592b2","provider":"DIMO","sourceMirrorId":"b41a6acf-d693-47cd-b5ce-07c55bbdd526","providerVehicleReference":"187361","proposedModality":null,"verifiedModality":"HARDWARE_DEVICE","modalityVerification":"VERIFIED_PROVIDER_EVIDENCE","physicalDeviceReference":"R1-861773070120068","deviceBindingAssurance":"PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED","providerDeviceIdHash":"0086fe48384fb1c09aa97be36935f99a","dimoTokenId":187361,"verificationEvidence":["DIMO_RAW_JSON:RUPTELA_R1","serial:R1-861773070120068"],"verifiedAt":"2026-10-14T11:26:20.154Z","priorLinkLastVerifiedAt":"2026-08-25T18:52:48.258Z","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"c10351f8-b6a2-4258-947f-631aeaa6d359","sourceEvidenceFingerprint":{"rawJsonSha256":"c8c8fc45c68da72e287bf3a503c0c154e25522aaad8beb109d4106cc5f888ec0","externalId":"187361","tokenId":187361,"dimoMirrorId":"b41a6acf-d693-47cd-b5ce-07c55bbdd526"},"physicalEpisodeAttestation":{"independentlyProven":false,"reason":"PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF"}},"telemetrySourceFamily":"RUPTELA_R1","dimoMirrorId":"b41a6acf-d693-47cd-b5ce-07c55bbdd526","dimoExternalId":"187361","dimoTokenId":187361,"priorLinkLastVerifiedAt":"2026-08-25T18:52:48.258Z"},{"sourceLinkId":"805b271c-ba87-4776-9e39-23e24d595c53","vehicleId":"68868291-5478-42cd-b0c4-cc77b2a78e21","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","auditId":"c9a34e17-3787-4347-8089-464e187f1f5c","expectedBeforeFingerprint":"5ec4fb8e5a8060b6802104fc3e09bd8e148d70af4bc9869bfc94c66af8156e12","approvalManifestEntry":{"sourceLinkId":"805b271c-ba87-4776-9e39-23e24d595c53","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"68868291-5478-42cd-b0c4-cc77b2a78e21","currentMetadataFingerprint":"5ec4fb8e5a8060b6802104fc3e09bd8e148d70af4bc9869bfc94c66af8156e12","sourceEvidenceFingerprint":{"rawJsonSha256":"7f28c8a06cabd670a27ee22efccaa869d24c6c35f8834956317f2a8bec635e86","externalId":"186946","tokenId":186946,"dimoMirrorId":"8ea6a3b5-36c5-474f-b962-3dc1013b40bc"},"verifiedModality":"SOFTWARE_INTEGRATION","physicalDeviceReference":"NOT_APPLICABLE","telemetrySourceFamily":"API_SYNTHETIC","deviceBindingAssurance":null,"providerDeviceIdHash":null,"dimoTokenId":186946,"dimoExternalId":"186946","sourceMirrorId":"8ea6a3b5-36c5-474f-b962-3dc1013b40bc"},"connectionIdentityCore":{"version":"vo-source-link-connection-identity-v2","contractVersion":"vo-connection-identity-v1","origin":"LEGACY_RECONCILIATION","preActivationScope":"LEGACY_NO_ONBOARDING_SOURCE_REF","preActivationProviderSourceRefId":null,"providerSourceLinkId":"805b271c-ba87-4776-9e39-23e24d595c53","provider":"DIMO","sourceMirrorId":"8ea6a3b5-36c5-474f-b962-3dc1013b40bc","providerVehicleReference":"186946","proposedModality":null,"verifiedModality":"SOFTWARE_INTEGRATION","modalityVerification":"VERIFIED_PROVIDER_EVIDENCE","physicalDeviceReference":"NOT_APPLICABLE","deviceBindingAssurance":null,"providerDeviceIdHash":null,"dimoTokenId":186946,"verificationEvidence":["DIMO_RAW_JSON:API_SYNTHETIC","externalId:186946"],"verifiedAt":"2026-10-14T11:26:20.154Z","priorLinkLastVerifiedAt":"2026-08-25T18:52:48.215Z","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"68868291-5478-42cd-b0c4-cc77b2a78e21","sourceEvidenceFingerprint":{"rawJsonSha256":"7f28c8a06cabd670a27ee22efccaa869d24c6c35f8834956317f2a8bec635e86","externalId":"186946","tokenId":186946,"dimoMirrorId":"8ea6a3b5-36c5-474f-b962-3dc1013b40bc"},"physicalEpisodeAttestation":{"independentlyProven":false,"reason":"PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF"}},"telemetrySourceFamily":"API_SYNTHETIC","dimoMirrorId":"8ea6a3b5-36c5-474f-b962-3dc1013b40bc","dimoExternalId":"186946","dimoTokenId":186946,"priorLinkLastVerifiedAt":"2026-08-25T18:52:48.215Z"},{"sourceLinkId":"9ff5e350-cd4b-4e3a-956a-4f1770b017f2","vehicleId":"19fedd4b-c4e8-4de8-a125-dab293326e7e","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","auditId":"173f2ec5-6718-4b18-b358-17a7f7af5e12","expectedBeforeFingerprint":"5033337d03382a38fb99a9e01260b8038ed2f228353436d387d7967a90d257e5","approvalManifestEntry":{"sourceLinkId":"9ff5e350-cd4b-4e3a-956a-4f1770b017f2","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"19fedd4b-c4e8-4de8-a125-dab293326e7e","currentMetadataFingerprint":"5033337d03382a38fb99a9e01260b8038ed2f228353436d387d7967a90d257e5","sourceEvidenceFingerprint":{"rawJsonSha256":"9d8d09624ba6a091d53e38ae7768ae1e1da1b29775059378b15e050416f1f47c","externalId":"192922","tokenId":192922,"dimoMirrorId":"ded052d6-642d-4498-beed-3753afa7e36c"},"verifiedModality":"HARDWARE_DEVICE","physicalDeviceReference":"R1-865918076209847","telemetrySourceFamily":"RUPTELA_R1","deviceBindingAssurance":"PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED","providerDeviceIdHash":"70140ef81550b3c4e7cbdc26a7f4f8a5","dimoTokenId":192922,"dimoExternalId":"192922","sourceMirrorId":"ded052d6-642d-4498-beed-3753afa7e36c"},"connectionIdentityCore":{"version":"vo-source-link-connection-identity-v2","contractVersion":"vo-connection-identity-v1","origin":"LEGACY_RECONCILIATION","preActivationScope":"LEGACY_NO_ONBOARDING_SOURCE_REF","preActivationProviderSourceRefId":null,"providerSourceLinkId":"9ff5e350-cd4b-4e3a-956a-4f1770b017f2","provider":"DIMO","sourceMirrorId":"ded052d6-642d-4498-beed-3753afa7e36c","providerVehicleReference":"192922","proposedModality":null,"verifiedModality":"HARDWARE_DEVICE","modalityVerification":"VERIFIED_PROVIDER_EVIDENCE","physicalDeviceReference":"R1-865918076209847","deviceBindingAssurance":"PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED","providerDeviceIdHash":"70140ef81550b3c4e7cbdc26a7f4f8a5","dimoTokenId":192922,"verificationEvidence":["DIMO_RAW_JSON:RUPTELA_R1","serial:R1-865918076209847"],"verifiedAt":"2026-10-14T11:26:20.154Z","priorLinkLastVerifiedAt":"2026-08-25T18:52:48.354Z","organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"19fedd4b-c4e8-4de8-a125-dab293326e7e","sourceEvidenceFingerprint":{"rawJsonSha256":"9d8d09624ba6a091d53e38ae7768ae1e1da1b29775059378b15e050416f1f47c","externalId":"192922","tokenId":192922,"dimoMirrorId":"ded052d6-642d-4498-beed-3753afa7e36c"},"physicalEpisodeAttestation":{"independentlyProven":false,"reason":"PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF"}},"telemetrySourceFamily":"RUPTELA_R1","dimoMirrorId":"ded052d6-642d-4498-beed-3753afa7e36c","dimoExternalId":"192922","dimoTokenId":192922,"priorLinkLastVerifiedAt":"2026-08-25T18:52:48.354Z"}]'::jsonb;
  v_row jsonb;
  v_link_id text;
  v_vehicle_id text;
  v_consent_id text;
  v_dimo_id text;
  v_dimo_raw jsonb;
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

  IF to_regprocedure('digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'PGCRYPTO_EXTENSION_REQUIRED';
  END IF;

  IF jsonb_array_length(v_plan) <> 4 THEN
    RAISE EXCEPTION 'PLAN_ROW_COUNT_MISMATCH';
  END IF;

  IF v_manifest <> 'f9f2a17be4c361be04dc88afd4e12bb3034a4b64e84a504641a999a06cddef73' THEN
    RAISE EXCEPTION 'MANIFEST_FINGERPRINT_MISMATCH';
  END IF;

  IF (
    SELECT count(DISTINCT vdsl.id)
    FROM vehicle_data_source_links vdsl
    WHERE vdsl.id IN (
      '6fcca9d4-99d5-4be8-8985-e9369c53b7f6',
      '9ff5e350-cd4b-4e3a-956a-4f1770b017f2',
      '805b271c-ba87-4776-9e39-23e24d595c53',
      '71b75519-3053-4836-8bcd-554680d592b2'
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'COHORT_LINK_COUNT_MISMATCH';
  END IF;

  IF (
    SELECT count(*)
    FROM vehicle_connection_identity_reconciliation_audits vcira
    WHERE vcira.source_link_id IN (
      '6fcca9d4-99d5-4be8-8985-e9369c53b7f6',
      '9ff5e350-cd4b-4e3a-956a-4f1770b017f2',
      '805b271c-ba87-4776-9e39-23e24d595c53',
      '71b75519-3053-4836-8bcd-554680d592b2'
    )
  ) > 0 THEN
    RAISE EXCEPTION 'EXISTING_B1_AUDIT_FOR_COHORT';
  END IF;


  PERFORM 1
  FROM vehicle_data_source_links vdsl
  WHERE vdsl.id IN (
    SELECT value->>'sourceLinkId'
    FROM jsonb_array_elements(v_plan) AS t(value)
  )
  ORDER BY vdsl.id
  FOR UPDATE;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_plan) AS t(value) LOOP
    v_link_id := v_row->>'sourceLinkId';
    v_vehicle_id := v_row->>'vehicleId';

    SELECT vdsl.consent_id, vdsl.dimo_vehicle_id, vdsl.metadata, vdsl.last_verified_at, dv.raw_json
    INTO v_consent_id, v_dimo_id, v_before_metadata, v_before_lv, v_dimo_raw
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

    IF v_dimo_raw IS NULL THEN
      RAISE EXCEPTION 'RAW_JSON_EVIDENCE_UNAVAILABLE:%', v_link_id;
    END IF;

    IF pg_temp.vo_sig_b1_sha256_node_json(v_dimo_raw) <>
      (v_row->'approvalManifestEntry'->'sourceEvidenceFingerprint'->>'rawJsonSha256') THEN
      RAISE EXCEPTION 'RAW_JSON_SHA256_MISMATCH:%', v_link_id;
    END IF;

    IF v_row->>'priorLinkLastVerifiedAt' IS NOT NULL
      AND v_before_lv IS DISTINCT FROM ((v_row->>'priorLinkLastVerifiedAt')::timestamptz) THEN
      RAISE EXCEPTION 'PRIOR_LAST_VERIFIED_AT_MISMATCH:%', v_link_id;
    END IF;

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
