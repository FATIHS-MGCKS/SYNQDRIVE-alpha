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
import { expectedVehicleAllowlistForWave } from './di-v0-s4-fleet-rollout.lib';
import {
  assertFiveFlagsOnInEnv,
  evaluateEmergencyRekillAck,
  evaluateGate6OpenGuards,
  evaluateGate6PreflightGuards,
  resolveGate6OpenIntent,
  type Gate6OpenGuardInput,
} from './di-v0-s4-gate6-open-rekill-production.lib';
import { evaluateGate6ProductionPathIsolation } from './di-v0-s4-gate6-live-authority.lib';
import {
  DI_S4_GATE6_DRY_RUN_AUTHORIZED_ENV,
  DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV,
  DI_S4_GATE6_TEST_OS_ROOT_ENV,
  DI_S4_GATE6_WRAPPER_ATTESTATION_ENV,
  DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE,
  DI_S4_GATE6_WRAPPER_ACTION_ENV,
} from './di-v0-s4-gate6-os-authorization.lib';
import { resolveCanonicalBackendEnvPathFromFilesystem } from './di-v0-s4-gate6-trusted-authority.lib';
import { readGuardProofBundleFile } from './di-v0-s4-gate6-guard-proof-bundle.lib';

const CLI = path.join(__dirname, 'di-v0-s4-gate6-open-rekill-production-cli.ts');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const WRAPPER = path.join(__dirname, '../di-v0-s4-gate6-open-rekill-production.sh');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');

const STAGED_NOT_BEFORE = '2026-10-09T07:03:05.861Z';

function normalizeEnvFileContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd();
}

function buildBaseStagedEnv(wave: 1 | 2 | 3 = 1): string {
  return [
    'DIMO_GLOBAL_BUDGET_ENABLED=true',
    `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${STAGED_NOT_BEFORE}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.organization}=${CANONICAL_TINY_ORGANIZATION_ID}`,
    `${DI_V0_S4_ENV_ALLOWLISTS.vehicle}=${expectedVehicleAllowlistForWave(wave)}`,
    ...Object.values(DI_V0_S4_ENV_FLAGS).map((k) => `${k}=false`),
  ].join('\n') + '\n';
}

function buildFiveFlagOnEnv(wave: 1 | 2 | 3 = 1): string {
  const staged = buildBaseStagedEnv(wave);
  const { nextContent } = applyFiveFlagMutation(staged);
  return nextContent;
}

function baseOpenInput(overrides: Partial<Gate6OpenGuardInput> = {}): Gate6OpenGuardInput {
  const envContent = buildFiveFlagOnEnv();
  const envSha = createHash('sha256').update(envContent).digest('hex');
  const fp = deriveFiveFlagAttestationFingerprint(envMapFromFileContent(envContent));
  return {
    gate6Ack: 'YES',
    gate6Authorized: 'YES',
    rolloutWave: 1,
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

function wrapperEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...process.env,
    [DI_S4_GATE6_WRAPPER_ATTESTATION_ENV]: DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE,
    ...extra,
  };
}

