import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applyTinyStagingMutation,
  assertToolShaPin,
  computeSemanticEnvDiff,
  evaluateTinyStagingGuards,
  FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE,
  FROZEN_ORGANIZATION_ALLOWLIST,
  FROZEN_STAGING_VALUES,
  FROZEN_VEHICLE_ALLOWLIST,
  parseProcEnvironForProof,
  parseVehicleDbProofLines,
  proveReplicaStagingRuntime,
  TINY_STAGING_TARGET_KEYS,
  validateFrozenAllowlists,
  validateFrozenNotBefore,
  type TinyStagingGuardInput,
} from './di-v0-s4-tiny-staging-production.lib';

const WRAPPER = path.join(__dirname, '../di-v0-s4-stage-tiny-production.sh');
const BOOTSTRAP = path.resolve(__dirname, '../../../../.cursor/scripts/cloud-agent-s4-tiny-staging.sh');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..');
const PRODUCTION_SHA = 'ee9588548845c8077aa0cba0684b06eac7c9d4d2';
const PRODUCTION_RELEASE = '20261002014651_v4994';
const PRODUCTION_ENV_SHA = '6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7';

function writeFrozenProcEnvFile(): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7j-proc-')), 'environ');
  const frozenProcEnv =
    `DI_V0_S4_MASTER_ENABLED=false\0` +
    `DI_V0_S4_DISCOVERY_ENABLED=false\0` +
    `DI_V0_S4_WORKER_ENABLED=false\0` +
    `DI_V0_S4_POSITION_ENABLED=false\0` +
    `DI_V0_S4_R1_ENABLED=false\0` +
    `DI_V0_S4_NATIVE_ENABLED=false\0` +
    `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE}\0` +
    `DI_V0_S4_ORGANIZATION_ALLOWLIST=${FROZEN_ORGANIZATION_ALLOWLIST}\0` +
    `DI_V0_S4_VEHICLE_ALLOWLIST=${FROZEN_VEHICLE_ALLOWLIST}\0`;
  fs.writeFileSync(file, frozenProcEnv);
  return file;
}

function baseGuardInput(overrides: Partial<TinyStagingGuardInput> = {}): TinyStagingGuardInput {
  return {
    operatorAck: 'YES',
    requiredSha: PRODUCTION_SHA,
    actualSha: PRODUCTION_SHA,
    requiredReleaseId: PRODUCTION_RELEASE,
    actualReleaseId: PRODUCTION_RELEASE,
    requiredEnvSha256: PRODUCTION_ENV_SHA,
    actualEnvSha256: PRODUCTION_ENV_SHA,
    expectedGlobalState: 'KILLED',
    globalRowLines: ['1', 'KILLED'],
    s4PersistenceLines: ['0', '0', '0', '0', '0', '0'],
    envContent: 'DIMO_GLOBAL_BUDGET_ENABLED=true\n',
    envReadable: true,
    vehicleDbLines: ['1', FROZEN_ORGANIZATION_ALLOWLIST, 'ACTIVE', 'LTE_R1', '1'],
    topologyOk: true,
    budgetConfigExplicitEnabled: true,
    budgetRuntimeBothEnabled: true,
    redisReachable: true,
    dryRun: false,
    ...overrides,
  };
}

function runFixture(extraEnv: Record<string, string> = {}, dryRun = '1'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7j-'));
  const envFile = path.join(dir, 'backend.env');
  const envContent = extraEnv.S4F7J_FIXTURE_ENV_CONTENT ?? 'DIMO_GLOBAL_BUDGET_ENABLED=true\n';
  fs.writeFileSync(envFile, envContent, 'utf8');
  const envSha =
    extraEnv.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ??
    createHash('sha256').update(envContent).digest('hex');
  const releaseDir = extraEnv.DI_S4F7J_FIXTURE_RELEASE_DIR || WORKSPACE_ROOT;
  const releaseId = extraEnv.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID ?? path.basename(releaseDir);
  const requiredSha =
    extraEnv.DI_S4_TINY_STAGING_REQUIRED_SHA ??
    (releaseDir === WORKSPACE_ROOT
      ? execFileSync('git', ['-C', WORKSPACE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      : PRODUCTION_SHA);
  const procFile = writeFrozenProcEnvFile();
  return execFileSync('bash', [WRAPPER], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DI_S4F7J_FIXTURE_MODE: '1',
      DRY_RUN: dryRun,
      DI_S4_TINY_STAGING_ACK: 'YES',
      DI_S4_TINY_STAGING_REQUIRED_SHA: requiredSha,
      DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: releaseId,
      DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: envSha,
      DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
      SYNQDRIVE_BACKEND_ENV: envFile,
      DI_S4F7J_FIXTURE_RELEASE_DIR: releaseDir,
      DI_S4F7J_FIXTURE_DEPLOYED_SHA: requiredSha,
      DI_S4F7J_FIXTURE_PROC_ENV_FILE_A: procFile,
      DI_S4F7J_FIXTURE_PROC_ENV_FILE_B: procFile,
      ...extraEnv,
    },
  });
}

