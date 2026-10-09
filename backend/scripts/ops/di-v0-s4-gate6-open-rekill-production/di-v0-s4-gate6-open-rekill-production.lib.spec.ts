import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DI_V0_S4_ENV_FLAGS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { DI_V0_S4_ENV_ALLOWLISTS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import {
  applyFiveFlagMutation,
  deriveFiveFlagAttestationFingerprint,
} from '../di-v0-s4-five-flag-tiny-activation-production/di-v0-s4-five-flag-tiny-activation-production.lib';
import { envMapFromFileContent } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import {
  assertFiveFlagsOnInEnv,
  evaluateEmergencyRekillAck,
  evaluateGate6OpenGuards,
  type Gate6OpenGuardInput,
} from './di-v0-s4-gate6-open-rekill-production.lib';
import {
  computeGate6LiveOpenDispatchDigest,
  evaluateGate6LiveOpenAuthority,
  evaluateGate6ProductionPathIsolation,
} from './di-v0-s4-gate6-live-authority.lib';

const CLI = path.join(__dirname, 'di-v0-s4-gate6-open-rekill-production-cli.ts');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');

const WRAPPER = path.join(__dirname, '../di-v0-s4-gate6-open-rekill-production.sh');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');

const STAGED_NOT_BEFORE = '2026-10-09T07:03:05.861Z';

function buildFiveFlagOnEnv(): string {
  const staged = buildBaseStagedEnv();
  const { nextContent } = applyFiveFlagMutation(staged);
  return nextContent;
}

function buildBaseStagedEnv(): string {
  return [
    'DIMO_GLOBAL_BUDGET_ENABLED=true',
    `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${STAGED_NOT_BEFORE}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.organization}=${CANONICAL_TINY_ORGANIZATION_ID}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.vehicle}=${CANONICAL_TINY_VEHICLE_ID}`,
    ...Object.values(DI_V0_S4_ENV_FLAGS).map((k) => `${k}=false`),
  ].join('\n') + '\n';
}

function baseOpenInput(overrides: Partial<Gate6OpenGuardInput> = {}): Gate6OpenGuardInput {
  const envContent = buildFiveFlagOnEnv();
  const envSha = createHash('sha256').update(envContent).digest('hex');
  const fp = deriveFiveFlagAttestationFingerprint(envMapFromFileContent(envContent));
  return {
    gate6Ack: 'YES',
    gate6Authorized: 'YES',
    requiredSha: 'a'.repeat(40),
    actualSha: 'a'.repeat(40),
    requiredReleaseId: 'rel',
    actualReleaseId: 'rel',
    requiredEnvSha256: envSha,
    actualEnvSha256: envSha,
    expectedAttestationFingerprint: undefined,
    replicaAFingerprint: fp,
    replicaBFingerprint: fp,
    globalRowLines: ['1', 'KILLED'],
    s4PersistenceLines: ['0', '0', '0', '0', '0', '0'],
    envContent,
    vehicleDbLines: ['1', CANONICAL_TINY_ORGANIZATION_ID, 'ACTIVE', 'LTE_R1', '1', '1'],
    topologyOk: true,
    budgetConfigOk: true,
    budgetRuntimeOk: true,
    redisOk: true,
    ...overrides,
  };
}

describe('S4F-7AS Gate-6 open guards (lib)', () => {
  it('passes with five flags on and GLOBAL KILLED prestate', () => {
    expect(evaluateGate6OpenGuards(baseOpenInput()).ok).toBe(true);
  });

  it('fails when GLOBAL prestate is NOT_KILLED', () => {
    const g = evaluateGate6OpenGuards(baseOpenInput({ globalRowLines: ['1', 'NOT_KILLED'] }));
    expect(g.failures).toContain('GLOBAL_PRESTATE_NOT_KILLED');
  });

  it('fails on wrong env SHA pin', () => {
    const g = evaluateGate6OpenGuards(baseOpenInput({ actualEnvSha256: 'b'.repeat(64) }));
    expect(g.failures).toContain('ENV_HASH_MISMATCH');
  });

  it('fails on Gate-6 authorization missing', () => {
    const g = evaluateGate6OpenGuards(baseOpenInput({ gate6Authorized: undefined }));
    expect(g.failures).toContain('GATE6_AUTHORIZATION_INVALID');
  });

  it('fails on replica attestation parity break', () => {
    const g = evaluateGate6OpenGuards(
      baseOpenInput({ replicaAFingerprint: 'a'.repeat(64), replicaBFingerprint: 'b'.repeat(64) }),
    );
    expect(g.failures).toContain('ATTESTATION_FP_PARITY');
  });

  it('fails when a five flag is off', () => {
    const env = buildFiveFlagOnEnv().replace('DI_V0_S4_MASTER_ENABLED=true', 'DI_V0_S4_MASTER_ENABLED=false');
    const g = evaluateGate6OpenGuards(baseOpenInput({ envContent: env }));
    expect(g.failures).toContain('FIVE_FLAGS_NOT_ALL_ON');
  });

  it('assertFiveFlagsOnInEnv requires all five true', () => {
    const bad = buildBaseStagedEnv();
    expect(assertFiveFlagsOnInEnv(bad).ok).toBe(false);
    expect(assertFiveFlagsOnInEnv(buildFiveFlagOnEnv()).ok).toBe(true);
  });

  it('evaluateEmergencyRekillAck requires ack and audit fields', () => {
    expect(evaluateEmergencyRekillAck('YES', 'reason', 'actor')).toBe(true);
    expect(evaluateEmergencyRekillAck(undefined, 'reason', 'actor')).toBe(false);
  });

  it('live open authority requires dispatch digest and audit fields', () => {
    const input = baseOpenInput();
    const bad = evaluateGate6LiveOpenAuthority(input, {}, { reason: '', actor: '' });
    expect(bad.ok).toBe(false);
    expect(bad.failures).toContain('AUDIT_FIELDS_MISSING');
    expect(bad.failures).toContain('DISPATCH_NONCE_MISSING');
  });

  it('dispatch digest binds pins nonce and audit', () => {
    const input = baseOpenInput();
    const d1 = computeGate6LiveOpenDispatchDigest({
      requiredSha: input.requiredSha!,
      requiredReleaseId: input.requiredReleaseId!,
      requiredEnvSha256: input.requiredEnvSha256!,
      nonce: 'n1',
      reason: 'r',
      actor: 'a',
    });
    const d2 = computeGate6LiveOpenDispatchDigest({
      requiredSha: input.requiredSha!,
      requiredReleaseId: input.requiredReleaseId!,
      requiredEnvSha256: input.requiredEnvSha256!,
      nonce: 'n2',
      reason: 'r',
      actor: 'a',
    });
    expect(d1).not.toBe(d2);
    const env = {
      DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE: 'n1',
      DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST: d1,
    };
    const ok = evaluateGate6LiveOpenAuthority(input, env, { reason: 'r', actor: 'a' });
    expect(ok.failures).not.toContain('DISPATCH_DIGEST_INVALID');
  });

  it('production fixture env vars fail closed on canonical production backend.env', () => {
    const r = evaluateGate6ProductionPathIsolation({
      SYNQDRIVE_BACKEND_ENV_CANONICAL: '/opt/synqdrive/shared/backend.env',
      DI_S4F7J_FIXTURE_MODE: '1',
    });
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/PRODUCTION_FIXTURE_CONTROL_PRESENT/);
  });
});

