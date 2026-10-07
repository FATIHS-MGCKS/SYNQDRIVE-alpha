import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  applyFreshTinyStagingMutation,
  assertToolShaPin,
  buildFreshStagingValuesMap,
  deriveInternallyComputedFreshFingerprint,
  evaluateFreshTinyStagingGuards,
  proveReplicaFreshPrimaryStagingRuntime,
  proveReplicaRecoveryPrestateRuntime,
  validateFreshAuthority,
  type FreshTinyStagingGuardInput,
} from './di-v0-s4-fresh-tiny-staging-production.lib';
import {
  EXPIRED_S4F7U_EVIDENCE_FINGERPRINT,
  EXPIRED_S4F7U_EVIDENCE_NOT_BEFORE,
  FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS,
  HISTORICAL_FROZEN_V1_STAGED_NOT_BEFORE,
} from './di-v0-s4-fresh-tiny-staging-authority';
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  evaluateDiV0S4RuntimeConfigAttestation,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { formatDiV0S4RuntimeConfigAttestationMetricLine } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.metrics';
import { DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation-metric-parse';
import {
  advanceFreshStagingTransaction,
  applyMutationPhase,
  evaluateReplicaAAttestation,
  evaluateRollbackRecoveryAttestation,
  restoreExactEnvBytes,
  shouldBlockReplicaBRestart,
  type FreshStagingTransactionContext,
} from './di-v0-s4-fresh-tiny-staging-transaction.lib';
import { OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before';

const CANONICAL_ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const CANONICAL_VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const PRESTATE_FP = 'b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d';

function freshEnv(notBefore: string, dbClock: string, fp?: string) {
  const fingerprint =
    fp ??
    deriveInternallyComputedFreshFingerprint(notBefore, CANONICAL_ORG, CANONICAL_VEH);
  return {
    freshNotBefore: notBefore,
    operatorExpectedFingerprint: fingerprint,
    organizationAllowlist: CANONICAL_ORG,
    vehicleAllowlist: CANONICAL_VEH,
    dbClockCanonicalUtc: dbClock,
  };
}

function metricsBodyForEnv(env: Record<string, string | undefined>): string {
  const att = evaluateDiV0S4RuntimeConfigAttestation(env);
  return formatDiV0S4RuntimeConfigAttestationMetricLine(att);
}

function baseGuardInput(overrides: Partial<FreshTinyStagingGuardInput> = {}): FreshTinyStagingGuardInput {
  const freshNb = '2026-10-07T10:00:00.000Z';
  const dbClock = '2026-10-07T10:05:00.000Z';
  const fp = deriveInternallyComputedFreshFingerprint(freshNb, CANONICAL_ORG, CANONICAL_VEH);
  return {
    operatorAck: 'YES',
    requiredSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    actualSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    requiredReleaseId: 'release_a',
    actualReleaseId: 'release_a',
    requiredEnvSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    actualEnvSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    expectedGlobalState: 'KILLED',
    globalRowLines: ['1', 'KILLED'],
    s4PersistenceLines: ['0', '0', '0', '0', '0', '0'],
    envContent: 'FOO=bar\n',
    envReadable: true,
    vehicleDbLines: ['1', CANONICAL_ORG, 'ACTIVE', 'LTE_R1', '1', '1'],
    preNotBeforeState: 'MISSING',
    preOrgAllowlistState: 'MISSING',
    preVehicleAllowlistState: 'MISSING',
    topologyOk: true,
    budgetConfigExplicitEnabled: true,
    budgetRuntimeBothEnabled: true,
    redisReachable: true,
    dryRun: true,
    freshAuthority: freshEnv(freshNb, dbClock, fp),
    toolCheckoutSha: 'cccccccccccccccccccccccccccccccccccccccc',
    requiredToolSha: 'cccccccccccccccccccccccccccccccccccccccc',
    ...overrides,
  };
}

describe('S4F-7V fresh authority', () => {
  it('valid fresh authority PASS', () => {
    const nb = '2026-10-07T11:00:00.000Z';
    const db = '2026-10-07T11:01:00.000Z';
    const r = validateFreshAuthority(freshEnv(nb, db));
    expect(r.ok).toBe(true);
    expect(r.internallyComputedFingerprint).toHaveLength(64);
  });

  it('missing fresh cutoff FAIL', () => {
    const r = validateFreshAuthority({
      ...freshEnv('2026-10-07T11:00:00.000Z', '2026-10-07T11:01:00.000Z'),
      freshNotBefore: undefined,
    });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('FRESH_NOT_BEFORE_MISSING');
  });

  it('malformed cutoff FAIL', () => {
    const r = validateFreshAuthority(freshEnv('not-a-date', '2026-10-07T11:01:00.000Z'));
    expect(r.ok).toBe(false);
  });

  it('future cutoff FAIL', () => {
    const r = validateFreshAuthority(freshEnv('2026-10-07T12:00:00.000Z', '2026-10-07T11:00:00.000Z'));
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('FRESH_AUTHORITY_FUTURE');
  });

  it('age exactly 900 seconds PASS', () => {
    const nb = '2026-10-07T10:00:00.000Z';
    const db = '2026-10-07T10:15:00.000Z';
    const r = validateFreshAuthority(freshEnv(nb, db));
    expect(r.ok).toBe(true);
    expect(r.ageSeconds).toBe(900);
  });

  it('age >900 seconds FAIL', () => {
    const nb = '2026-10-07T10:00:00.000Z';
    const db = '2026-10-07T10:15:00.001Z';
    const r = validateFreshAuthority(freshEnv(nb, db));
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('FRESH_AUTHORITY_TOO_OLD');
  });

  it('expired S4F-7U sample is not default executable authority', () => {
    const r = validateFreshAuthority(
      freshEnv(EXPIRED_S4F7U_EVIDENCE_NOT_BEFORE, '2026-10-06T19:00:00.000Z', EXPIRED_S4F7U_EVIDENCE_FINGERPRINT),
    );
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('FRESH_AUTHORITY_TOO_OLD');
  });

  it('historical frozen cutoff rejected', () => {
    const r = validateFreshAuthority(
      freshEnv(HISTORICAL_FROZEN_V1_STAGED_NOT_BEFORE, '2026-10-07T11:00:00.000Z'),
    );
    expect(r.ok).toBe(false);
  });

  it('wrong org FAIL', () => {
    const r = validateFreshAuthority({
      ...freshEnv('2026-10-07T11:00:00.000Z', '2026-10-07T11:01:00.000Z'),
      organizationAllowlist: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.failures).toContain('FRESH_ORG_INVALID');
  });

  it('wrong vehicle FAIL', () => {
    const r = validateFreshAuthority({
      ...freshEnv('2026-10-07T11:00:00.000Z', '2026-10-07T11:01:00.000Z'),
      vehicleAllowlist: '00000000-0000-0000-0000-000000000002',
    });
    expect(r.failures).toContain('FRESH_VEHICLE_INVALID');
  });

  it('wildcard FAIL', () => {
    const r = validateFreshAuthority({
      ...freshEnv('2026-10-07T11:00:00.000Z', '2026-10-07T11:01:00.000Z'),
      vehicleAllowlist: '*',
    });
    expect(r.failures).toContain('FRESH_VEHICLE_INVALID');
  });

  it('operator fingerprint mismatch FAIL', () => {
    const r = validateFreshAuthority({
      ...freshEnv('2026-10-07T11:00:00.000Z', '2026-10-07T11:01:00.000Z'),
      operatorExpectedFingerprint: 'a'.repeat(64),
    });
    expect(r.failures).toContain('FRESH_FINGERPRINT_MISMATCH');
  });

  it('malformed fingerprint FAIL', () => {
    const r = validateFreshAuthority({
      ...freshEnv('2026-10-07T11:00:00.000Z', '2026-10-07T11:01:00.000Z'),
      operatorExpectedFingerprint: 'not-hex',
    });
    expect(r.failures).toContain('FRESH_FINGERPRINT_MALFORMED');
  });

  it('authority expiring between preflight and mutation FAIL', () => {
    const nb = '2026-10-07T10:00:00.000Z';
    const fp = deriveInternallyComputedFreshFingerprint(nb, CANONICAL_ORG, CANONICAL_VEH);
    const input = baseGuardInput({
      freshAuthority: freshEnv(nb, '2026-10-07T10:05:00.000Z', fp),
      finalPreMutationDbClock: '2026-10-07T10:20:00.000Z',
    });
    const g = evaluateFreshTinyStagingGuards(input);
    expect(g.ok).toBe(false);
    expect(g.failures).toContain('FRESH_AUTHORITY_TOO_OLD');
  });

  it('fingerprint recompute match YES', () => {
    const nb = '2026-10-07T12:34:56.789Z';
    const a = deriveInternallyComputedFreshFingerprint(nb, CANONICAL_ORG, CANONICAL_VEH);
    const b = deriveInternallyComputedFreshFingerprint(nb, CANONICAL_ORG, CANONICAL_VEH);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fresh v1 state OTHER', () => {
    const nb = '2026-10-07T12:00:00.000Z';
    const att = evaluateDiV0S4RuntimeConfigAttestation({
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: nb,
      [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
      [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
    });
    expect(att.state).toBe('OTHER');
  });
});

describe('S4F-7V runtime metric proof', () => {
  const nb = '2026-10-07T12:00:00.000Z';
  const fp = deriveInternallyComputedFreshFingerprint(nb, CANONICAL_ORG, CANONICAL_VEH);

  it('v1 OTHER exact fingerprint PASS', () => {
    const body = metricsBodyForEnv({
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: nb,
      [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
      [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
    });
    expect(proveReplicaFreshPrimaryStagingRuntime(body, fp).ok).toBe(true);
  });

  it('v1 OTHER wrong fingerprint FAIL', () => {
    const body = metricsBodyForEnv({
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: nb,
      [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
      [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
    });
    expect(proveReplicaFreshPrimaryStagingRuntime(body, 'b'.repeat(64)).ok).toBe(false);
  });

  it('v1 STAGED fresh fingerprint FAIL', () => {
    const body = metricsBodyForEnv({
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE,
      [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
      [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
    });
    expect(proveReplicaFreshPrimaryStagingRuntime(body, fp).ok).toBe(false);
  });

  it('PRESTATE during primary staging FAIL', () => {
    const body = metricsBodyForEnv({});
    expect(proveReplicaFreshPrimaryStagingRuntime(body, fp).ok).toBe(false);
  });

  it('recovery PRESTATE PASS', () => {
    const body = metricsBodyForEnv({});
    expect(proveReplicaRecoveryPrestateRuntime(body).ok).toBe(true);
    expect(proveReplicaRecoveryPrestateRuntime(body).fingerprint).toBe(PRESTATE_FP);
  });

  it('metric missing FAIL', () => {
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody('# empty\n')).toThrow(
      'ATTESTATION_METRIC_MISSING',
    );
    expect(proveReplicaFreshPrimaryStagingRuntime('# empty\n', fp).ok).toBe(false);
  });

  it('metric duplicate FAIL', () => {
    const line = metricsBodyForEnv({
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: nb,
      [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
      [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
    });
    const body = `${line}\n${line}`;
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(body)).toThrow(
      'ATTESTATION_METRIC_DUPLICATE',
    );
  });

  it('metric malformed FAIL', () => {
    const bad = `${DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC}{bad} 1\n`;
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(bad)).toThrow(
      'MALFORMED_ATTESTATION_METRIC_LINE',
    );
  });

  it('wrong contract version FAIL', () => {
    const line = `${DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC}{fingerprint="${fp}",state="OTHER",contract_version="v2"} 1\n`;
    expect(() => parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(line)).toThrow(
      'UNSUPPORTED_ATTESTATION_CONTRACT_VERSION',
    );
  });
});

describe('S4F-7V env mutation dry', () => {
  it('apply fresh mutation on clean prestate', () => {
    const nb = '2026-10-07T15:00:00.000Z';
    const map = buildFreshStagingValuesMap(nb, CANONICAL_ORG, CANONICAL_VEH);
    const { nextContent, targetKeyCountAfter } = applyFreshTinyStagingMutation('FOO=1\n', map);
    expect(targetKeyCountAfter).toBe(3);
    expect(nextContent).toContain(nb);
  });

  it('target key PRESENT FAIL', () => {
    const map = buildFreshStagingValuesMap('2026-10-07T15:00:00.000Z', CANONICAL_ORG, CANONICAL_VEH);
    expect(() =>
      applyFreshTinyStagingMutation('DI_V0_S4_ORGANIZATION_ALLOWLIST=x\n', map),
    ).toThrow();
  });
});

describe('S4F-7V guards', () => {
  it('full guard PASS dry-run', () => {
    expect(evaluateFreshTinyStagingGuards(baseGuardInput()).ok).toBe(true);
  });

  it('SHA mismatch FAIL', () => {
    expect(evaluateFreshTinyStagingGuards(baseGuardInput({ actualSha: 'deadbeef' })).ok).toBe(false);
  });

  it('GLOBAL not KILLED FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ globalRowLines: ['1', 'NOT_KILLED'] })).ok,
    ).toBe(false);
  });

  it('tool SHA pin mismatch FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ toolCheckoutSha: 'd'.repeat(40) })).ok,
    ).toBe(false);
  });

  it('release mismatch FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ actualReleaseId: 'other_release' })).ok,
    ).toBe(false);
  });

  it('pre-env hash mismatch FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ actualEnvSha256: 'c'.repeat(64) })).ok,
    ).toBe(false);
  });

  it('duplicate GLOBAL FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ globalRowLines: ['2', 'KILLED'] })).ok,
    ).toBe(false);
  });

  it('S4 flag ON FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(
        baseGuardInput({ envContent: 'DI_V0_S4_MASTER_ENABLED=ON\nDIMO_GLOBAL_BUDGET_ENABLED=true\n' }),
      ).ok,
    ).toBe(false);
  });

  it('target staging key PRESENT FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(
        baseGuardInput({ preNotBeforeState: 'PRESENT', envContent: 'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=x\n' }),
      ).ok,
    ).toBe(false);
  });

  it('target staging key EMPTY FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ preOrgAllowlistState: 'EMPTY' })).ok,
    ).toBe(false);
  });

  it('duplicate target key FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(
        baseGuardInput({
          envContent: 'DI_V0_S4_ORGANIZATION_ALLOWLIST=a\nDI_V0_S4_ORGANIZATION_ALLOWLIST=b\n',
          preOrgAllowlistState: 'PRESENT',
        }),
      ).ok,
    ).toBe(false);
  });

  it('S4 persistence nonzero FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ s4PersistenceLines: ['1', '0', '0', '0', '0', '0'] })).ok,
    ).toBe(false);
  });

  it('Tiny vehicle wrong tenant FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(
        baseGuardInput({ vehicleDbLines: ['1', '00000000-0000-0000-0000-000000000099', 'ACTIVE', 'LTE_R1', '1', '1'] }),
      ).ok,
    ).toBe(false);
  });

  it('Tiny vehicle inactive FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(
        baseGuardInput({ vehicleDbLines: ['1', CANONICAL_ORG, 'INACTIVE', 'LTE_R1', '1', '1'] }),
      ).ok,
    ).toBe(false);
  });

  it('wrong hardware FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(
        baseGuardInput({ vehicleDbLines: ['1', CANONICAL_ORG, 'ACTIVE', 'OTHER', '1', '1'] }),
      ).ok,
    ).toBe(false);
  });

  it('provider link inactive FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(
        baseGuardInput({ vehicleDbLines: ['1', CANONICAL_ORG, 'ACTIVE', 'LTE_R1', '0', '1'] }),
      ).ok,
    ).toBe(false);
  });

  it('budget disabled FAIL', () => {
    expect(
      evaluateFreshTinyStagingGuards(baseGuardInput({ budgetRuntimeBothEnabled: false })).ok,
    ).toBe(false);
  });

  it('Redis unavailable FAIL', () => {
    expect(evaluateFreshTinyStagingGuards(baseGuardInput({ redisReachable: false })).ok).toBe(false);
  });

  it('topology unsafe FAIL', () => {
    expect(evaluateFreshTinyStagingGuards(baseGuardInput({ topologyOk: false })).ok).toBe(false);
  });
});

