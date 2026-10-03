import {
  buildDiV0S4RuntimeConfigAttestationSerialization,
  canonicalizeDiV0S4EnableFlag,
  classifyDiV0S4RuntimeAttestationState,
  classifyDiV0S4StagingValueSemantic,
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_NOT_BEFORE,
  DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_ORG_ALLOWLIST,
  DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_VEHICLE_ALLOWLIST,
  DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC,
  evaluateDiV0S4RuntimeConfigAttestation,
  EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT,
  EXPECTED_DI_V0_S4_RUNTIME_STAGED_FINGERPRINT,
  fingerprintDiV0S4RuntimeConfigAttestation,
} from './di-v0-s4-runtime-config-attestation';
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from './di-v0-s4-runtime-config-attestation-metric-parse';
import { formatDiV0S4RuntimeConfigAttestationMetricLine } from './di-v0-s4-runtime-config-attestation.metrics';
import {
  evaluateFileRuntimeDualAuthority,
  proveReplicaRuntimeAttestation,
} from '../../../../../scripts/ops/di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';
import {
  evaluateDiV0S4fTinyActivationReadiness,
  frozenTinyActivationGateKeys,
} from '../s4f-observability/di-v0-s4f-activation-readiness';

const FROZEN_UUID_ORG = DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_ORG_ALLOWLIST;
const FROZEN_UUID_VEHICLE = DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_VEHICLE_ALLOWLIST;
const FROZEN_TS = DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_NOT_BEFORE;

function stagedEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: FROZEN_TS,
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: FROZEN_UUID_ORG,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: FROZEN_UUID_VEHICLE,
    ...overrides,
  };
}

function metricBodyForAttestation(attestation: ReturnType<typeof evaluateDiV0S4RuntimeConfigAttestation>): string {
  return formatDiV0S4RuntimeConfigAttestationMetricLine(attestation);
}