describe('S4F-7AS CLI authority', () => {
  it('direct live-open is forbidden', () => {
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'live-open'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      expect(combined).toContain('DIRECT_CLI_LIVE_OPEN_FORBIDDEN=YES');
    }
  });

  it('live-open-authorized fails without dispatch on production canonical env', () => {
    expect(() =>
      execFileSync(
        'npx',
        ['--yes', 'ts-node', '--transpile-only', CLI, 'live-open-authorized'],
        {
          encoding: 'utf8',
          cwd: BACKEND_ROOT,
          env: {
            ...process.env,
            SYNQDRIVE_BACKEND_ENV_CANONICAL: '/opt/synqdrive/shared/backend.env',
            DI_S4_GATE6_OPEN_ACK: 'YES',
            DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
            DI_S4_TINY_STAGING_REQUIRED_SHA: 'a'.repeat(40),
            DI_S4_TINY_STAGING_ACTUAL_SHA: 'a'.repeat(40),
            DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: 'rel',
            DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID: 'rel',
            DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: 'b'.repeat(64),
            DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256: 'b'.repeat(64),
            DI_S4_GATE6_OPERATOR_REASON: 'r',
            DI_S4_GATE6_OPERATOR_ACTOR: 'a',
          },
        },
      ),
    ).toThrow();
  });
});

