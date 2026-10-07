import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { deriveInternallyComputedFreshFingerprint } from './di-v0-s4-fresh-tiny-staging-production.lib';
import { evaluateEngineeringTestHarnessContract } from './di-v0-s4-fresh-tiny-staging-live-authority.lib';
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

function countKey(output: string, key: string): number {
  return output.split('\n').filter((l) => l === `${key}=YES` || l.startsWith(`${key}=`)).length;
}

function metricsFileForEnv(env: Record<string, string | undefined>): string {
  const att = evaluateDiV0S4RuntimeConfigAttestation(env);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7y1-m-')), 'metrics.txt');
  fs.writeFileSync(file, formatDiV0S4RuntimeConfigAttestationMetricLine(att));
  return file;
}

function baseHarnessEnv(extra: Record<string, string> = {}): Record<string, string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7y1-'));
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
    DI_S4F7Y_ENGINEERING_TEST_HARNESS: 'YES',
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

function runHarness(extra: Record<string, string> = {}): string {
  return execFileSync('bash', [WRAPPER], {
    encoding: 'utf8',
    env: { ...process.env, ...baseHarnessEnv(extra) },
  });
}

describe('S4F-7Y.1 safety seal', () => {
  const LIVE_LIB = path.join(__dirname, '../lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh');

  it('implements production-success terminal semantics in shell authority', () => {
    const sh = fs.readFileSync(LIVE_LIB, 'utf8');
    expect(sh).toContain('PRODUCTION_SUCCESS');
    expect(sh).toContain('PRODUCTION_STAGING_EXECUTED=YES');
    expect(sh).not.toMatch(/export DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES/);
  });

  it('engineering harness rejects production backend.env path', () => {
    const r = evaluateEngineeringTestHarnessContract({
      DI_S4F7Y_ENGINEERING_TEST_HARNESS: 'YES',
      SYNQDRIVE_BACKEND_ENV: '/opt/synqdrive/shared/backend.env',
      DI_S4F7V_FIXTURE_DEPLOYED_SHA: 'a'.repeat(40),
      DI_S4F7V_FIXTURE_RELEASE_DIR: '/tmp/x',
    });
    expect(r.ok).toBe(false);
  });

  it('legacy test mode alone cannot run live transaction', () => {
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...baseHarnessEnv(),
          DI_S4F7Y_ENGINEERING_TEST_HARNESS: '',
          DI_S4F7V_TEST_MODE: '1',
        },
      }),
    ).toThrow();
  });

  it('legacy S4F7V alone reports CAN_AUTHORIZE=NO', () => {
    const base = baseHarnessEnv();
    let out = '';
    try {
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...base,
          DI_S4F7Y_LIVE_STAGING_AUTHORIZED: '',
          DI_S4F7Y_ENGINEERING_TEST_HARNESS: '',
          DI_S4F7V_LIVE_STAGING_AUTHORIZED: 'YES',
        },
      });
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? '');
    }
    expect(out).toContain('OLD_S4F7V_AUTHORIZATION_ALONE_CAN_AUTHORIZE_LIVE_MUTATION=NO');
    expect(out).not.toContain('OLD_S4F7V_AUTHORIZATION_ALONE_CAN_AUTHORIZE_LIVE_MUTATION=YES');
  });

  it('successful harness reports production execution NO and no contradictory terminal keys', () => {
    const out = runHarness();
    expect(out).toContain('LIVE_STAGING_TRANSACTION_COMMITTED=YES');
    expect(out).toContain('PRODUCTION_STAGING_EXECUTED=NO');
    expect(out).toContain('PRODUCTION_MUTATION_OCCURRED=NO');
    expect(out).toContain('LIVE_TRANSACTION_SYNTHESIZES_AUTHORIZATION=NO');
    expect(out).toContain('FINAL_ENV_POSTSTATE_REVERIFY=PASS');
    expect(out).toContain('FINAL_REPLICA_A_FRESH_ATTESTATION=PASS');
    expect(out).toContain('FINAL_REPLICA_B_FRESH_ATTESTATION=PASS');
    expect(countKey(out, 'PRODUCTION_STAGING_EXECUTED')).toBe(1);
    expect(countKey(out, 'PRODUCTION_MUTATION_OCCURRED')).toBe(1);
  });

  it('rollback A restart failure surfaces FAILED', () => {
    try {
      runHarness({
        DI_S4F7Y_TEST_INJECT_FINAL_POSTSTATE_FAIL: '1',
        DI_S4F7Y_TEST_INJECT_ROLLBACK_RESTART_A_FAIL: '1',
      });
    } catch (e) {
      const out = String((e as { stdout?: string }).stdout ?? '');
      expect(out).toContain('ROLLBACK_REPLICA_A_RESTART_RESULT=FAILED');
      expect(out).toContain('ROLLBACK_RESULT=FAILED');
      expect(out).not.toContain('ROLLBACK_RESULT=COMPLETE');
    }
  });

  it('final env poststate failure triggers rollback', () => {
    try {
      runHarness({ DI_S4F7Y_TEST_INJECT_FINAL_POSTSTATE_FAIL: '1' });
    } catch (e) {
      const out = String((e as { stdout?: string }).stdout ?? '');
      expect(out).toContain('FINAL_ENV_POSTSTATE_REVERIFY=FAIL');
      expect(out).toContain('ROLLBACK_RESULT=COMPLETE');
    }
  });
});
