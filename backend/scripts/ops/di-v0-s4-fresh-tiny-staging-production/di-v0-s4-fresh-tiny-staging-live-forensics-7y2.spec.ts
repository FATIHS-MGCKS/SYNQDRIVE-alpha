import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { deriveInternallyComputedFreshFingerprint } from './di-v0-s4-fresh-tiny-staging-production.lib';
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  evaluateDiV0S4RuntimeConfigAttestation,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { formatDiV0S4RuntimeConfigAttestationMetricLine } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.metrics';

const WRAPPER = path.join(__dirname, '../di-v0-s4-stage-tiny-fresh-production.sh');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const CANONICAL_ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const CANONICAL_VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const TOOL_SHA = 'cccccccccccccccccccccccccccccccccccccccc';

const Y2_TERMINAL_KEYS = [
  'PRODUCTION_STAGING_AUTHORIZED',
  'PRODUCTION_STAGING_ATTEMPTED',
  'PRODUCTION_STAGING_EXECUTED',
  'PRODUCTION_STAGING_TRANSACTION_COMMITTED',
  'PRODUCTION_ENV_MUTATION_OCCURRED',
  'PRODUCTION_RESTART_ATTEMPTED',
  'PRODUCTION_RESTART_OCCURRED',
  'PRODUCTION_MUTATION_OCCURRED',
  'PRODUCTION_ROLLBACK_ATTEMPTED',
  'PRODUCTION_ROLLBACK_COMPLETED',
  'PRODUCTION_FINAL_STATE_RESTORED',
  'FORWARD_RESTART_SUCCESS_COUNT',
  'ROLLBACK_RESTART_SUCCESS_COUNT',
  'TOTAL_PRODUCTION_RESTART_SUCCESS_COUNT',
];

function countKey(output: string, key: string): number {
  return output.split('\n').filter((l) => l.startsWith(`${key}=`)).length;
}

function assertTerminalCardinalityOnce(out: string): void {
  expect(out).toContain('TERMINAL_OUTCOME_AUTHORITY_COUNT=1');
  expect(out).toContain('TERMINAL_OUTCOME_KEYS_DUPLICATED=NO');
  expect(out).toContain('TERMINAL_OUTCOME_KEYS_CONTRADICTORY=NO');
  for (const key of Y2_TERMINAL_KEYS) {
    expect(countKey(out, key)).toBe(1);
  }
}

function metricsFileForEnv(env: Record<string, string | undefined>): string {
  const att = evaluateDiV0S4RuntimeConfigAttestation(env);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7y2-m-')), 'metrics.txt');
  fs.writeFileSync(file, formatDiV0S4RuntimeConfigAttestationMetricLine(att));
  return file;
}