function runTestMode(extraEnv: Record<string, string> = {}, envContent = 'FOO=1\nDIMO_GLOBAL_BUDGET_ENABLED=true\n'): {
  out: string;
  envFile: string;
  beforeContent: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7j-test-'));
  const envFile = path.join(dir, 'backend.env');
  fs.writeFileSync(envFile, envContent, 'utf8');
  const beforeContent = fs.readFileSync(envFile, 'utf8');
  const repoRoot = path.resolve(__dirname, '../../../..');
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7j-st-'));
  const procFile = writeFrozenProcEnvFile();
  const out = execFileSync('bash', [WRAPPER], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DI_S4F7J_TEST_MODE: '1',
      DRY_RUN: '0',
      DI_S4_TINY_STAGING_ACK: 'YES',
      DI_S4_TINY_STAGING_REQUIRED_SHA: 'abc123',
      DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: path.basename(repoRoot),
      DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: createHash('sha256').update(beforeContent).digest('hex'),
      DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
      SYNQDRIVE_BACKEND_ENV: envFile,
      SYNQDRIVE_CURRENT_LINK: repoRoot,
      SYNQDRIVE_DEPLOY_STATE_DIR: stateDir,
      DI_S4F7J_FIXTURE_DEPLOYED_SHA: 'abc123',
      DI_S4F7J_FIXTURE_RELEASE_DIR: repoRoot,
      DI_S4F7J_FIXTURE_PROC_ENV_FILE_A: procFile,
      DI_S4F7J_FIXTURE_PROC_ENV_FILE_B: procFile,
      ...extraEnv,
    },
  });
  return { out, envFile, beforeContent };
}

function runTestModeExpectFail(
  extraEnv: Record<string, string> = {},
  envContent = 'FOO=1\nDIMO_GLOBAL_BUDGET_ENABLED=true\n',
): { envFile: string; beforeContent: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7j-fail-'));
  const envFile = path.join(dir, 'backend.env');
  fs.writeFileSync(envFile, envContent, 'utf8');
  const beforeContent = envContent;
  const repoRoot = path.resolve(__dirname, '../../../..');
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7j-st-fail-'));
  const procFile = writeFrozenProcEnvFile();
  expect(() =>
    execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DI_S4F7J_TEST_MODE: '1',
        DRY_RUN: '0',
        DI_S4_TINY_STAGING_ACK: 'YES',
        DI_S4_TINY_STAGING_REQUIRED_SHA: 'abc123',
        DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: path.basename(repoRoot),
        DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: createHash('sha256').update(beforeContent).digest('hex'),
        DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE: 'KILLED',
        SYNQDRIVE_BACKEND_ENV: envFile,
        SYNQDRIVE_CURRENT_LINK: repoRoot,
        SYNQDRIVE_DEPLOY_STATE_DIR: stateDir,
        DI_S4F7J_FIXTURE_DEPLOYED_SHA: 'abc123',
        DI_S4F7J_FIXTURE_RELEASE_DIR: repoRoot,
        DI_S4F7J_FIXTURE_PROC_ENV_FILE_A: procFile,
        DI_S4F7J_FIXTURE_PROC_ENV_FILE_B: procFile,
        ...extraEnv,
      },
    }),
  ).toThrow();
  return { envFile, beforeContent };
}

describe('frozen authority', () => {
  it('validates NOT_BEFORE and allowlists', () => {
    expect(validateFrozenNotBefore().ok).toBe(true);
    expect(validateFrozenAllowlists().ok).toBe(true);
    expect(validateFrozenAllowlists().orgParseCount).toBe(1);
    expect(validateFrozenAllowlists().vehicleParseCount).toBe(1);
  });
});

