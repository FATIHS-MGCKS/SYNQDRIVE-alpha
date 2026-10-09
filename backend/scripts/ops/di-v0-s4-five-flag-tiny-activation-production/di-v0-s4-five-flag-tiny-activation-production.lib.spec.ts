import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DI_V0_S4_ENV_FLAGS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  evaluateDiV0S4RuntimeConfigAttestation,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { formatDiV0S4RuntimeConfigAttestationMetricLine } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.metrics';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import {
  applyFiveFlagMutation,
  assertDiscoveryWorkerInertWhileKilled,
  assertStagingKeysPresentAndPinned,
  computeFiveFlagSemanticDiff,
  deriveFiveFlagAttestationFingerprint,
  evaluateFiveFlagGuards,
  FIVE_FLAG_ON_KEYS,
  proveFiveFlagReplicaAttestation,
  type FiveFlagGuardInput,
} from './di-v0-s4-five-flag-tiny-activation-production.lib';

const WRAPPER = path.join(__dirname, '../di-v0-s4-enable-tiny-five-flags-production.sh');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');

const CANONICAL_ORG = CANONICAL_TINY_ORGANIZATION_ID;
const CANONICAL_VEH = CANONICAL_TINY_VEHICLE_ID;
const STAGED_NOT_BEFORE = '2026-10-09T07:03:05.861Z';

function buildStagedPrestateEnv(extraLines: string[] = []): string {
  const lines = [
    'DIMO_GLOBAL_BUDGET_ENABLED=true',
    `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${STAGED_NOT_BEFORE}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.organization}=${CANONICAL_ORG}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.vehicle}=${CANONICAL_VEH}`,
    `${DI_V0_S4_ENV_FLAGS.master}=false`,
    `${DI_V0_S4_ENV_FLAGS.discovery}=false`,
    `${DI_V0_S4_ENV_FLAGS.worker}=false`,
    `${DI_V0_S4_ENV_FLAGS.position}=false`,
    `${DI_V0_S4_ENV_FLAGS.r1}=false`,
    `${DI_V0_S4_ENV_FLAGS.native}=false`,
    ...extraLines,
  ];
  return `${lines.join('\n')}\n`;
}

function metricsFileForEnv(env: Record<string, string | undefined>): string {
  const att = evaluateDiV0S4RuntimeConfigAttestation(env);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7ao-m-')), 'metrics.txt');
  fs.writeFileSync(file, formatDiV0S4RuntimeConfigAttestationMetricLine(att));
  return file;
}

function baseGuardInput(overrides: Partial<FiveFlagGuardInput> = {}): FiveFlagGuardInput {
  const envContent = buildStagedPrestateEnv();
  const envSha = createHash('sha256').update(envContent).digest('hex');
  return {
    operatorAck: 'YES',
    fiveFlagAuthorized: 'YES',
    requiredSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    actualSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    requiredReleaseId: 'release_a',
    actualReleaseId: 'release_a',
    requiredEnvSha256: envSha,
    actualEnvSha256: envSha,
    expectedGlobalState: 'KILLED',
    globalRowLines: ['1', 'KILLED'],
    s4PersistenceLines: ['0', '0', '0', '0', '0', '0'],
    envContent,
    envReadable: true,
    vehicleDbLines: ['1', CANONICAL_ORG, 'ACTIVE', 'LTE_R1', '1', '1'],
    topologyOk: true,
    budgetConfigExplicitEnabled: true,
    budgetRuntimeBothEnabled: true,
    redisReachable: true,
    ...overrides,
  };
}