function baseFixtureEnv(extra: Record<string, string> = {}, mode: 'engineering' | 'forensic'): Record<string, string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7y2-'));
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
  const modeFlags =
    mode === 'engineering'
      ? { DI_S4F7Y_ENGINEERING_TEST_HARNESS: 'YES', DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION: '' }
      : { DI_S4F7Y_ENGINEERING_TEST_HARNESS: '', DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION: 'YES' };
  return {
    DRY_RUN: '0',
    ...modeFlags,
    DI_S4F7V_FIXTURE_MODE: '1',
    DI_S4F7V_TEST_MODE: '1',
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

function runWrapper(env: Record<string, string>): string {
  return execFileSync('bash', [WRAPPER], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function runWrapperFail(env: Record<string, string>): string {
  try {
    runWrapper(env);
    return '';
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? '');
  }
}

describe('S4F-7Y.2 terminal outcome forensics', () => {
  it('failure before authorization', () => {
    const out = runWrapperFail({
      ...baseFixtureEnv({}, 'forensic'),
      DI_S4F7Y_LIVE_STAGING_AUTHORIZED: '',
    });
    assertTerminalCardinalityOnce(out);
    expect(out).toContain('PRODUCTION_STAGING_AUTHORIZED=NO');
    expect(out).toContain('PRODUCTION_STAGING_ATTEMPTED=NO');
    expect(out).toContain('PRODUCTION_STAGING_EXECUTED=NO');
  });

  it('failure after authorization before mutation preserves auth fact', () => {
    const out = runWrapperFail({
      ...baseFixtureEnv({ DI_S4F7Y_TEST_INJECT_BACKUP_FAIL: '1' }, 'forensic'),
    });
    assertTerminalCardinalityOnce(out);
    expect(out).toContain('LIVE_STAGING_OPERATOR_AUTHORIZATION_VALIDATED=YES');
    expect(out).toContain('PRODUCTION_STAGING_AUTHORIZED=YES');
    expect(out).toContain('PRODUCTION_STAGING_ATTEMPTED=YES');
    expect(out).toContain('PRODUCTION_ENV_MUTATION_OCCURRED=NO');
    expect(countKey(out, 'PRODUCTION_STAGING_AUTHORIZED')).toBe(1);
  });

  it('failure after mutation with successful rollback retains mutation history', () => {
    const out = runWrapperFail({
      ...baseFixtureEnv({ DI_S4F7Y_TEST_INJECT_FINAL_POSTSTATE_FAIL: '1' }, 'forensic'),
    });
    assertTerminalCardinalityOnce(out);
    expect(out).toContain('PRODUCTION_ENV_MUTATION_OCCURRED=YES');
    expect(out).toContain('PRODUCTION_MUTATION_OCCURRED=YES');
    expect(out).toContain('PRODUCTION_ROLLBACK_ATTEMPTED=YES');
    expect(out).toContain('PRODUCTION_ROLLBACK_COMPLETED=YES');
    expect(out).toContain('PRODUCTION_FINAL_STATE_RESTORED=YES');
    expect(out).toContain('ROLLBACK_RESULT=COMPLETE');
  });

  it('failure after forward restart with successful rollback retains restart history', () => {
    const out = runWrapperFail({
      ...baseFixtureEnv({ DI_S4F7Y_TEST_INJECT_ATTESTATION_B_FAIL: '1' }, 'forensic'),
    });
    assertTerminalCardinalityOnce(out);
    expect(out).toContain('PRODUCTION_RESTART_ATTEMPTED=YES');
    expect(out).toContain('PRODUCTION_RESTART_OCCURRED=YES');
    expect(out).toContain('PRODUCTION_ENV_MUTATION_OCCURRED=YES');
    expect(out).toContain('PRODUCTION_ROLLBACK_COMPLETED=YES');
    expect(out).toContain('FORWARD_RESTART_SUCCESS_COUNT=2');
  });

  it('rollback failure leaves rollback incomplete', () => {
    const out = runWrapperFail({
      ...baseFixtureEnv(
        {
          DI_S4F7Y_TEST_INJECT_FINAL_POSTSTATE_FAIL: '1',
          DI_S4F7Y_TEST_INJECT_ROLLBACK_RESTART_A_FAIL: '1',
        },
        'forensic',
      ),
    });
    assertTerminalCardinalityOnce(out);
    expect(out).toContain('PRODUCTION_ROLLBACK_ATTEMPTED=YES');
    expect(out).toContain('PRODUCTION_ROLLBACK_COMPLETED=NO');
    expect(out).toContain('PRODUCTION_FINAL_STATE_RESTORED=NO');
    expect(out).toContain('ROLLBACK_RESULT=FAILED');
  });

  it('successful forensic production simulation commit', () => {
    const out = runWrapper(baseFixtureEnv({}, 'forensic'));
    assertTerminalCardinalityOnce(out);
    expect(out).toContain('PRODUCTION_STAGING_AUTHORIZED=YES');
    expect(out).toContain('PRODUCTION_STAGING_ATTEMPTED=YES');
    expect(out).toContain('PRODUCTION_STAGING_EXECUTED=YES');
    expect(out).toContain('PRODUCTION_STAGING_TRANSACTION_COMMITTED=YES');
    expect(out).toContain('PRODUCTION_ENV_MUTATION_OCCURRED=YES');
    expect(out).toContain('PRODUCTION_RESTART_OCCURRED=YES');
    expect(out).toContain('PRODUCTION_ROLLBACK_ATTEMPTED=NO');
    const preTerminal = out.split('TERMINAL_OUTCOME_AUTHORITY_COUNT=1')[0] ?? '';
    expect(preTerminal).not.toContain('PRODUCTION_STAGING_AUTHORIZED=YES');
    expect(preTerminal).toContain('LIVE_STAGING_OPERATOR_AUTHORIZATION_VALIDATED=YES');
  });

  it('successful engineering simulation keeps production terminal history NO', () => {
    const out = runWrapper(baseFixtureEnv({}, 'engineering'));
    assertTerminalCardinalityOnce(out);
    expect(out).toContain('ENGINEERING_TEST_HARNESS_LIVE_TRANSACTION=SIMULATED');
    expect(out).toContain('PRODUCTION_STAGING_AUTHORIZED=NO');
    expect(out).toContain('PRODUCTION_STAGING_EXECUTED=NO');
    expect(out).toContain('PRODUCTION_MUTATION_OCCURRED=NO');
    expect(out).toContain('LIVE_STAGING_TRANSACTION_COMMITTED=YES');
  });
});