describe('di-v0-s4-runtime-config-attestation', () => {
  it('1 all missing => PRESTATE', () => {
    expect(classifyDiV0S4RuntimeAttestationState({})).toBe('PRESTATE');
  });

  it('2 explicit false flags + missing staging => PRESTATE', () => {
    expect(
      classifyDiV0S4RuntimeAttestationState({
        DI_V0_S4_MASTER_ENABLED: 'false',
        DI_V0_S4_DISCOVERY_ENABLED: '0',
      }),
    ).toBe('PRESTATE');
  });

  it('3 semantically equivalent false spellings share fingerprint', () => {
    const a = evaluateDiV0S4RuntimeConfigAttestation({ DI_V0_S4_MASTER_ENABLED: 'false' });
    const b = evaluateDiV0S4RuntimeConfigAttestation({ DI_V0_S4_MASTER_ENABLED: '0' });
    const c = evaluateDiV0S4RuntimeConfigAttestation({ DI_V0_S4_MASTER_ENABLED: 'off' });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(b.fingerprint).toBe(c.fingerprint);
  });

  it('4 one flag true => OTHER', () => {
    expect(classifyDiV0S4RuntimeAttestationState({ DI_V0_S4_MASTER_ENABLED: 'true' })).toBe('OTHER');
  });

  it('5 exact frozen staging + flags off => STAGED', () => {
    expect(classifyDiV0S4RuntimeAttestationState(stagedEnv())).toBe('STAGED');
  });

  it('6 wrong NOT_BEFORE => OTHER', () => {
    expect(classifyDiV0S4RuntimeAttestationState(stagedEnv({ DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: 'wrong' }))).toBe(
      'OTHER',
    );
  });

  it('7 wrong org => OTHER', () => {
    expect(
      classifyDiV0S4RuntimeAttestationState(stagedEnv({ [DI_V0_S4_ENV_ALLOWLISTS.organization]: 'other' })),
    ).toBe('OTHER');
  });

  it('8 wrong vehicle => OTHER', () => {
    expect(
      classifyDiV0S4RuntimeAttestationState(stagedEnv({ [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: 'other' })),
    ).toBe('OTHER');
  });

  it('9 staging key empty => OTHER', () => {
    expect(
      classifyDiV0S4RuntimeAttestationState(stagedEnv({ [DI_V0_S4_ENV_ALLOWLISTS.organization]: '' })),
    ).toBe('OTHER');
  });

  it('10 MISSING != EMPTY fingerprint', () => {
    const missing = evaluateDiV0S4RuntimeConfigAttestation({});
    const empty = evaluateDiV0S4RuntimeConfigAttestation({
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: '',
    });
    expect(missing.fingerprint).not.toBe(empty.fingerprint);
  });

  it('11 PRESTATE fingerprint deterministic', () => {
    const a = evaluateDiV0S4RuntimeConfigAttestation({});
    const b = evaluateDiV0S4RuntimeConfigAttestation({});
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toBe(EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT);
  });

  it('12 STAGED fingerprint deterministic', () => {
    const a = evaluateDiV0S4RuntimeConfigAttestation(stagedEnv());
    const b = evaluateDiV0S4RuntimeConfigAttestation(stagedEnv());
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toBe(EXPECTED_DI_V0_S4_RUNTIME_STAGED_FINGERPRINT);
  });

  it('13 PRESTATE != STAGED fingerprint', () => {
    expect(EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT).not.toBe(EXPECTED_DI_V0_S4_RUNTIME_STAGED_FINGERPRINT);
  });

  it('14 fixed key order independent of object insertion order', () => {
    const envA: Record<string, string> = {
      DI_V0_S4_VEHICLE_ALLOWLIST: FROZEN_UUID_VEHICLE,
      DI_V0_S4_MASTER_ENABLED: 'false',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: FROZEN_UUID_ORG,
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: FROZEN_TS,
    };
    const envB: Record<string, string> = {
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: FROZEN_TS,
      DI_V0_S4_ORGANIZATION_ALLOWLIST: FROZEN_UUID_ORG,
      DI_V0_S4_VEHICLE_ALLOWLIST: FROZEN_UUID_VEHICLE,
      DI_V0_S4_MASTER_ENABLED: 'false',
    };
    expect(
      evaluateDiV0S4RuntimeConfigAttestation(envA).fingerprint,
    ).toBe(evaluateDiV0S4RuntimeConfigAttestation(envB).fingerprint);
  });

  it('15 fingerprint lowercase 64-char SHA-256', () => {
    const fp = evaluateDiV0S4RuntimeConfigAttestation({}).fingerprint;
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('16 metric rendering excludes raw UUIDs and timestamp', () => {
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation(stagedEnv()));
    expect(body).not.toContain(FROZEN_UUID_ORG);
    expect(body).not.toContain(FROZEN_UUID_VEHICLE);
    expect(body).not.toContain(FROZEN_TS);
    expect(body).toContain(DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC);
  });

  it('17 full process env not serialized', () => {
    const serialization = buildDiV0S4RuntimeConfigAttestationSerialization({
      DI_V0_S4_MASTER_ENABLED: 'false',
      UNRELATED_SECRET_KEY: 'must-not-appear',
    });
    expect(serialization).not.toContain('UNRELATED_SECRET_KEY');
    expect(serialization.split('\n').filter(Boolean).length).toBe(9);
  });

  it('18 unrelated process.env key cannot affect fingerprint', () => {
    const a = evaluateDiV0S4RuntimeConfigAttestation({});
    const b = evaluateDiV0S4RuntimeConfigAttestation({ UNRELATED_KEY: 'x' });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('19 duplicate metric sample parser fails', () => {
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation({}));
    const dup = `${body}\n${body}`;
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(dup)).toThrow('ATTESTATION_METRIC_DUPLICATE');
  });

  it('20 missing metric fails', () => {
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody('# empty\n')).toThrow(
      'ATTESTATION_METRIC_MISSING',
    );
  });

  it('21 malformed hash fails', () => {
    const bad = `${DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC}{fingerprint="not-a-hash",state="PRESTATE",contract_version="v1"} 1\n`;
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(bad)).toThrow(
      'MALFORMED_ATTESTATION_FINGERPRINT',
    );
  });

  it('22 unsupported state fails', () => {
    const bad = `${DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC}{fingerprint="${'a'.repeat(64)}",state="BOGUS",contract_version="v1"} 1\n`;
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(bad)).toThrow('UNSUPPORTED_ATTESTATION_STATE');
  });

  it('23 authenticated metric parsing PASS fixture', () => {
    const att = evaluateDiV0S4RuntimeConfigAttestation(stagedEnv());
    const parsed = parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(metricBodyForAttestation(att));
    expect(parsed.state).toBe('STAGED');
    expect(parsed.fingerprint).toBe(att.fingerprint);
  });

  it('24 auth failure is enforced outside parser (no body)', () => {
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody('')).toThrow();
  });

  it('25 PRIMARY_STAGING wrapper expects STAGED', () => {
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation(stagedEnv()));
    expect(proveReplicaRuntimeAttestation(body, 'PRIMARY_STAGING').ok).toBe(true);
  });

  it('26 RECOVERY_PRESTATE wrapper expects PRESTATE', () => {
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation({}));
    expect(proveReplicaRuntimeAttestation(body, 'RECOVERY_PRESTATE').ok).toBe(true);
  });

  it('27 PRIMARY receiving PRESTATE fails', () => {
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation({}));
    expect(proveReplicaRuntimeAttestation(body, 'PRIMARY_STAGING').ok).toBe(false);
  });

  it('28 RECOVERY receiving STAGED fails', () => {
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation(stagedEnv()));
    expect(proveReplicaRuntimeAttestation(body, 'RECOVERY_PRESTATE').ok).toBe(false);
  });

  it('29 file STAGED + runtime PRESTATE fails', () => {
    const file = `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${FROZEN_TS}\nDI_V0_S4_ORGANIZATION_ALLOWLIST=${FROZEN_UUID_ORG}\nDI_V0_S4_VEHICLE_ALLOWLIST=${FROZEN_UUID_VEHICLE}\n`;
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation({}));
    expect(evaluateFileRuntimeDualAuthority(file, body).ok).toBe(false);
  });

  it('30 file PRESTATE + runtime STAGED fails', () => {
    const file = '';
    const body = metricBodyForAttestation(evaluateDiV0S4RuntimeConfigAttestation(stagedEnv()));
    expect(evaluateFileRuntimeDualAuthority(file, body).ok).toBe(false);
  });

  it('boolean canonicalization uses S4A semantics', () => {
    expect(canonicalizeDiV0S4EnableFlag('yes')).toBe('ON');
    expect(canonicalizeDiV0S4EnableFlag(undefined)).toBe('OFF');
    expect(classifyDiV0S4StagingValueSemantic(undefined)).toBe('MISSING');
    expect(classifyDiV0S4StagingValueSemantic('')).toBe('EMPTY');
  });

  it('fingerprint uses stable serialization terminator', () => {
    const ser = buildDiV0S4RuntimeConfigAttestationSerialization({});
    expect(ser.endsWith('\n')).toBe(true);
    expect(fingerprintDiV0S4RuntimeConfigAttestation(ser)).toBe(EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT);
  });

  it('dormancy: attestation evaluation does not alter Tiny activation readiness', () => {
    const gatesBefore = evaluateDiV0S4fTinyActivationReadiness({});
    evaluateDiV0S4RuntimeConfigAttestation(stagedEnv());
    evaluateDiV0S4RuntimeConfigAttestation({});
    const gatesAfter = evaluateDiV0S4fTinyActivationReadiness({});
    expect(gatesAfter).toEqual(gatesBefore);
    expect(frozenTinyActivationGateKeys()).toHaveLength(6);
  });
});