describe('S4F-7AO five-flag mutation (lib)', () => {
  it('applies exactly five ON keys and preserves staged Tiny keys', () => {
    const before = buildStagedPrestateEnv();
    const { nextContent } = applyFiveFlagMutation(before);
    const diff = computeFiveFlagSemanticDiff(before, nextContent);
    expect(diff.ok).toBe(true);
    expect(diff.envChangedKeyCount).toBe(5);
    const staging = assertStagingKeysPresentAndPinned(nextContent);
    expect(staging.ok).toBe(true);
    for (const key of FIVE_FLAG_ON_KEYS) {
      expect(nextContent).toContain(`${key}=true`);
    }
    expect(nextContent).toContain(`${DI_V0_S4_ENV_FLAGS.native}=false`);
  });

  it('rejects sixth enable flag already ON (illegal prestate)', () => {
    const before = buildStagedPrestateEnv([`${DI_V0_S4_ENV_FLAGS.master}=true`]);
    expect(() => applyFiveFlagMutation(before)).toThrow(/s4_flags_prestate/);
  });

  it('rejects native ON prestate', () => {
    const before = buildStagedPrestateEnv([`${DI_V0_S4_ENV_FLAGS.native}=true`]);
    expect(() => applyFiveFlagMutation(before)).toThrow(/s4_flags_prestate|native_flag_on_prestate/);
  });

  it('rejects staged tenant mismatch', () => {
    const before = buildStagedPrestateEnv().replace(CANONICAL_ORG, '00000000-0000-0000-0000-000000000099');
    expect(() => applyFiveFlagMutation(before)).toThrow(/staging_precondition/);
  });

  it('discovery and worker remain inert while GLOBAL KILLED even with five flags ON in env', () => {
    const before = buildStagedPrestateEnv();
    const { nextContent } = applyFiveFlagMutation(before);
    const lines = nextContent.split('\n');
    const env: Record<string, string> = {};
    for (const line of lines) {
      const idx = line.indexOf('=');
      if (idx > 0) env[line.slice(0, idx)] = line.slice(idx + 1);
    }
    const inert = assertDiscoveryWorkerInertWhileKilled(env);
    expect(inert.discoveryEnabled).toBe(false);
    expect(inert.workerEnabled).toBe(false);
    expect(inert.maintenanceEnabled).toBe(false);
  });
});

describe('S4F-7AO guards (lib)', () => {
  it('PASS with canonical pins', () => {
    expect(evaluateFiveFlagGuards(baseGuardInput()).ok).toBe(true);
  });

  it('wrong organization / vehicle DB proof => FAIL', () => {
    const g = evaluateFiveFlagGuards(
      baseGuardInput({
        vehicleDbLines: ['1', '00000000-0000-0000-0000-000000000099', 'ACTIVE', 'LTE_R1', '1', '1'],
      }),
    );
    expect(g.ok).toBe(false);
    expect(g.failures).toContain('VEHICLE_DB_PROOF_FAILED');
  });

  it('wrong kill state => FAIL', () => {
    const g = evaluateFiveFlagGuards(baseGuardInput({ globalRowLines: ['1', 'NOT_KILLED'] }));
    expect(g.ok).toBe(false);
    expect(g.failures).toContain('GLOBAL_NOT_KILLED');
  });

  it('env SHA drift => FAIL', () => {
    const g = evaluateFiveFlagGuards(baseGuardInput({ actualEnvSha256: 'b'.repeat(64) }));
    expect(g.ok).toBe(false);
    expect(g.failures).toContain('ENV_HASH_MISMATCH');
  });

  it('sixth activation prestate (master ON) => FAIL', () => {
    const envContent = buildStagedPrestateEnv([`${DI_V0_S4_ENV_FLAGS.master}=true`]);
    const g = evaluateFiveFlagGuards(baseGuardInput({ envContent }));
    expect(g.ok).toBe(false);
    expect(g.failures).toContain('S4_FLAGS_UNSAFE');
  });

  it('staged key tenant mismatch in file => FAIL', () => {
    const envContent = buildStagedPrestateEnv().replace(CANONICAL_VEH, '00000000-0000-0000-0000-000000000002');
    const g = evaluateFiveFlagGuards(baseGuardInput({ envContent }));
    expect(g.ok).toBe(false);
    expect(g.failures).toContain('STAGING_KEY_TENANT_MISMATCH');
  });

  it('missing separate five-flag authorization => FAIL (no production grant)', () => {
    const g = evaluateFiveFlagGuards(baseGuardInput({ fiveFlagAuthorized: undefined }));
    expect(g.ok).toBe(false);
    expect(g.failures).toContain('AUTHORIZATION_INVALID');
  });
});