describe('evaluateTinyStagingGuards', () => {
  it('passes when satisfied', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput()).ok).toBe(true);
  });
  it('missing ACK fails', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput({ operatorAck: undefined })).failures).toContain('ACK_INVALID');
  });
  it('wrong SHA fails', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput({ actualSha: 'deadbeef' })).failures).toContain('SHA_MISMATCH');
  });
  it('wrong release fails', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput({ actualReleaseId: 'x' })).failures).toContain('RELEASE_MISMATCH');
  });
  it('wrong pre-env hash fails', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput({ actualEnvSha256: 'bad' })).failures).toContain('ENV_HASH_MISMATCH');
  });
  it('GLOBAL missing fails', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput({ globalRowLines: ['0', ''] })).failures).toContain(
      'GLOBAL_NOT_KILLED',
    );
  });
  it('GLOBAL NOT_KILLED fails', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput({ globalRowLines: ['1', 'NOT_KILLED'] })).failures).toContain(
      'GLOBAL_NOT_KILLED',
    );
  });
  it('GLOBAL DB read failure fails', () => {
    expect(evaluateTinyStagingGuards(baseGuardInput({ globalRowLines: ['x'] })).failures).toContain(
      'GLOBAL_PRESTATE_READ_FAILED',
    );
  });
  it('S4 enable flag on fails', () => {
    expect(
      evaluateTinyStagingGuards(
        baseGuardInput({ envContent: 'DI_V0_S4_MASTER_ENABLED=true\nDIMO_GLOBAL_BUDGET_ENABLED=true\n' }),
      ).failures,
    ).toContain('S4_FLAGS_UNSAFE');
  });
  it('wrong vehicle org fails', () => {
    expect(
      evaluateTinyStagingGuards(baseGuardInput({ vehicleDbLines: ['1', 'wrong-org', 'ACTIVE', 'LTE_R1', '1'] })).failures,
    ).toContain('VEHICLE_DB_PROOF_FAILED');
  });
  it('S4 persistence nonzero fails', () => {
    expect(
      evaluateTinyStagingGuards(baseGuardInput({ s4PersistenceLines: ['0', '1', '0', '0', '0', '0'] })).failures,
    ).toContain('S4_PERSISTENCE_NONZERO');
  });
});

describe('env mutation semantics', () => {
  it('inserts three keys and preserves unrelated', () => {
    const before = 'FOO=bar\nDIMO_GLOBAL_BUDGET_ENABLED=true\n';
    const { nextContent, targetKeyCountAfter } = applyTinyStagingMutation(before);
    expect(targetKeyCountAfter).toBe(3);
    expect(nextContent).toContain('FOO=bar');
    for (const key of TINY_STAGING_TARGET_KEYS) {
      expect(nextContent).toContain(`${key}=${FROZEN_STAGING_VALUES[key]}`);
    }
    const diff = computeSemanticEnvDiff(before, nextContent);
    expect(diff.ok).toBe(true);
    expect(diff.envChangedKeyCount).toBe(3);
    expect(diff.unexpectedChangedKeyCount).toBe(0);
  });
  it('duplicate target key fails', () => {
    const before = `DI_V0_S4_ORGANIZATION_ALLOWLIST=a\nDI_V0_S4_ORGANIZATION_ALLOWLIST=b\n`;
    expect(() => applyTinyStagingMutation(before)).toThrow(/duplicate_target_key/);
  });
  it('fourth changed key fails semantic diff', () => {
    const before = 'A=1\nB=2\n';
    const after = 'A=9\nB=2\nC=3\n';
    const diff = computeSemanticEnvDiff(before, after);
    expect(diff.ok).toBe(false);
    expect(diff.unexpectedChangedKeyCount).toBeGreaterThan(0);
  });
});

describe('runtime proc environ proof', () => {
  it('never includes secrets outside allowlist', () => {
    const raw =
      'SECRET_KEY=supersecret\0' +
      `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=${FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE}\0`;
    const map = parseProcEnvironForProof(raw);
    expect(map.has('SECRET_KEY')).toBe(false);
    expect(map.size).toBe(1);
  });
  it('proves exact staging values and flags off', () => {
    const map = parseProcEnvironForProof(fs.readFileSync(writeFrozenProcEnvFile(), 'utf8'));
    const proof = proveReplicaStagingRuntime(map);
    expect(proof.notBeforeExact).toBe(true);
    expect(proof.allS4EnableFlagsOff).toBe(true);
  });
});