describe('S4F-7V transaction orchestration', () => {
  const nb = '2026-10-07T17:00:00.000Z';
  const fp = deriveInternallyComputedFreshFingerprint(nb, CANONICAL_ORG, CANONICAL_VEH);
  const map = buildFreshStagingValuesMap(nb, CANONICAL_ORG, CANONICAL_VEH);
  const original = 'FOO=bar\n';

  it('rollback restores exact env bytes', () => {
    const mutated = applyMutationPhase(original, map);
    expect(mutated.ok).toBe(true);
    if (!mutated.ok) return;
    expect(restoreExactEnvBytes(original, mutated.nextBytes)).toBe(original);
  });

  it('B restart blocked until A attestation', () => {
    expect(shouldBlockReplicaBRestart(false)).toBe(true);
    expect(shouldBlockReplicaBRestart(true)).toBe(false);
  });

  it('A attestation failure triggers rollback phase', () => {
    const ctx = {
      phase: 'REPLICA_A_RESTARTED' as const,
      originalEnvBytes: original,
      currentEnvBytes: original,
      expectedFreshFingerprint: fp,
      replicaAAttestationOk: false,
      replicaBAttestationOk: false,
      rollbackRequired: false,
    };
    const after = advanceFreshStagingTransaction(ctx, 'A_ATTESTATION_FAIL');
    expect(after.phase).toBe('ROLLBACK');
    expect(after.rollbackRequired).toBe(true);
    expect(after.currentEnvBytes).toBe(original);
  });

  it('A attestation OK allows B path', () => {
    const body = metricsBodyForEnv({
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: nb,
      [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
      [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
    });
    expect(evaluateReplicaAAttestation(body, fp)).toBe(true);
    let ctx: FreshStagingTransactionContext = {
      phase: 'REPLICA_A_RESTARTED',
      originalEnvBytes: original,
      currentEnvBytes: original,
      expectedFreshFingerprint: fp,
      replicaAAttestationOk: false,
      replicaBAttestationOk: false,
      rollbackRequired: false,
    };
    ctx = advanceFreshStagingTransaction(ctx, 'A_ATTESTATION_OK');
    expect(ctx.replicaAAttestationOk).toBe(true);
    ctx = advanceFreshStagingTransaction(ctx, 'B_RESTART_OK');
    expect(ctx.phase).toBe('REPLICA_B_RESTARTED');
  });

  it('rollback recovery PRESTATE on both replicas', () => {
    const body = metricsBodyForEnv({});
    expect(evaluateRollbackRecoveryAttestation(body)).toBe(true);
  });

  it('B attestation failure triggers rollback', () => {
    const ctx = {
      phase: 'REPLICA_B_RESTARTED' as const,
      originalEnvBytes: original,
      currentEnvBytes: original,
      expectedFreshFingerprint: fp,
      replicaAAttestationOk: true,
      replicaBAttestationOk: false,
      rollbackRequired: false,
    };
    const after = advanceFreshStagingTransaction(ctx, 'B_ATTESTATION_FAIL');
    expect(after.phase).toBe('ROLLBACK');
  });
});

describe('S4F-7J regression untouched', () => {
  it('historical frozen not before still valid', () => {
    const { validateOpsFrozenNotBeforeCandidate } = require('../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before');
    expect(validateOpsFrozenNotBeforeCandidate(OPS_FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE).ok).toBe(true);
  });
});

describe('S4F-7W fresh wrapper dry-run orchestration', () => {
  const WRAPPER = path.join(__dirname, '../di-v0-s4-stage-tiny-fresh-production.sh');
  const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
  const TOOL_SHA = 'cccccccccccccccccccccccccccccccccccccccc';

  function writePrestateMetricsBodyFile(): string {
    const att = evaluateDiV0S4RuntimeConfigAttestation({});
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7w-m-')), 'metrics.txt');
    fs.writeFileSync(file, formatDiV0S4RuntimeConfigAttestationMetricLine(att));
    return file;
  }

  function runFreshDryRun(extraEnv: Record<string, string> = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7w-'));
    const envFile = path.join(dir, 'backend.env');
    const envContent = extraEnv.S4F7W_FIXTURE_ENV_CONTENT ?? 'DIMO_GLOBAL_BUDGET_ENABLED=true\n';
    fs.writeFileSync(envFile, envContent, 'utf8');
    const envSha =
      extraEnv.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ??
      createHash('sha256').update(envContent).digest('hex');
    const releaseDir = extraEnv.DI_S4F7V_FIXTURE_RELEASE_DIR ?? WORKSPACE_ROOT;
    const releaseId = extraEnv.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID ?? path.basename(releaseDir);
    const requiredSha =
      extraEnv.DI_S4_TINY_STAGING_REQUIRED_SHA ??
      (releaseDir === WORKSPACE_ROOT
        ? execFileSync('git', ['-C', WORKSPACE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
        : 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const nb = extraEnv.DI_S4_TINY_FRESH_NOT_BEFORE ?? '2026-10-07T16:00:00.000Z';
    const fp =
      extraEnv.DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT ??
      deriveInternallyComputedFreshFingerprint(nb, CANONICAL_ORG, CANONICAL_VEH);
    const metricsA = writePrestateMetricsBodyFile();
    const metricsB = writePrestateMetricsBodyFile();
    return execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DRY_RUN: '1',
        DI_S4F7V_TEST_MODE: '1',
        DI_S4F7V_FIXTURE_MODE: '1',
        SYNQDRIVE_BACKEND_ENV: envFile,
        DI_S4_TINY_STAGING_ACK: 'YES',
        DI_S4_TINY_STAGING_REQUIRED_SHA: requiredSha,
        DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: releaseId,
        DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: envSha,
        DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
        DI_S4_TINY_FRESH_NOT_BEFORE: nb,
        DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: fp,
        DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
        DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST: CANONICAL_VEH,
        DI_S4F7V_DB_CLOCK_CANONICAL_UTC: extraEnv.DI_S4F7V_DB_CLOCK_CANONICAL_UTC ?? '2026-10-07T16:01:00.000Z',
        EXPECTED_FRESH_TINY_STAGING_TOOL_SHA: TOOL_SHA,
        DI_S4F7V_TOOL_CHECKOUT_SHA: TOOL_SHA,
        DI_S4F7V_FIXTURE_DEPLOYED_SHA: requiredSha,
        DI_S4F7V_FIXTURE_RELEASE_DIR: releaseDir,
        DI_S4F7V_FIXTURE_METRICS_BODY_A: metricsA,
        DI_S4F7V_FIXTURE_METRICS_BODY_B: metricsB,
        ...extraEnv,
      },
    });
  }

  function expectFreshDryRunFail(extraEnv: Record<string, string> = {}): void {
    expect(() => runFreshDryRun(extraEnv)).toThrow();
  }

  it('all live guards valid + DRY_RUN=1 => PASS', () => {
    const out = runFreshDryRun();
    expect(out).toContain('GUARDS_OK=YES');
    expect(out).toContain('DRY_RUN_FULL_GUARD_PATH_EXECUTED=YES');
    expect(out).toContain('INTENDED_ENV_CHANGED_KEY_COUNT=3');
    expect(out).toContain('DRY_RUN_ENV_MUTATION_COUNT=0');
    expect(out).toContain('PRODUCTION_SHA_PIN=PASS');
    expect(out).toContain('FRESH_AUTHORITY_OK=YES');
  });

  it('required SHA mismatch => wrapper FAIL', () => {
    expectFreshDryRunFail({
      DI_S4_TINY_STAGING_REQUIRED_SHA: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      DI_S4F7V_FIXTURE_DEPLOYED_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('release mismatch => wrapper FAIL', () => {
    expectFreshDryRunFail({ DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: 'wrong_release_id' });
  });

  it('env hash mismatch => wrapper FAIL', () => {
    expectFreshDryRunFail({ DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: 'c'.repeat(64) });
  });

  it('GLOBAL NOT_KILLED => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_GLOBAL_KILL_STATE: 'NOT_KILLED' });
  });

  it('GLOBAL duplicate => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_GLOBAL_ROW_COUNT: '2' });
  });

  it('S4 persistence nonzero => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_S4_PIPELINE: '1' });
  });

  it('S4 flag ON => FAIL', () => {
    expectFreshDryRunFail({
      S4F7W_FIXTURE_ENV_CONTENT: 'DI_V0_S4_MASTER_ENABLED=ON\nDIMO_GLOBAL_BUDGET_ENABLED=true\n',
    });
  });

  it('staging target PRESENT => FAIL', () => {
    expectFreshDryRunFail({
      S4F7W_FIXTURE_ENV_CONTENT: 'DI_V0_S4_ORGANIZATION_ALLOWLIST=x\nDIMO_GLOBAL_BUDGET_ENABLED=true\n',
    });
  });

  it('staging target EMPTY => FAIL', () => {
    expectFreshDryRunFail({
      S4F7W_FIXTURE_ENV_CONTENT: 'DI_V0_S4_ORGANIZATION_ALLOWLIST=\nDIMO_GLOBAL_BUDGET_ENABLED=true\n',
    });
  });

  it('vehicle wrong tenant => FAIL', () => {
    expectFreshDryRunFail({
      DI_S4F7V_FIXTURE_VEHICLE_DB_LINES: '1\n00000000-0000-0000-0000-000000000099\nACTIVE\nLTE_R1\n1\n1',
    });
  });

  it('vehicle inactive => FAIL', () => {
    expectFreshDryRunFail({
      DI_S4F7V_FIXTURE_VEHICLE_DB_LINES: `1\n${CANONICAL_ORG}\nINACTIVE\nLTE_R1\n1\n1`,
    });
  });

  it('hardware not LTE_R1 => FAIL', () => {
    expectFreshDryRunFail({
      DI_S4F7V_FIXTURE_VEHICLE_DB_LINES: `1\n${CANONICAL_ORG}\nACTIVE\nOTHER\n1\n1`,
    });
  });

  it('provider link inactive => FAIL', () => {
    expectFreshDryRunFail({
      DI_S4F7V_FIXTURE_VEHICLE_DB_LINES: `1\n${CANONICAL_ORG}\nACTIVE\nLTE_R1\n0\n1`,
    });
  });

  it('scheduler !=1 => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_SCHEDULER_LEADERS: '2' });
  });

  it('nginx fail => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_NGINX_DUAL: 'NO' });
  });

  it('budget config disabled => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_BUDGET_CONFIG_FAIL: '1' });
  });

  it('budget runtime replica A fail => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_BUDGET_METRIC_A_FAIL: '1' });
  });

  it('budget runtime replica B fail => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_BUDGET_METRIC_B_FAIL: '1' });
  });

  it('Redis fail => FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_FIXTURE_REDIS_FAIL: '1' });
  });

  it('fresh authority stale => FAIL', () => {
    expectFreshDryRunFail({
      DI_S4_TINY_FRESH_NOT_BEFORE: '2026-10-07T10:00:00.000Z',
      DI_S4F7V_DB_CLOCK_CANONICAL_UTC: '2026-10-07T10:20:00.000Z',
    });
  });

  it('fresh authority future => FAIL', () => {
    expectFreshDryRunFail({
      DI_S4_TINY_FRESH_NOT_BEFORE: '2026-10-07T18:00:00.000Z',
      DI_S4F7V_DB_CLOCK_CANONICAL_UTC: '2026-10-07T16:00:00.000Z',
    });
  });

  it('fingerprint mismatch => FAIL', () => {
    expectFreshDryRunFail({ DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: 'a'.repeat(64) });
  });

  it('tool SHA mismatch => FAIL', () => {
    expectFreshDryRunFail({ EXPECTED_FRESH_TINY_STAGING_TOOL_SHA: 'd'.repeat(40) });
  });

  it('apply-mutation-dry failure => wrapper FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_TEST_INJECT_APPLY_DRY_FAIL: '1' });
  });

  it('intended-delta failure => wrapper FAIL', () => {
    expectFreshDryRunFail({ DI_S4F7V_TEST_INJECT_INTENDED_DELTA_FAIL: '1' });
  });

  it('PASS causes zero env mutation on production env file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7w-mut-'));
    const envFile = path.join(dir, 'backend.env');
    const content = 'DIMO_GLOBAL_BUDGET_ENABLED=true\n';
    fs.writeFileSync(envFile, content, 'utf8');
    const before = fs.readFileSync(envFile, 'utf8');
    runFreshDryRun({
      SYNQDRIVE_BACKEND_ENV: envFile,
      DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: createHash('sha256').update(content).digest('hex'),
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });
});