describe('S4F-7AO runtime attestation proofs (lib)', () => {
  it('POST five-flag env yields OTHER attestation state', () => {
    const before = buildStagedPrestateEnv();
    const { nextContent } = applyFiveFlagMutation(before);
    const env: Record<string, string | undefined> = {};
    for (const line of nextContent.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) env[line.slice(0, idx)] = line.slice(idx + 1);
    }
    const fp = deriveFiveFlagAttestationFingerprint(env);
    const body = formatDiV0S4RuntimeConfigAttestationMetricLine(evaluateDiV0S4RuntimeConfigAttestation(env));
    const proof = proveFiveFlagReplicaAttestation(body);
    expect(proof.ok).toBe(true);
    expect(proof.fingerprint).toBe(fp);
  });

  it('attestation fingerprint mismatch => FAIL', () => {
    const before = buildStagedPrestateEnv();
    const { nextContent } = applyFiveFlagMutation(before);
    const env: Record<string, string | undefined> = {};
    for (const line of nextContent.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) env[line.slice(0, idx)] = line.slice(idx + 1);
    }
    const expectedFp = deriveFiveFlagAttestationFingerprint(env);
    const stagedBody = formatDiV0S4RuntimeConfigAttestationMetricLine(
      evaluateDiV0S4RuntimeConfigAttestation({
        DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: STAGED_NOT_BEFORE,
        [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
        [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
      }),
    );
    const proof = proveFiveFlagReplicaAttestation(stagedBody);
    expect(proof.ok).toBe(true);
    expect(proof.fingerprint).not.toBe(expectedFp);
  });
});

describe('S4F-7AO wrapper dry-run (fixture)', () => {
  function runDry(extra: Record<string, string> = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7ao-dry-'));
    const envFile = path.join(dir, 'backend.env');
    const envContent = extra.S4F7AO_FIXTURE_ENV_CONTENT ?? buildStagedPrestateEnv();
    fs.writeFileSync(envFile, envContent, 'utf8');
    const envSha =
      extra.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ??
      createHash('sha256').update(envContent).digest('hex');
    const releaseDir = extra.DI_S4F7J_FIXTURE_RELEASE_DIR ?? WORKSPACE_ROOT;
    const releaseId = extra.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID ?? path.basename(releaseDir);
    const requiredSha =
      extra.DI_S4_TINY_STAGING_REQUIRED_SHA ??
      execFileSync('git', ['-C', WORKSPACE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    return execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DRY_RUN: '1',
        DI_S4F7J_FIXTURE_MODE: '1',
        DI_S4_TINY_STAGING_ACK: 'YES',
        DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK: 'YES',
        DI_S4F7AO_FIVE_FLAG_AUTHORIZED: 'YES',
        DI_S4_TINY_STAGING_REQUIRED_SHA: requiredSha,
        DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: releaseId,
        DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: envSha,
        DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
        SYNQDRIVE_BACKEND_ENV: envFile,
        DI_S4F7J_FIXTURE_RELEASE_DIR: releaseDir,
        DI_S4F7J_FIXTURE_DEPLOYED_SHA: requiredSha,
        DI_S4_TINY_STAGING_ACTUAL_SHA: requiredSha,
        ...extra,
      },
    });
  }

  function expectDryFail(extra: Record<string, string> = {}): void {
    expect(() => runDry(extra)).toThrow();
  }

  it('dry-run executes full guard path without mutating production env file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7ao-dry-mut-'));
    const envFile = path.join(dir, 'backend.env');
    const content = buildStagedPrestateEnv();
    fs.writeFileSync(envFile, content, 'utf8');
    const before = fs.readFileSync(envFile, 'utf8');
    const out = runDry({
      SYNQDRIVE_BACKEND_ENV: envFile,
      DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: createHash('sha256').update(content).digest('hex'),
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(out).toContain('DRY_RUN_FULL_GUARD_PATH_EXECUTED=YES');
    expect(out).toContain('GLOBAL_KILL_ENFORCED=YES');
  });

  it('env SHA drift => dry-run FAIL', () => {
    expectDryFail({ DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: 'c'.repeat(64) });
  });

  it('wrong vehicle DB => dry-run FAIL', () => {
    expectDryFail({
      DI_S4F7J_FIXTURE_VEHICLE_DB_LINES: `1\n00000000-0000-0000-0000-000000000099\nACTIVE\nLTE_R1\n1\n1`,
    });
  });
});

