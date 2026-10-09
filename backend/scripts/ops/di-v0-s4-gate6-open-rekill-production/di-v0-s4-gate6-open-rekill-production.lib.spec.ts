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
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
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
  consumeGate6LiveOpenDispatchFromEnv,
  evaluateGate6ProductionPathIsolation,
  GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS,
} from './di-v0-s4-gate6-live-authority.lib';
import { isApprovalIdConsumed } from './di-v0-s4-gate6-approval-consumption.lib';
import {
  issueLiveOpenDispatchToken,
  DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV,
  DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV,
} from './di-v0-s4-gate6-dispatch-token.lib';
import { resolveCanonicalBackendEnvPathFromFilesystem } from './di-v0-s4-gate6-trusted-authority.lib';

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

  it('live-open dispatch requires one-shot token file and signing key sidecar (env digest not accepted)', () => {
    const tokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-dispatch-spec-'));
    const { filePath, signingKeyFilePath } = issueLiveOpenDispatchToken(tokenDir, {
      approvalId: 'apr-spec',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'r',
      actor: 'a',
    });
    const withoutToken = consumeGate6LiveOpenDispatchFromEnv({});
    expect(withoutToken.ok).toBe(false);
    const digestOnly = consumeGate6LiveOpenDispatchFromEnv({
      DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST: 'deadbeef',
      DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE: 'n1',
    });
    expect(digestOnly.ok).toBe(false);
    const withToken = consumeGate6LiveOpenDispatchFromEnv({
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: signingKeyFilePath,
    });
    expect(withToken.ok).toBe(true);
    fs.rmSync(tokenDir, { recursive: true, force: true });
  });

  it('forbidden fixture list blocks env-computed digest bypass keys on production path', () => {
    expect(GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS).toContain('DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST');
    expect(GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS).toContain('DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE');
  });

  it('resolveCanonicalBackendEnvPathFromFilesystem uses realpath', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-env-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'X=1\n', 'utf8');
    const link = path.join(dir, 'link.env');
    fs.symlinkSync(envFile, link);
    const resolved = resolveCanonicalBackendEnvPathFromFilesystem({ SYNQDRIVE_BACKEND_ENV: link });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.canonicalPath).toBe(fs.realpathSync(envFile));
    fs.rmSync(dir, { recursive: true, force: true });
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

  it('live-open-authorized fails without dispatch token on production canonical env', () => {
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

  it('issue-dispatch-token consumes approvalId once (Ed25519 v2 + register)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-issue-dispatch-'));
    const registerDir = path.join(dir, 'register');
    const issuanceDir = path.join(dir, 'issuance');
    const tokenDir = path.join(dir, 'tokens');
    const macKeyPath = path.join(dir, 'issuance-mac.key');
    fs.mkdirSync(registerDir);
    fs.mkdirSync(issuanceDir);
    fs.mkdirSync(tokenDir);
    fs.writeFileSync(macKeyPath, require('crypto').randomBytes(32).toString('hex'), 'utf8');
    const { generateGate6Ed25519FixtureKeyPair, signGate6HumanApprovalRecordV2 } = require('./di-v0-s4-gate6-human-approval-ed25519.lib');
    const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
    const publicPath = path.join(dir, 'public.pem');
    const approvalPath = path.join(dir, 'approval.json');
    const approvalCopyPath = path.join(dir, 'approval-copy.json');
    fs.writeFileSync(publicPath, publicKeyPem, 'utf8');
    const now = Date.now();
    const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
      approvalId: 'cli-dispatch-apr-01',
      actor: 'actor-a',
      reason: 'reason-r',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      validFromMs: now - 60_000,
      validUntilMs: now + 3600_000,
    });
    fs.writeFileSync(approvalPath, JSON.stringify(record), 'utf8');
    fs.writeFileSync(approvalCopyPath, JSON.stringify(record), 'utf8');
    const baseEnv = {
      ...process.env,
      DI_S4_GATE6_DISPATCH_TOKEN_DIR: tokenDir,
      DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR: registerDir,
      DI_S4_GATE6_DISPATCH_ISSUANCE_REGISTER_DIR: issuanceDir,
      DI_S4_GATE6_DISPATCH_ISSUANCE_MAC_KEY_FILE: macKeyPath,
      DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE: publicPath,
      DI_S4_GATE6_OPERATOR_REASON: 'reason-r',
      DI_S4_GATE6_OPERATOR_ACTOR: 'actor-a',
      DI_S4_TINY_STAGING_REQUIRED_SHA: 'a'.repeat(40),
      DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: 'rel',
      DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: 'b'.repeat(64),
    };
    const first = execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'issue-dispatch-token'], {
      encoding: 'utf8',
      cwd: BACKEND_ROOT,
      env: { ...baseEnv, DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath },
    });
    expect(first).toContain('APPROVAL_ID_CONSUMPTION_RESERVED=YES');
    expect(first).toContain('TRUSTED_DISPATCH_ISSUANCE_RECORDED=YES');
    expect(first).toContain('DISPATCH_TOKEN_ISSUED=YES');
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'issue-dispatch-token'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
        env: { ...baseEnv, DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalCopyPath },
      });
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      expect(combined).toContain('APPROVAL_CONSUMPTION_FAILURE=APPROVAL_ID_ALREADY_CONSUMED');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('issue-dispatch-token rejects self-signed approval with manipulated public key on production context', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-prod-bypass-'));
    const registerDir = path.join(dir, 'register');
    const tokenDir = path.join(dir, 'tokens');
    fs.mkdirSync(registerDir);
    fs.mkdirSync(tokenDir);
    const { generateGate6Ed25519FixtureKeyPair, signGate6HumanApprovalRecordV2 } = require('./di-v0-s4-gate6-human-approval-ed25519.lib');
    const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
    const attackerPublic = path.join(dir, 'attacker-public.pem');
    const approvalPath = path.join(dir, 'approval.json');
    fs.writeFileSync(attackerPublic, publicKeyPem, 'utf8');
    const now = Date.now();
    const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
      approvalId: 'prod-bypass-apr-01',
      actor: 'actor-a',
      reason: 'reason-r',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      validFromMs: now - 60_000,
      validUntilMs: now + 3600_000,
    });
    fs.writeFileSync(approvalPath, JSON.stringify(record), 'utf8');
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'issue-dispatch-token'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
        env: {
          ...process.env,
          SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
          DI_S4_GATE6_DISPATCH_TOKEN_DIR: tokenDir,
          DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR: registerDir,
          DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE: attackerPublic,
          DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
          DI_S4_GATE6_OPERATOR_REASON: 'reason-r',
          DI_S4_GATE6_OPERATOR_ACTOR: 'actor-a',
          DI_S4_TINY_STAGING_REQUIRED_SHA: 'a'.repeat(40),
          DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: 'rel',
          DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: 'b'.repeat(64),
        },
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      expect(combined).toMatch(/HUMAN_APPROVAL_PUBLIC_KEY_ENV_OVERRIDE_FORBIDDEN|PRODUCTION_TRUST_ANCHOR_FAILURES/);
      expect(combined).not.toContain('APPROVAL_ID_CONSUMPTION_RESERVED=YES');
      expect(combined).not.toContain('DISPATCH_TOKEN_ISSUED=YES');
    }
    expect(isApprovalIdConsumed(registerDir, 'prod-bypass-apr-01')).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('issue-dispatch-token is blocked without independent human approval file', () => {
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'issue-dispatch-token'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
        env: {
          ...process.env,
          DI_S4_GATE6_DISPATCH_TOKEN_DIR: os.tmpdir(),
          DI_S4_GATE6_OPEN_ACK: 'YES',
          DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
          DI_S4_GATE6_OPERATOR_REASON: 'r',
          DI_S4_GATE6_OPERATOR_ACTOR: 'a',
          DI_S4_TINY_STAGING_REQUIRED_SHA: 'a'.repeat(40),
          DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: 'rel',
          DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: 'b'.repeat(64),
        },
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      expect(combined).toMatch(/HUMAN_APPROVAL|INDEPENDENT_APPROVAL_AUTHORITY=BLOCKED/);
    }
  });

  it('live-open-authorized rejects fixture bypass before DB mutation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-live-fixture-bypass-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'X=1\n', 'utf8');
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'live-open-authorized'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
        env: {
          ...process.env,
          DI_S4F7AS_FIXTURE_MODE: '1',
          SYNQDRIVE_BACKEND_ENV: envFile,
          DI_S4_GATE6_OPEN_ACK: 'YES',
          DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
          DI_S4F7AS_TOPOLOGY_OK: 'YES',
          DI_S4F7AS_BUDGET_CONFIG_OK: 'YES',
          DI_S4F7AS_BUDGET_RUNTIME_OK: 'YES',
          DI_S4F7AS_REDIS_OK: 'YES',
          DI_S4_GATE6_OPERATOR_REASON: 'fixture-bypass',
          DI_S4_GATE6_OPERATOR_ACTOR: 'fixture',
        },
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      expect(combined).toContain('PRODUCTION_LIVE_OPEN_BOUNDARY_FAILURES=');
      expect(combined).not.toContain('GLOBAL_DB_MUTATION_OCCURRED=YES');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('live-open-authorized rejects self-issued digest env without token file', () => {
    try {
      execFileSync(
        'npx',
        ['--yes', 'ts-node', '--transpile-only', CLI, 'live-open-authorized'],
        {
          encoding: 'utf8',
          cwd: BACKEND_ROOT,
          env: {
            ...process.env,
            DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST: 'a'.repeat(64),
            DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE: 'self-issued',
            DI_S4_GATE6_OPEN_ACK: 'YES',
            DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
          },
        },
      );
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string; status?: number };
      const combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      expect(combined).toMatch(/DISPATCH_TOKEN_FILE_MISSING|PRODUCTION_LIVE_OPEN_BOUNDARY_FAILURES/);
    }
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