describe('S4F-7AS Gate-6 open guards (lib)', () => {
  it('passes with five flags on and GLOBAL KILLED prestate', () => {
    expect(evaluateGate6OpenGuards(baseOpenInput()).ok).toBe(true);
  });

  it('preflight passes without operator ack env', () => {
    expect(evaluateGate6PreflightGuards(baseOpenInput({ gate6Ack: undefined, gate6Authorized: undefined })).ok).toBe(true);
  });

  it('fails when GLOBAL prestate is NOT_KILLED', () => {
    const g = evaluateGate6OpenGuards(baseOpenInput({ globalRowLines: ['1', 'NOT_KILLED'] }));
    expect(g.failures).toContain('GLOBAL_PRESTATE_NOT_KILLED');
  });

  it('resolves wave promotion when GLOBAL NOT_KILLED and S4 persistence nonzero', () => {
    const input = baseOpenInput({
      globalRowLines: ['1', 'NOT_KILLED'],
      s4PersistenceLines: ['0', '1', '0', '0', '0', '0'],
    });
    expect(resolveGate6OpenIntent(input)).toBe('WAVE_PROMOTION');
    const g = evaluateGate6OpenGuards(input);
    expect(g.failures).not.toContain('GLOBAL_PRESTATE_NOT_KILLED');
    expect(g.failures).not.toContain('S4_PERSISTENCE_NONZERO');
  });

  it('fails on Gate-6 authorization missing for mutating guards', () => {
    const g = evaluateGate6OpenGuards(baseOpenInput({ gate6Authorized: undefined }));
    expect(g.failures).toContain('GATE6_AUTHORIZATION_INVALID');
  });

  it('assertFiveFlagsOnInEnv requires rollout wave 1 allowlists', () => {
    expect(assertFiveFlagsOnInEnv(buildFiveFlagOnEnv(), 1).ok).toBe(true);
    const bad = buildFiveFlagOnEnv().replace(expectedVehicleAllowlistForWave(1), CANONICAL_TINY_VEHICLE_ID + ',bad');
    expect(assertFiveFlagsOnInEnv(bad, 1).ok).toBe(false);
  });
});

describe('S4F-7AS CLI (simple Gate-6)', () => {
  it('live-open fails without OS authorization', () => {
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'live-open'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
        env: wrapperEnv({
          SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
          DI_S4_GATE6_OPEN_ACK: 'YES',
          DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
          DI_S4_GATE6_OPERATOR_REASON: 'r',
          DI_S4_GATE6_OPERATOR_ACTOR: 'a',
        }),
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      expect(`${e.stdout ?? ''}${e.stderr ?? ''}`).toContain('OS_AUTHORIZATION_FAILURES=');
    }
  });

  it('issue-dispatch-token path removed', () => {
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'issue-dispatch-token'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      expect(`${e.stdout ?? ''}${e.stderr ?? ''}`).toContain('DISPATCH_TOKEN_PATH_REMOVED=YES');
    }
  });

  it('dry-run-open requires wrapper dry authorization', () => {
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'dry-run-open'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
        env: wrapperEnv({
          [DI_S4_GATE6_WRAPPER_ACTION_ENV]: 'DRY_RUN',
          DI_S4_GATE6_OPEN_ACK: 'YES',
          DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
        }),
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      expect(`${e.stdout ?? ''}${e.stderr ?? ''}`).toContain('DRY_RUN_AUTHORIZATION_MISSING');
    }
  });

  it('live-open accepts test root when wrapper attestation present', () => {
    try {
      execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, 'live-open'], {
        encoding: 'utf8',
        cwd: BACKEND_ROOT,
        env: wrapperEnv({
          [DI_S4_GATE6_WRAPPER_ACTION_ENV]: 'LIVE_OPEN',
          [DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV]: CANONICAL_TINY_VEHICLE_ID,
          DI_S4_GATE6_ROLLOUT_WAVE: '1',
          DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM: '1',
          DI_S4F7AS_TEST_MODE: '1',
          [DI_S4_GATE6_TEST_OS_ROOT_ENV]: '1',
          SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
          DI_S4_GATE6_OPEN_ACK: 'YES',
          DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
          DI_S4_GATE6_OPERATOR_REASON: 'r',
          DI_S4_GATE6_OPERATOR_ACTOR: 'a',
        }),
      });
      throw new Error('expected exit');
    } catch (error: unknown) {
      const e = error as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      expect(combined).toContain('OS_AUTHORIZATION=VERIFIED');
      expect(combined).not.toContain('DISPATCH_TOKEN');
    }
  });
});

describe('S4F-7AS OS contract admin/root e2e (bash)', () => {
  const E2E = path.join(__dirname, '../di-v0-s4-gate6-os-contract-e2e.selftest.sh');

  it('admin private intent + root validation + execution integrity', () => {
    const out = execFileSync('bash', [E2E], { encoding: 'utf8' });
    expect(out).toContain('OS_CONTRACT_E2E_OK=YES');
    expect(out).toContain('ADMIN_INTENT_CREATE');
    expect(out).toMatch(/ROOT_INTENT_VALIDATION|OS_CONTRACT_E2E_SKIP_ROOT_VALIDATION/);
    expect(out).toContain('SCRIPT_INTEGRITY');
  });
});