describe('S4F-7AO live transaction harness (engineering)', () => {
  function postMutationEnvMap(content: string): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {};
    for (const line of content.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) env[line.slice(0, idx)] = line.slice(idx + 1);
    }
    return env;
  }

  function baseLiveEnv(extra: Record<string, string> = {}): Record<string, string> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7ao-live-'));
    const envFile = path.join(dir, 'backend.env');
    const envContent = extra.S4F7AO_FIXTURE_ENV_CONTENT ?? buildStagedPrestateEnv();
    fs.writeFileSync(envFile, envContent, 'utf8');
    const envSha =
      extra.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ??
      createHash('sha256').update(envContent).digest('hex');
    const releaseDir = extra.DI_S4F7J_FIXTURE_RELEASE_DIR ?? WORKSPACE_ROOT;
    const releaseId = extra.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID ?? path.basename(releaseDir);
    const requiredSha =
      extra.DI_S4_TINY_STAGING_REQUIRED_SHA ??
      execFileSync('git', ['-C', WORKSPACE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const stagedEnv = {
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: STAGED_NOT_BEFORE,
      [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_ORG,
      [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_VEH,
      ...FIVE_FLAG_ON_KEYS.reduce(
        (acc, k) => {
          acc[k] = 'true';
          return acc;
        },
        {} as Record<string, string>,
      ),
      [DI_V0_S4_ENV_FLAGS.native]: 'false',
    };
    const metricsA = metricsFileForEnv(postMutationEnvMap(applyFiveFlagMutation(envContent).nextContent));
    const metricsB = metricsFileForEnv(postMutationEnvMap(applyFiveFlagMutation(envContent).nextContent));
    const recoveryMetricsA = metricsFileForEnv({});
    const recoveryMetricsB = metricsFileForEnv({});
    return {
      DRY_RUN: '0',
      DI_S4F7AO_ENGINEERING_TEST_HARNESS: 'YES',
      DI_S4F7AO_TEST_MODE: '1',
      DI_S4F7J_TEST_MODE: '1',
      DI_S4F7J_FIXTURE_MODE: '1',
      SYNQDRIVE_DEPLOY_STATE_DIR: path.join(dir, 'deploy-state'),
      SYNQDRIVE_BACKEND_ENV: envFile,
      SYNQDRIVE_CURRENT_LINK: WORKSPACE_ROOT,
      DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK: 'YES',
      DI_S4F7AO_FIVE_FLAG_AUTHORIZED: 'YES',
      DI_S4_TINY_STAGING_REQUIRED_SHA: requiredSha,
      DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: releaseId,
      DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: envSha,
      DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
      DI_S4F7J_FIXTURE_DEPLOYED_SHA: requiredSha,
      DI_S4F7J_FIXTURE_RELEASE_DIR: releaseDir,
      DI_S4F7AO_FIXTURE_METRICS_BODY_A: metricsA,
      DI_S4F7AO_FIXTURE_METRICS_BODY_B: metricsB,
      DI_S4F7J_FIXTURE_METRICS_BODY_RECOVERY_A: recoveryMetricsA,
      DI_S4F7J_FIXTURE_METRICS_BODY_RECOVERY_B: recoveryMetricsB,
      ...extra,
    };
  }

  function runLive(extra: Record<string, string> = {}): { out: string; envFile: string; before: string } {
    const env = baseLiveEnv(extra);
    const envFile = env.SYNQDRIVE_BACKEND_ENV!;
    const before = fs.readFileSync(envFile, 'utf8');
    const out = execFileSync('bash', [WRAPPER], { encoding: 'utf8', env: { ...process.env, ...env } });
    return { out, envFile, before };
  }

  function expectLiveFail(extra: Record<string, string> = {}): { envFile: string; before: string } {
    const env = baseLiveEnv(extra);
    const envFile = env.SYNQDRIVE_BACKEND_ENV!;
    const before = fs.readFileSync(envFile, 'utf8');
    expect(() => execFileSync('bash', [WRAPPER], { encoding: 'utf8', env: { ...process.env, ...env } })).toThrow();
    return { envFile, before };
  }

  function runLiveExpectFail(extra: Record<string, string> = {}): { out: string; envFile: string; before: string } {
    const env = baseLiveEnv(extra);
    const envFile = env.SYNQDRIVE_BACKEND_ENV!;
    const before = fs.readFileSync(envFile, 'utf8');
    let out = '';
    try {
      out = execFileSync('bash', [WRAPPER], { encoding: 'utf8', env: { ...process.env, ...env } });
    } catch (e: unknown) {
      out = `${(e as { stdout?: string }).stdout ?? ''}${(e as { stderr?: string }).stderr ?? ''}`;
    }
    return { out, envFile, before };
  }

  function expectFullAbPrestateRollbackProof(out: string): void {
    expect(out).toContain('ROLLBACK_RESULT=COMPLETE');
    expect(out).toContain('ROLLBACK_COMPLETED=YES');
    expect(out).toContain('FULL_A_B_PRESTATE_PROOF=YES');
    expect(out).toContain('REPLICA_A_RECOVERY_PRESTATE_ATTESTATION=PASS');
    expect(out).toContain('REPLICA_B_RECOVERY_PRESTATE_ATTESTATION=PASS');
  }

  it('normal A→B success commits five-flag phase-1 env only', () => {
    const { out, envFile, before } = runLive();
    expect(out).toContain('FIVE_FLAG_PHASE1_COMMITTED=YES');
    expect(out).toContain('REPLICA_A_RESTART=YES');
    expect(out).toContain('GLOBAL_DB_MUTATION_OCCURRED=NO');
    expect(out).toContain('EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED');
    const after = fs.readFileSync(envFile, 'utf8');
    expect(after).not.toBe(before);
    const diff = computeFiveFlagSemanticDiff(before, after);
    expect(diff.ok).toBe(true);
  });

  it('backup failure => FAIL closed before mutation', () => {
    const { envFile, before } = expectLiveFail({ DI_S4F7AO_TEST_INJECT_BACKUP_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
  });

  it('replica A restart failure after dirty mark => recovers A and proves A/B PRESTATE', () => {
    const { out, envFile, before } = runLiveExpectFail({ DI_S4F7AO_TEST_INJECT_RESTART_A_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(out).toContain('REPLICA_A_RUNTIME_DIRTY=YES');
    expect(out).toContain('ROLLBACK_RECOVER_A=YES');
    expect(out).toContain('ROLLBACK_REPLICA_A_RECOVERY=ATTEMPTED');
    expectFullAbPrestateRollbackProof(out);
  });

  it('replica B restart failure after A proven => recovers A+B and proves PRESTATE on both', () => {
    const { out, envFile, before } = runLiveExpectFail({ DI_S4F7AO_TEST_INJECT_RESTART_B_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(out).toContain('ROLLBACK_RECOVER_A=YES');
    expect(out).toContain('ROLLBACK_RECOVER_B=YES');
    expectFullAbPrestateRollbackProof(out);
  });

  it('runtime attestation failure on A after restart => recovers A and proves A/B PRESTATE', () => {
    const prestateMetrics = metricsFileForEnv({});
    const fiveFlagContent = applyFiveFlagMutation(buildStagedPrestateEnv()).nextContent;
    const fiveFlagMetrics = metricsFileForEnv(postMutationEnvMap(fiveFlagContent));
    const { out, envFile, before } = runLiveExpectFail({
      DI_S4F7AO_FIXTURE_METRICS_BODY_A: prestateMetrics,
      DI_S4F7AO_FIXTURE_METRICS_BODY_B: fiveFlagMetrics,
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(out).toContain('REPLICA_A_RUNTIME_DIRTY=YES');
    expectFullAbPrestateRollbackProof(out);
  });

  it('incomplete rollback => CRITICAL_RECOVERY_STATE and never ROLLBACK_RESULT=COMPLETE', () => {
    const env = baseLiveEnv({
      DI_S4F7AO_TEST_INJECT_RESTART_A_FAIL: '1',
      DI_S4F7AO_TEST_INJECT_BACKUP_RESTORE_FAIL: '1',
    });
    const envFile = env.SYNQDRIVE_BACKEND_ENV!;
    const before = fs.readFileSync(envFile, 'utf8');
    let out = '';
    try {
      out = execFileSync('bash', [WRAPPER], { encoding: 'utf8', env: { ...process.env, ...env } });
    } catch (e: unknown) {
      out = (e as { stdout?: string }).stdout ?? '';
    }
    const after = fs.readFileSync(envFile, 'utf8');
    expect(after).not.toBe(before);
    expect(out).toContain('CRITICAL_RECOVERY_STATE=YES');
    expect(out).not.toContain('ROLLBACK_RESULT=COMPLETE');
    expect(out).toContain('ROLLBACK_RESULT=FAILED');
  });

  it('live path without five-flag authorization => FAIL', () => {
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...baseLiveEnv(),
          DI_S4F7AO_FIVE_FLAG_AUTHORIZED: '',
        },
      }),
    ).toThrow();
  });

  it('missing DRY_RUN => fail-closed before preflight', () => {
    const env = baseLiveEnv();
    delete (env as Record<string, string | undefined>).DRY_RUN;
    const { DRY_RUN: _ignored, ...procSansDry } = process.env;
    expect(() =>
      execFileSync('bash', [WRAPPER], { encoding: 'utf8', env: { ...procSansDry, ...env } }),
    ).toThrow();
  });

  it('replica B attestation failure after restart => recovers A+B with full PRESTATE proof', () => {
    const prestateMetrics = metricsFileForEnv({});
    const fiveFlagContent = applyFiveFlagMutation(buildStagedPrestateEnv()).nextContent;
    const fiveFlagMetrics = metricsFileForEnv(postMutationEnvMap(fiveFlagContent));
    const { out, envFile, before } = runLiveExpectFail({
      DI_S4F7AO_FIXTURE_METRICS_BODY_A: fiveFlagMetrics,
      DI_S4F7AO_FIXTURE_METRICS_BODY_B: prestateMetrics,
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(out).toContain('ROLLBACK_RECOVER_B=YES');
    expectFullAbPrestateRollbackProof(out);
  });

  it('replica A health failure after restart => recovers A and proves A/B PRESTATE', () => {
    const { out, envFile, before } = runLiveExpectFail({ DI_S4F7AO_TEST_INJECT_HEALTH_A_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expectFullAbPrestateRollbackProof(out);
  });

  it('replica B health failure after A proven => recovers A+B with full PRESTATE proof', () => {
    const { out, envFile, before } = runLiveExpectFail({ DI_S4F7AO_TEST_INJECT_HEALTH_B_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expectFullAbPrestateRollbackProof(out);
  });

  it('recovery restart failure => incomplete rollback fail-closed', () => {
    const prestateMetrics = metricsFileForEnv({});
    const fiveFlagContent = applyFiveFlagMutation(buildStagedPrestateEnv()).nextContent;
    const fiveFlagMetrics = metricsFileForEnv(postMutationEnvMap(fiveFlagContent));
    const { out, envFile, before } = runLiveExpectFail({
      DI_S4F7AO_FIXTURE_METRICS_BODY_A: prestateMetrics,
      DI_S4F7AO_FIXTURE_METRICS_BODY_B: fiveFlagMetrics,
      DI_S4F7AO_TEST_INJECT_RECOVERY_RESTART_A_FAIL: '1',
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(out).toContain('CRITICAL_RECOVERY_STATE=YES');
    expect(out).not.toContain('ROLLBACK_RESULT=COMPLETE');
    expect(out).toContain('ROLLBACK_RESULT=FAILED');
  });

  it('recovery attestation failure => incomplete rollback fail-closed', () => {
    const prestateMetrics = metricsFileForEnv({});
    const fiveFlagContent = applyFiveFlagMutation(buildStagedPrestateEnv()).nextContent;
    const fiveFlagMetrics = metricsFileForEnv(postMutationEnvMap(fiveFlagContent));
    const { out, envFile, before } = runLiveExpectFail({
      DI_S4F7AO_FIXTURE_METRICS_BODY_A: prestateMetrics,
      DI_S4F7AO_FIXTURE_METRICS_BODY_B: fiveFlagMetrics,
      DI_S4F7AO_TEST_INJECT_RECOVERY_ATTESTATION_FAIL: '1',
    });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(before);
    expect(out).toContain('CRITICAL_RECOVERY_STATE=YES');
    expect(out).not.toContain('FULL_A_B_PRESTATE_PROOF=YES');
    expect(out).toContain('ROLLBACK_RESULT=FAILED');
  });

  it('durable backup dir rejects /tmp outside test harness', () => {
    const lib = path.join(__dirname, '../lib/di-v0-s4-tiny-staging-production.lib.sh');
    const script = `set -euo pipefail; source "${lib}"; SYNQDRIVE_DEPLOY_STATE_DIR=/tmp/s4f7ao-nondurable s4f7j_require_durable_backup_dir`;
    expect(() =>
      execFileSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, DI_S4F7J_TEST_MODE: '0', DI_S4F7J_FIXTURE_MODE: '0' },
      }),
    ).toThrow();
  });
});

describe('S4F-7AO.1 production test-mode isolation', () => {
  function expectProductionPathFail(extra: Record<string, string>): void {
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DRY_RUN: '1',
          SYNQDRIVE_BACKEND_ENV: '/opt/synqdrive/shared/backend.env',
          DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK: 'YES',
          DI_S4F7AO_FIVE_FLAG_AUTHORIZED: 'YES',
          ...extra,
        },
      }),
    ).toThrow();
  }

  it('DI_S4F7AO_TEST_MODE on production env path => FAIL closed', () => {
    expectProductionPathFail({ DI_S4F7AO_TEST_MODE: '1' });
  });

  it('DI_S4F7J_TEST_MODE on production env path => FAIL closed', () => {
    expectProductionPathFail({ DI_S4F7J_TEST_MODE: '1' });
  });

  it('fixture mode on production env path => FAIL closed', () => {
    expectProductionPathFail({ DI_S4F7J_FIXTURE_MODE: '1' });
  });

  it('engineering harness on production env path => FAIL closed', () => {
    expectProductionPathFail({ DI_S4F7AO_ENGINEERING_TEST_HARNESS: 'YES' });
  });

  it('fixture env var on production path => FAIL closed', () => {
    expectProductionPathFail({ DI_S4F7J_FIXTURE_DEPLOYED_SHA: 'abc' });
  });
});
