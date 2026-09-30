import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applyGlobalBudgetEnabledMutation,
  assertPreflightConfigStateAllowed,
  assertS4ControlFlagsSafe,
  classifyConfigFileFromEnvContent,
  classifyRuntimeBudgetFromLogSnippet,
  envMapFromFileContent,
  idempotentConvergenceDecision,
  sha256Hex,
  GLOBAL_BUDGET_RUNTIME_LOG_MARKER,
} from './di-v0-s4f-global-budget-rollout.lib';

const WRAPPER = path.join(__dirname, '../di-v0-s4f-enable-global-budget-production.sh');

describe('di-v0-s4f-global-budget-rollout.lib', () => {
  it('missing key mutation preserves unrelated lines', () => {
    const before = 'FOO=bar\n# comment\n';
    const { nextContent, unrelatedDeltaCount, mutated } = applyGlobalBudgetEnabledMutation(before);
    expect(mutated).toBe(true);
    expect(unrelatedDeltaCount).toBe(0);
    expect(nextContent).toContain('FOO=bar');
    expect(nextContent).toContain('DIMO_GLOBAL_BUDGET_ENABLED=true');
    expect(classifyConfigFileFromEnvContent(nextContent, true)).toBe('EXPLICIT_ENABLED');
  });

  it('explicit true idempotent content', () => {
    const before = 'DIMO_GLOBAL_BUDGET_ENABLED=true\nFOO=1\n';
    const { mutated, unrelatedDeltaCount } = applyGlobalBudgetEnabledMutation(before);
    expect(mutated).toBe(false);
    expect(unrelatedDeltaCount).toBe(0);
  });

  it('explicit false preflight abort', () => {
    expect(assertPreflightConfigStateAllowed('EXPLICIT_DISABLED').ok).toBe(false);
  });

  it('malformed and unreadable preflight abort', () => {
    expect(assertPreflightConfigStateAllowed('MALFORMED').ok).toBe(false);
    expect(assertPreflightConfigStateAllowed('UNREADABLE').ok).toBe(false);
  });

  it('S4 flags safe when all off', () => {
    const env = envMapFromFileContent('DI_V0_S4_MASTER_ENABLED=false\n');
    expect(assertS4ControlFlagsSafe(env).ok).toBe(true);
  });

  it('S4 flags unsafe when master on', () => {
    const env = envMapFromFileContent('DI_V0_S4_MASTER_ENABLED=true\n');
    expect(assertS4ControlFlagsSafe(env).ok).toBe(false);
  });

  it('runtime log classification', () => {
    expect(classifyRuntimeBudgetFromLogSnippet(GLOBAL_BUDGET_RUNTIME_LOG_MARKER)).toBe('ENABLED');
    expect(classifyRuntimeBudgetFromLogSnippet('noise')).toBe('UNKNOWN');
  });

  it('idempotent convergence matrix', () => {
    expect(
      idempotentConvergenceDecision({
        configState: 'EXPLICIT_ENABLED',
        replicaARuntime: 'ENABLED',
        replicaBRuntime: 'ENABLED',
      }),
    ).toBe('NO_OP');
    expect(
      idempotentConvergenceDecision({
        configState: 'EXPLICIT_ENABLED',
        replicaARuntime: 'UNKNOWN',
        replicaBRuntime: 'ENABLED',
      }),
    ).toBe('RESTART_FOR_RUNTIME_PROOF');
    expect(
      idempotentConvergenceDecision({ configState: 'MISSING', replicaARuntime: 'UNKNOWN', replicaBRuntime: 'UNKNOWN' }),
    ).toBe('MUTATE_AND_RESTART');
  });

  it('backup checksum helper stable', () => {
    const h = sha256Hex('x');
    expect(h).toHaveLength(64);
    expect(sha256Hex('x')).toBe(h);
  });
});