describe('S4F-7AS guard proof bundle lifecycle (bash)', () => {
  const LIB = path.join(__dirname, '../lib/di-v0-s4-gate6-open-rekill-production.lib.sh');
  const JLIB = path.join(__dirname, '../lib/di-v0-s4-tiny-staging-production.lib.sh');
  const esc = (p: string) => p.replace(/'/g, "'\\''");

  function runGuardProofHarness(scriptBody: string): string {
    const opsDir = path.join(__dirname, '..');
    return execFileSync(
      'bash',
      [
        '-c',
        `
set -euo pipefail
export S4F7J_SCRIPT_DIR='${esc(opsDir)}'
export S4F7AS_SCRIPT_DIR='${esc(opsDir)}'
export S4F7F_SCRIPT_DIR='${esc(opsDir)}'
export DI_S4_GATE6_TEST_GUARD_PROOF_LIFECYCLE=YES
export DI_S4F7J_FIXTURE_MODE=1
export DI_S4F7F_FIXTURE_MODE=1
source '${esc(path.join(opsDir, 'vps-production-replica-topology.config.sh'))}'
source '${esc(path.join(opsDir, 'lib/vps-production-replica.lib.sh'))}'
source '${esc(path.join(opsDir, 'lib/di-v0-s4-global-kill-init-production.lib.sh'))}'
source '${esc(JLIB)}'
source '${esc(LIB)}'
${scriptBody}
`,
      ],
      { encoding: 'utf8' },
    );
  }

  const fixtureProofExports = `
export DI_S4F7AS_GLOBAL_ROW_LINES=$'1\\nKILLED'
export DI_S4F7AS_S4_PERSISTENCE_LINES=$'0\\n0\\n0\\n0\\n0\\n0'
export DI_S4F7AS_ENV_CONTENT='DI_V0_S4_MASTER_ENABLED=true\\nDI_V0_S4_DISCOVERY_ENABLED=true\\n'
export DI_S4F7AS_VEHICLE_DB_LINES=$'1\\n${CANONICAL_TINY_ORGANIZATION_ID}\\nACTIVE\\nLTE_R1\\n1\\n1'
export DI_S4F7AS_TOPOLOGY_OK=YES
export DI_S4F7AS_BUDGET_CONFIG_OK=YES
export DI_S4F7AS_BUDGET_RUNTIME_OK=YES
export DI_S4F7AS_REDIS_OK=YES
`;

  it('A: initial materialization contains all required proof keys', () => {
    const out = runGuardProofHarness(`
${fixtureProofExports}
s4f7as_materialize_guard_proof_bundle_once
s4f7as_guard_proof_bundle_has_required_keys "$S4F7AS_GUARD_PROOF_BUNDLE_FILE"
echo GUARD_PROOF_MATERIALIZE_ALL_KEYS=YES
`);
    expect(out).toContain('GUARD_PROOF_BUNDLE_MATERIALIZED=YES');
    expect(out).toContain('GUARD_PROOF_MATERIALIZE_ALL_KEYS=YES');
  });

  it('reuses one materialized bundle across two publish cycles (preflight→mutation sequence)', () => {
    const out = runGuardProofHarness(`
export DI_S4F7AS_ENV_CONTENT='DI_V0_S4_MASTER_ENABLED=true\\n'
export DI_S4F7AS_VEHICLE_DB_LINES=$'1\\n${CANONICAL_TINY_ORGANIZATION_ID}\\nACTIVE\\nLTE_R1\\n1\\n1'
export DI_S4F7AS_GLOBAL_ROW_LINES=$'1\\nKILLED'
export DI_S4F7AS_S4_PERSISTENCE_LINES=$'0\\n0\\n0\\n0\\n0\\n0'
export DI_S4F7AS_TOPOLOGY_OK=YES
export DI_S4F7AS_BUDGET_CONFIG_OK=YES
export DI_S4F7AS_BUDGET_RUNTIME_OK=YES
export DI_S4F7AS_REDIS_OK=YES
s4f7as_materialize_guard_proof_bundle_once
s4f7as_publish_guard_proof_bundle_for_cli
s4f7as_publish_guard_proof_bundle_for_cli
grep -q '^DI_S4F7AS_GLOBAL_ROW_LINES=' "$S4F7AS_GUARD_PROOF_BUNDLE_FILE"
echo GUARD_PROOF_LIFECYCLE_OK=YES
`);
    expect(out).toContain('GUARD_PROOF_BUNDLE_MATERIALIZED=YES');
    expect(out).toContain('GUARD_PROOF_LIFECYCLE_OK=YES');
  });

  it('B: materialize → refresh preserves env, vehicle, global and S4 proofs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7as-guard-'));
    const envFile = path.join(dir, 'backend.env');
    const envContent = buildFiveFlagOnEnv();
    fs.writeFileSync(envFile, envContent, 'utf8');
    const bundleOut = runGuardProofHarness(`
export BACKEND_ENV='${esc(envFile)}'
export SYNQDRIVE_BACKEND_ENV='${esc(envFile)}'
export TARGET_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_DEPLOYED_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_RELEASE_DIR='${esc(WORKSPACE_ROOT)}'
${fixtureProofExports}
s4f7as_materialize_guard_proof_bundle_once
for key in DI_S4F7AS_GLOBAL_ROW_LINES DI_S4F7AS_S4_PERSISTENCE_LINES DI_S4F7AS_ENV_CONTENT DI_S4F7AS_VEHICLE_DB_LINES DI_S4F7AS_TOPOLOGY_OK DI_S4F7AS_BUDGET_CONFIG_OK DI_S4F7AS_BUDGET_RUNTIME_OK DI_S4F7AS_REDIS_OK; do unset "$key" || true; done
s4f7as_refresh_guard_proof_security_gates_before_mutation
echo BUNDLE_PATH="$S4F7AS_GUARD_PROOF_BUNDLE_FILE"
`);
    expect(bundleOut).toContain('GUARD_PROOF_SECURITY_GATES_REFRESHED=YES');
    expect(bundleOut).toContain('GUARD_PROOF_ATOMIC_REFRESH=YES');
    const bundlePath = bundleOut.split('\n').find((l) => l.startsWith('BUNDLE_PATH='))?.slice('BUNDLE_PATH='.length);
    expect(bundlePath).toBeTruthy();
    const bundle = readGuardProofBundleFile(bundlePath!);
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(normalizeEnvFileContent(bundle.values.DI_S4F7AS_ENV_CONTENT)).toBe(
      normalizeEnvFileContent(fs.readFileSync(envFile, 'utf8')),
    );
    expect(bundle.values.DI_S4F7AS_VEHICLE_DB_LINES?.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(6);
    expect(bundle.values.DI_S4F7AS_GLOBAL_ROW_LINES).toContain('KILLED');
    expect(bundle.values.DI_S4F7AS_S4_PERSISTENCE_LINES?.split('\n').filter(Boolean).length).toBe(6);
  });

  it('C: vehicle DB query failure fails refresh closed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7as-guard-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, buildFiveFlagOnEnv(), 'utf8');
    expect(() =>
      runGuardProofHarness(`
export BACKEND_ENV='${esc(envFile)}'
export SYNQDRIVE_BACKEND_ENV='${esc(envFile)}'
export TARGET_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_DEPLOYED_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_RELEASE_DIR='${esc(WORKSPACE_ROOT)}'
${fixtureProofExports}
s4f7as_materialize_guard_proof_bundle_once
for key in DI_S4F7AS_ENV_CONTENT DI_S4F7AS_VEHICLE_DB_LINES; do unset "$key" || true; done
export DI_S4F7AS_TEST_GUARD_PROOF_VEHICLE_DB_FAIL=YES
s4f7as_refresh_guard_proof_security_gates_before_mutation
`),
    ).toThrow();
  });

  it('D: environment read failure fails refresh closed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7as-guard-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, buildFiveFlagOnEnv(), 'utf8');
    expect(() =>
      runGuardProofHarness(`
export BACKEND_ENV='${esc(envFile)}'
export SYNQDRIVE_BACKEND_ENV='${esc(envFile)}'
export TARGET_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_DEPLOYED_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_RELEASE_DIR='${esc(WORKSPACE_ROOT)}'
${fixtureProofExports}
s4f7as_materialize_guard_proof_bundle_once
for key in DI_S4F7AS_ENV_CONTENT DI_S4F7AS_VEHICLE_DB_LINES; do unset "$key" || true; done
export DI_S4F7AS_TEST_GUARD_PROOF_ENV_READ_FAIL=YES
s4f7as_refresh_guard_proof_security_gates_before_mutation
`),
    ).toThrow();
  });

  it('E: refresh does not replace env proof with empty content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7as-guard-'));
    const envFile = path.join(dir, 'backend.env');
    const envContent = buildFiveFlagOnEnv();
    fs.writeFileSync(envFile, envContent, 'utf8');
    const bundleOut = runGuardProofHarness(`
export BACKEND_ENV='${esc(envFile)}'
export SYNQDRIVE_BACKEND_ENV='${esc(envFile)}'
export TARGET_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_DEPLOYED_SHA='${'a'.repeat(40)}'
export DI_S4F7J_FIXTURE_RELEASE_DIR='${esc(WORKSPACE_ROOT)}'
${fixtureProofExports}
s4f7as_materialize_guard_proof_bundle_once
for key in DI_S4F7AS_ENV_CONTENT DI_S4F7AS_VEHICLE_DB_LINES; do unset "$key" || true; done
s4f7as_refresh_guard_proof_security_gates_before_mutation
echo BUNDLE_PATH="$S4F7AS_GUARD_PROOF_BUNDLE_FILE"
`);
    expect(bundleOut).toContain('GUARD_PROOF_SECURITY_GATES_REFRESHED=YES');
    const bundlePath = bundleOut.split('\n').find((l) => l.startsWith('BUNDLE_PATH='))?.slice('BUNDLE_PATH='.length);
    const bundle = readGuardProofBundleFile(bundlePath!);
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.values.DI_S4F7AS_ENV_CONTENT.length).toBeGreaterThan(0);
    expect(createHash('sha256').update(normalizeEnvFileContent(bundle.values.DI_S4F7AS_ENV_CONTENT)).digest('hex')).toBe(
      createHash('sha256').update(normalizeEnvFileContent(fs.readFileSync(envFile, 'utf8'))).digest('hex'),
    );
  });
});