describe('vehicle db proof parser', () => {
  it('accepts frozen tiny vehicle', () => {
    expect(
      parseVehicleDbProofLines(['1', FROZEN_ORGANIZATION_ALLOWLIST, 'ACTIVE', 'LTE_R1', '1']).ok,
    ).toBe(true);
  });
  it('rejects wildcard hardware', () => {
    expect(parseVehicleDbProofLines(['1', FROZEN_ORGANIZATION_ALLOWLIST, 'ACTIVE', '*', '1']).ok).toBe(false);
  });
});

describe('tool SHA pin', () => {
  it('blocks substitution', () => {
    expect(assertToolShaPin(PRODUCTION_SHA, PRODUCTION_SHA)).toBe(true);
    expect(assertToolShaPin('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', PRODUCTION_SHA)).toBe(false);
  });
});

describe('wrapper fixture dry-run', () => {
  it('dry-run zero mutation', () => {
    const out = runFixture();
    expect(out).toContain('DRY_RUN_ENV_MUTATION_COUNT=0');
    expect(out).toContain('PRODUCTION_ENV_MUTATION_OCCURRED=NO');
  });
  it('missing ACK fails', () => {
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: { ...process.env, DI_S4F7J_FIXTURE_MODE: '1', DRY_RUN: '1' },
      }),
    ).toThrow();
  });
});

describe('wrapper test mode mutation + recovery', () => {
  it('successful mutation and restarts', () => {
    const { out, envFile } = runTestMode();
    expect(out).toContain('WRAPPER_RESULT=SUCCESS');
    expect(out).toContain('RESTART_COUNT=2');
    const after = fs.readFileSync(envFile, 'utf8');
    expect(after).toContain(FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE);
  });
  it('backup failure prevents mutation', () => {
    expect(() => runTestMode({ DI_S4F7J_TEST_INJECT_BACKUP_FAIL: '1' })).toThrow();
  });
  it('mutation failure restores bytes', () => {
    const { envFile, beforeContent } = runTestModeExpectFail({ DI_S4F7J_TEST_INJECT_MUTATION_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(beforeContent);
  });
  it('restart A failure restores bytes', () => {
    const { envFile, beforeContent } = runTestModeExpectFail({ DI_S4F7J_TEST_INJECT_RESTART_A_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(beforeContent);
  });
  it('runtime A mismatch restores bytes', () => {
    const badProc = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4f7j-bad-')), 'environ');
    fs.writeFileSync(badProc, 'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=wrong\0');
    const { envFile, beforeContent } = runTestModeExpectFail({ DI_S4F7J_FIXTURE_PROC_ENV_FILE_A: badProc });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(beforeContent);
  });
  it('restart B failure restores bytes', () => {
    const { envFile, beforeContent } = runTestModeExpectFail({ DI_S4F7J_TEST_INJECT_RESTART_B_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(beforeContent);
  });
  it('scheduler failure restores bytes', () => {
    const { envFile, beforeContent } = runTestModeExpectFail({ DI_S4F7J_TEST_INJECT_SCHEDULER_FAIL: '1' });
    expect(fs.readFileSync(envFile, 'utf8')).toBe(beforeContent);
  });
  it('GLOBAL not killed fixture fails preflight', () => {
    expect(() =>
      runFixture({
        DI_S4F7J_FIXTURE_GLOBAL_ROW_COUNT: '1',
        DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE: 'NOT_KILLED',
      }),
    ).toThrow();
  });
  it('S4 persistence read failure fails', () => {
    expect(() => runFixture({ DI_S4F7J_FIXTURE_S4_PERSISTENCE_READ_FAIL: '1' })).toThrow();
  });
});

describe('cloud bootstrap script', () => {
  it('requires tool SHA pin', () => {
    const content = fs.readFileSync(BOOTSTRAP, 'utf8');
    expect(content).toContain('CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA');
    expect(content).toContain('TEMP_CHECKOUT_ONLY=YES');
    expect(content).toContain('di-v0-s4-stage-tiny-production.sh');
  });
});