describe('S4F-7Y live transaction orchestration (test harness)', () => {
  const WRAPPER = path.join(__dirname, '../di-v0-s4-stage-tiny-fresh-production.sh');
  const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
  const TOOL_SHA = 'cccccccccccccccccccccccccccccccccccccccc';

  function metricsFileForEnv(env: Record<string, string | undefined>): string {
    const att = evaluateDiV0S4RuntimeConfigAttestation(env);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7y-m-')), 'metrics.txt');
    fs.writeFileSync(file, formatDiV0S4RuntimeConfigAttestationMetricLine(att));
    return file;
  }

  function baseLiveEnv(extra: Record<string, string> = {}): Record<string, string> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7y-'));
    const envFile = path.join(dir, 'backend.env');
    const envContent = extra.S4F7Y_FIXTURE_ENV_CONTENT ?? 'DIMO_GLOBAL_BUDGET_ENABLED=true\n';
    fs.writeFileSync(envFile, envContent, 'utf8');
    const envSha =
      extra.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ??
      createHash('sha256').update(envContent).digest('hex');
    const releaseDir = extra.DI_S4F7V_FIXTURE_RELEASE_DIR ?? WORKSPACE_ROOT;
    const releaseId = extra.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID ?? path.basename(releaseDir);
    const requiredSha =
      extra.DI_S4_TINY_STAGING_REQUIRED_SHA ??
      (releaseDir === WORKSPACE_ROOT
        ? execFileSync('git', ['-C', WORKSPACE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
        : 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const nb = extra.DI_S4_TINY_FRESH_NOT_BEFORE ?? '2026-10-07T16:00:00.000Z';
    const fp =
      extra.DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT ??
      deriveInternallyComputedFreshFingerprint(nb, CANONICAL_ORG, CANONICAL_VEH);
    const prestate = metricsFileForEnv({});
    const stagedEnv: Record<string, string | undefined> = {
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: nb,
      DI_V0_S4_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
      DI_V0_S4_VEHICLE_ALLOWLIST: CANONICAL_VEH,
    };
    const freshA = metricsFileForEnv(stagedEnv);
    const freshB = metricsFileForEnv(stagedEnv);
    return {
      DRY_RUN: '0',
      DI_S4F7Y_TEST_MODE: '1',
      DI_S4F7V_TEST_MODE: '1',
      DI_S4F7V_FIXTURE_MODE: '1',
      SYNQDRIVE_DEPLOY_STATE_DIR: path.join(dir, 'deploy-state'),
      SYNQDRIVE_BACKEND_ENV: envFile,
      SYNQDRIVE_CURRENT_LINK: WORKSPACE_ROOT,
      DI_S4_TINY_STAGING_ACK: 'YES',
      DI_S4F7Y_LIVE_STAGING_AUTHORIZED: 'YES',
      DI_S4_TINY_STAGING_REQUIRED_SHA: requiredSha,
      DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: releaseId,
      DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: envSha,
      DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
      DI_S4_TINY_FRESH_NOT_BEFORE: nb,
      DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: fp,
      DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
      DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST: CANONICAL_VEH,
      DI_S4F7V_DB_CLOCK_CANONICAL_UTC: extra.DI_S4F7V_DB_CLOCK_CANONICAL_UTC ?? '2026-10-07T16:01:00.000Z',
      EXPECTED_FRESH_TINY_STAGING_TOOL_SHA: TOOL_SHA,
      DI_S4F7V_TOOL_CHECKOUT_SHA: TOOL_SHA,
      AUTHORIZED_TOOL_SHA: TOOL_SHA,
      AUTHORIZED_PRODUCTION_SHA: requiredSha,
      AUTHORIZED_PRODUCTION_RELEASE_ID: releaseId,
      AUTHORIZED_PRE_ENV_SHA256: envSha,
      AUTHORIZED_FRESH_NOT_BEFORE: nb,
      AUTHORIZED_FRESH_EXPECTED_FINGERPRINT: fp,
      AUTHORIZED_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
      AUTHORIZED_VEHICLE_ALLOWLIST: CANONICAL_VEH,
      DI_S4F7V_FIXTURE_DEPLOYED_SHA: requiredSha,
      DI_S4F7V_FIXTURE_RELEASE_DIR: releaseDir,
      DI_S4F7V_FIXTURE_METRICS_BODY_A: prestate,
      DI_S4F7V_FIXTURE_METRICS_BODY_B: prestate,
      DI_S4F7Y_FIXTURE_METRICS_BODY_FRESH_A: freshA,
      DI_S4F7Y_FIXTURE_METRICS_BODY_FRESH_B: freshB,
      ...extra,
    };
  }

  function runFreshLive(extra: Record<string, string> = {}): string {
    return execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: { ...process.env, ...baseLiveEnv(extra) },
    });
  }

  function expectFreshLiveFail(extra: Record<string, string> = {}): void {
    expect(() => runFreshLive(extra)).toThrow();
  }

  it('reproduces pending runbook when live auth missing', () => {
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DRY_RUN: '0',
          DI_S4_TINY_STAGING_ACK: 'YES',
          DI_S4_TINY_FRESH_NOT_BEFORE: '2026-10-07T16:00:00.000Z',
          DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT: 'a'.repeat(64),
          DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST: CANONICAL_ORG,
          DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST: CANONICAL_VEH,
          EXPECTED_FRESH_TINY_STAGING_TOOL_SHA: TOOL_SHA,
        },
      }),
    ).toThrow();
  });

  it('S4F7V alone cannot authorize live path', () => {
    let out = '';
    try {
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...baseLiveEnv(),
          DI_S4F7Y_LIVE_STAGING_AUTHORIZED: '',
          DI_S4F7V_LIVE_STAGING_AUTHORIZED: 'YES',
        },
      });
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? '');
    }
    expect(out).toContain('OLD_S4F7V_AUTHORIZATION_ALONE_CAN_AUTHORIZE_LIVE_MUTATION=YES');
  });

  it('successful harness live transaction', () => {
    const out = runFreshLive();
    expect(out).toContain('LIVE_STAGING_TRANSACTION_COMMITTED=YES');
    expect(out).toContain('ROLLING_RESTART_ORDER=A_THEN_B');
    expect(out).toContain('REPLICA_A_ATTESTATION_BEFORE_B_RESTART=YES');
    expect(out).toContain('POST_STAGING_GLOBAL_KILLED_VERIFIED=YES');
    expect(out).toContain('EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED');
  });

  it('wrong authorized tool SHA fails before mutation', () => {
    expectFreshLiveFail({ AUTHORIZED_TOOL_SHA: 'd'.repeat(40) });
  });

  it('stale JIT fails at final gate', () => {
    expectFreshLiveFail({
      DI_S4F7V_DB_CLOCK_CANONICAL_UTC: '2026-10-07T18:00:00.000Z',
      DI_S4_TINY_FRESH_NOT_BEFORE: '2026-10-07T16:00:00.000Z',
      AUTHORIZED_FRESH_NOT_BEFORE: '2026-10-07T16:00:00.000Z',
    });
  });

  it('new completed trip after cutoff fails', () => {
    expectFreshLiveFail({ DI_S4F7Y_FIXTURE_ELIGIBLE_TRIP_COUNT: '1' });
  });

  it('Replica A restart failure blocks B forward restart', () => {
    const thrown = expect(() => runFreshLive({ DI_S4F7Y_TEST_INJECT_RESTART_A_FAIL: '1' })).toThrow();
    void thrown;
    try {
      runFreshLive({ DI_S4F7Y_TEST_INJECT_RESTART_A_FAIL: '1' });
    } catch (e) {
      const err = e as { stdout?: string };
      const out = String(err.stdout ?? '');
      expect(out).toContain('A_FAILURE_FORWARD_B_RESTART_COUNT=0');
      expect(out).toContain('ROLLBACK_RESULT=COMPLETE');
    }
  });

  it('mutation failure triggers rollback path', () => {
    try {
      runFreshLive({ DI_S4F7Y_TEST_INJECT_MUTATION_FAIL: '1' });
    } catch (e) {
      const err = e as { stdout?: string };
      expect(String(err.stdout ?? '')).toContain('ROLLBACK_RESULT=COMPLETE');
    }
  });

  it('backup failure aborts before mutation', () => {
    expectFreshLiveFail({ DI_S4F7Y_TEST_INJECT_BACKUP_FAIL: '1' });
  });
});