describe('S4F-7AS wrapper (fixture)', () => {
  function runDry(extra: Record<string, string> = {}): string {
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
        DI_S4_GATE6_OPERATOR_MODE: 'DRY_RUN',
        DI_S4F7AS_FIXTURE_MODE: '1',
        DI_S4F7J_FIXTURE_MODE: '1',
        DI_S4_GATE6_OPEN_ACK: 'YES',
        DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
        DI_S4_GATE6_ROLLOUT_WAVE: '1',
        DI_S4_GATE6_ROLLOUT_WAVE_CONFIRM: '1',
        DI_S4_GATE6_PILOT_VEHICLE_CONFIRM: CANONICAL_TINY_VEHICLE_ID,
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

  it('F: DRY_RUN completes under fixture (preflight → refresh → dry-run-open)', () => {
    const out = runDry({ DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE: 'KILLED' });
    expect(out).toContain('OPEN_PREFLIGHT_OK=YES');
    expect(out).toContain('DRY_RUN_OPEN_COMPLETE=YES');
    expect(out).toContain('GLOBAL_DB_MUTATION_OCCURRED=NO');
  });

  it('G: LIVE_OPEN guard evaluation unchanged (preflight without ack)', () => {
    expect(evaluateGate6PreflightGuards(baseOpenInput({ gate6Ack: undefined, gate6Authorized: undefined })).ok).toBe(
      true,
    );
    expect(evaluateGate6OpenGuards(baseOpenInput()).ok).toBe(true);
    expect(evaluateEmergencyRekillAck('YES', 'fixture', 'fixture')).toBe(true);
  });

  it('EMERGENCY_REKILL fixture mode', () => {
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