describe('S4F-7AS wrapper (fixture)', () => {
  function runOpenDry(extra: Record<string, string> = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7as-'));
    const envFile = path.join(dir, 'backend.env');
    const envContent = extra.S4F7AS_FIXTURE_ENV_CONTENT ?? buildFiveFlagOnEnv();
    fs.writeFileSync(envFile, envContent, 'utf8');
    const envSha = createHash('sha256').update(envContent).digest('hex');
    const metricsA = path.join(dir, 'a.txt');
    const metricsB = path.join(dir, 'b.txt');
    const fp = deriveFiveFlagAttestationFingerprint(envMapFromFileContent(envContent));
    const fpLine = `synqdrive_di_v0_s4_runtime_config_attestation_info{fingerprint="${fp}",state="OTHER",contract_version="v1"} 1\n`;
    fs.writeFileSync(metricsA, fpLine);
    fs.writeFileSync(metricsB, fpLine);
    return execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DI_S4_GATE6_OPERATOR_MODE: 'OPEN',
        DRY_RUN: '1',
        DI_S4F7AS_FIXTURE_MODE: '1',
        DI_S4F7J_FIXTURE_MODE: '1',
        DI_S4_GATE6_OPEN_ACK: 'YES',
        DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
        DI_S4_GATE6_OPERATOR_REASON: 'FIXTURE',
        DI_S4_GATE6_OPERATOR_ACTOR: 'FIXTURE',
        DI_S4_TINY_STAGING_REQUIRED_SHA: 'a'.repeat(40),
        DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: 'rel',
        DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: envSha,
        DI_S4F7J_FIXTURE_DEPLOYED_SHA: 'a'.repeat(40),
        DI_S4F7J_FIXTURE_RELEASE_DIR: WORKSPACE_ROOT,
        SYNQDRIVE_BACKEND_ENV: envFile,
        DI_S4F7AS_FIXTURE_METRICS_BODY_A: metricsA,
        DI_S4F7AS_FIXTURE_METRICS_BODY_B: metricsB,
        DI_S4_GATE6_EXPECTED_ATTESTATION_FINGERPRINT: fp,
        ...extra,
      },
    });
  }

  it('OPEN DRY_RUN executes guard path without live DB when fixture global is KILLED', () => {
    const out = runOpenDry({
      DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE: 'KILLED',
    });
    expect(out).toContain('OPEN_PREFLIGHT_OK=YES');
    expect(out).toContain('DRY_RUN_OPEN_COMPLETE=YES');
    expect(out).toContain('S4_ACTIVATION_OCCURRED=NO');
  });

  it('OPEN fails when fixture global is NOT_KILLED', () => {
    expect(() =>
      runOpenDry({
        DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE: 'NOT_KILLED',
      }),
    ).toThrow();
  });

  it('EMERGENCY_REKILL fixture mode skips OPEN preflight', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7as-rekill-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, buildFiveFlagOnEnv(), 'utf8');
    const out = execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DI_S4_GATE6_OPERATOR_MODE: 'EMERGENCY_REKILL',
        DI_S4F7AS_FIXTURE_MODE: '1',
        DI_S4_GATE6_EMERGENCY_REKILL_ACK: 'YES',
        DI_S4_GATE6_OPERATOR_REASON: 'FIXTURE_REKILL',
        DI_S4_GATE6_OPERATOR_ACTOR: 'FIXTURE',
        SYNQDRIVE_BACKEND_ENV: envFile,
      },
    });
    expect(out).toContain('EMERGENCY_REKILL_COMPLETE=YES');
  });
});