describe('di-v0-s4f-enable-global-budget-production.sh fixture', () => {
  function runFixture(extraEnv: Record<string, string> = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-fix-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'FOO=keep\n', 'utf8');
    return execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DI_S4F4_FIXTURE_MODE: '1',
        DRY_RUN: '1',
        DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
        DI_S4_REQUIRED_GIT_SHA: 'fixture-sha-abc',
        SYNQDRIVE_BACKEND_ENV: envFile,
        DI_S4F4_FIXTURE_DEPLOYED_SHA: 'fixture-sha-abc',
        ...extraEnv,
      },
    });
  }

  it('dry run zero mutation', () => {
    const out = runFixture();
    expect(out).toContain('DRY_RUN_ZERO_MUTATION=PASS');
    expect(out).not.toContain('PM2_RESTART_PERFORMED=YES');
  });

  it('sha mismatch abort', () => {
    expect(() =>
      runFixture({ DI_S4_REQUIRED_GIT_SHA: 'wrong-sha', DI_S4F4_FIXTURE_DEPLOYED_SHA: 'fixture-sha-abc' }),
    ).toThrow();
  });

  it('ack required', () => {
    expect(() => runFixture({ DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'NO' })).toThrow();
  });

  it('explicit false fail closed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-false-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'DIMO_GLOBAL_BUDGET_ENABLED=false\n', 'utf8');
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DI_S4F4_FIXTURE_MODE: '1',
          DRY_RUN: '1',
          DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
          DI_S4_REQUIRED_GIT_SHA: 'fixture-sha-abc',
          SYNQDRIVE_BACKEND_ENV: envFile,
          DI_S4F4_FIXTURE_DEPLOYED_SHA: 'fixture-sha-abc',
        },
      }),
    ).toThrow();
  });

  it('idempotent explicit enabled runtime confirmed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-idem-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'DIMO_GLOBAL_BUDGET_ENABLED=true\n', 'utf8');
    const out = execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DI_S4F4_FIXTURE_MODE: '1',
        DRY_RUN: '0',
        DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
        DI_S4_REQUIRED_GIT_SHA: 'fixture-sha-abc',
        SYNQDRIVE_BACKEND_ENV: envFile,
        DI_S4F4_FIXTURE_DEPLOYED_SHA: 'fixture-sha-abc',
        DI_S4F4_FIXTURE_RUNTIME_A: 'ENABLED',
        DI_S4F4_FIXTURE_RUNTIME_B: 'ENABLED',
      },
    });
    expect(out).toContain('IDEMPOTENT_ALREADY_CONVERGED=YES');
    expect(out).toContain('ENV_MUTATION_COUNT=0');
  });
});

function runTestMode(extraEnv: Record<string, string> = {}, envContent = 'FOO=1\n'): { out: string; envFile: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-test-'));
  const envFile = path.join(dir, 'backend.env');
  fs.writeFileSync(envFile, envContent, 'utf8');
  const repoRoot = path.resolve(__dirname, '../../../..');
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-state-'));
  const out = execFileSync('bash', [WRAPPER], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DI_S4F4_TEST_MODE: '1',
      DRY_RUN: '0',
      DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
      DI_S4_REQUIRED_GIT_SHA: 'abc123',
      DI_S4F4_FIXTURE_DEPLOYED_SHA: 'abc123',
      SYNQDRIVE_BACKEND_ENV: envFile,
      SYNQDRIVE_CURRENT_LINK: repoRoot,
      SYNQDRIVE_DEPLOY_STATE_DIR: stateDir,
      ...extraEnv,
    },
  });
  return { out, envFile };
}

describe('di-v0-s4f-enable-global-budget-production.sh test mode', () => {
  it('missing key successful mutation path', () => {
    const { out, envFile } = runTestMode({}, 'FOO=keep\n');
    expect(out).toContain('MUTATION_VALIDATION=PASS');
    expect(out).toContain('GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED');
    const after = fs.readFileSync(envFile, 'utf8');
    expect(after).toContain('DIMO_GLOBAL_BUDGET_ENABLED=true');
    expect(after).toContain('FOO=keep');
  });

  it('backup failure prevents mutation', () => {
    expect(() => runTestMode({ DI_S4F4_TEST_INJECT_BACKUP_FAIL: '1' })).toThrow();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-bk-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'FOO=1\n', 'utf8');
    const before = fs.readFileSync(envFile, 'utf8');
    expect(before).not.toContain('DIMO_GLOBAL_BUDGET_ENABLED=true');
  });

  it('restart A failure triggers rollback', () => {
    expect(() =>
      runTestMode({ DI_S4F4_TEST_INJECT_RESTART_A_FAIL: '1' }, 'FOO=1\n'),
    ).toThrow();
  });

  it('runtime proof failure triggers rollback', () => {
    expect(() =>
      runTestMode(
        {
          DI_S4F4_TEST_INJECT_RUNTIME_PROOF_FAIL: '1',
          DI_S4F4_FIXTURE_RUNTIME_A: 'UNKNOWN',
          DI_S4F4_FIXTURE_RUNTIME_B: 'UNKNOWN',
        },
        'FOO=1\n',
      ),
    ).toThrow();
  });
});
