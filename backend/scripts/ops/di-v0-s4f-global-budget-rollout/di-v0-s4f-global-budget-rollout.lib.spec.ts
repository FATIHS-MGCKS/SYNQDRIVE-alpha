import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applyGlobalBudgetEnabledMutation,
  assertPreflightConfigStateAllowed,
  assertS4ControlFlagsSafe,
  classifyConfigFileFromEnvContent,
  classifyLiveGlobalBudgetMetricFromPrometheusBody,
  classifyRuntimeBudgetFromLogSnippet,
  envMapFromFileContent,
  GLOBAL_BUDGET_ENABLED_METRIC_NAME,
  GLOBAL_BUDGET_RUNTIME_LOG_MARKER,
  idempotentConvergenceDecision,
  parseCanonicalRedisEnvFromMap,
  sha256Hex,
} from './di-v0-s4f-global-budget-rollout.lib';

const WRAPPER = path.join(__dirname, '../di-v0-s4f-enable-global-budget-production.sh');
const CLI = path.join(__dirname, 'di-v0-s4f-global-budget-rollout-cli.ts');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');

function runCli(args: string[], extraEnv: Record<string, string> = {}): string {
  return execFileSync(
    'npx',
    ['--yes', 'ts-node', '--transpile-only', CLI, ...args],
    {
      encoding: 'utf8',
      cwd: BACKEND_ROOT,
      env: { ...process.env, ...extraEnv },
    },
  );
}

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

  it('live metric classification', () => {
    const body = `# TYPE ${GLOBAL_BUDGET_ENABLED_METRIC_NAME} gauge\n${GLOBAL_BUDGET_ENABLED_METRIC_NAME} 1\n`;
    expect(classifyLiveGlobalBudgetMetricFromPrometheusBody(body)).toBe('ENABLED');
    expect(classifyLiveGlobalBudgetMetricFromPrometheusBody(`${GLOBAL_BUDGET_ENABLED_METRIC_NAME} 0`)).toBe('DISABLED');
    expect(classifyLiveGlobalBudgetMetricFromPrometheusBody(`${GLOBAL_BUDGET_ENABLED_METRIC_NAME} 1\n${GLOBAL_BUDGET_ENABLED_METRIC_NAME} 1`)).toBe('UNKNOWN');
    expect(classifyLiveGlobalBudgetMetricFromPrometheusBody('noise')).toBe('UNKNOWN');
  });

  it('stale log marker cannot satisfy live metric gate', () => {
    const log = classifyRuntimeBudgetFromLogSnippet(GLOBAL_BUDGET_RUNTIME_LOG_MARKER);
    const metric = classifyLiveGlobalBudgetMetricFromPrometheusBody('noise');
    expect(log).toBe('ENABLED');
    expect(metric).toBe('UNKNOWN');
  });

  it('canonical redis defaults', () => {
    const cfg = parseCanonicalRedisEnvFromMap({});
    expect(cfg.host).toBe('localhost');
    expect(cfg.port).toBe(6379);
    expect(cfg.db).toBe(0);
  });

  it('explicit false preflight abort', () => {
    expect(assertPreflightConfigStateAllowed('EXPLICIT_DISABLED').ok).toBe(false);
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
  });
});

describe('cli ownership and redis', () => {
  it('mutate preserves uid/gid/mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-own-'));
    const file = path.join(dir, 'backend.env');
    fs.writeFileSync(file, 'FOO=1\n', { mode: 0o640 });
    const st = fs.statSync(file);
    const out = runCli(['mutate', file]);
    expect(out).toContain('BACKEND_ENV_UID_PRESERVED=YES');
    expect(out).toContain('BACKEND_ENV_GID_PRESERVED=YES');
    expect(out).toContain('BACKEND_ENV_MODE_PRESERVED=YES');
    const after = fs.statSync(file);
    expect(after.uid).toBe(st.uid);
    expect(after.gid).toBe(st.gid);
    expect(after.mode).toBe(st.mode);
  });

  it('redis-ping fixture resolves canonical host/port without secret output', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-redis-'));
    const file = path.join(dir, 'backend.env');
    fs.writeFileSync(file, 'REDIS_HOST=redis.internal\nREDIS_PORT=6380\nREDIS_DB=2\nREDIS_PASSWORD=secret\n', 'utf8');
    const out = runCli(['redis-ping', file, '--fixture-ok']);
    expect(out).toContain('REDIS_CONFIG_SOURCE=CANONICAL_HOST_PORT_PASSWORD_DB');
    expect(out).toContain('REDIS_HOST_RESOLVED=redis.internal');
    expect(out).not.toContain('secret');
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
        DI_S4F4_FIXTURE_METRIC_A: '1',
        DI_S4F4_FIXTURE_METRIC_B: '1',
        ...extraEnv,
      },
    });
  }

  it('dry run zero mutation', () => {
    const out = runFixture();
    expect(out).toContain('DRY_RUN_ZERO_MUTATION=PASS');
    expect(out).toContain('RUNTIME_PROOF_AUTHORITY=live_prometheus_metric_per_replica');
  });

  it('stale enabled log does not select NO_OP when live metric unknown', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-stale-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'DIMO_GLOBAL_BUDGET_ENABLED=true\n', 'utf8');
    const out = execFileSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DI_S4F4_FIXTURE_MODE: '1',
        DRY_RUN: '1',
        DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
        DI_S4_REQUIRED_GIT_SHA: 'fixture-sha-abc',
        SYNQDRIVE_BACKEND_ENV: envFile,
        DI_S4F4_FIXTURE_DEPLOYED_SHA: 'fixture-sha-abc',
        DI_S4F4_FIXTURE_PM2_LOG_SNIPPET: GLOBAL_BUDGET_RUNTIME_LOG_MARKER,
        DI_S4F4_FIXTURE_METRIC_A: 'x',
        DI_S4F4_FIXTURE_METRIC_B: '1',
      },
    });
    expect(out).toContain('IDEMPOTENT_DECISION=RESTART_FOR_RUNTIME_PROOF');
    expect(out).not.toContain('IDEMPOTENT_ALREADY_CONVERGED=YES');
  });

  it('idempotent explicit enabled live metrics confirmed', () => {
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
        DI_S4F4_FIXTURE_METRIC_A: '1',
        DI_S4F4_FIXTURE_METRIC_B: '1',
      },
    });
    expect(out).toContain('IDEMPOTENT_ALREADY_CONVERGED=YES');
    expect(out).toContain('ENV_MUTATION_COUNT=0');
    expect(out).toContain('RESTART_COUNT=0');
    expect(out).toContain('PRODUCTION_ENV_MUTATED=NO');
    expect(out).toContain('PRODUCTION_RESTART_OCCURRED=NO');
  });
});

function runTestMode(
  extraEnv: Record<string, string> = {},
  envContent = 'FOO=1\n',
): { out: string; envFile: string; beforeContent: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-test-'));
  const envFile = path.join(dir, 'backend.env');
  fs.writeFileSync(envFile, envContent, 'utf8');
  const beforeContent = fs.readFileSync(envFile, 'utf8');
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
      DI_S4F4_FIXTURE_METRIC_A: '1',
      DI_S4F4_FIXTURE_METRIC_B: '1',
      ...extraEnv,
    },
  });
  return { out, envFile, beforeContent };
}

function expectRollbackBytes(envFile: string, beforeContent: string) {
  const after = fs.readFileSync(envFile, 'utf8');
  expect(after).toBe(beforeContent);
}

describe('di-v0-s4f-enable-global-budget-production.sh test mode', () => {
  it('missing key successful mutation path with restart count 2', () => {
    const { out, envFile } = runTestMode({}, 'FOO=keep\n');
    expect(out).toContain('MUTATION_VALIDATION=PASS');
    expect(out).toContain('GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED');
    expect(out).toContain('RESTART_COUNT=2');
    expect(out).toContain('PRODUCTION_ENV_MUTATED=YES');
    expect(out).toContain('PRODUCTION_RESTART_OCCURRED=YES');
    const after = fs.readFileSync(envFile, 'utf8');
    expect(after).toContain('DIMO_GLOBAL_BUDGET_ENABLED=true');
    expect(after).toContain('FOO=keep');
  });

  it('runtime metric proof failure restores env bytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-rt-'));
    const envFile = path.join(dir, 'backend.env');
    const beforeContent = 'FOO=1\n';
    fs.writeFileSync(envFile, beforeContent, 'utf8');
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DI_S4F4_TEST_MODE: '1',
          DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
          DI_S4_REQUIRED_GIT_SHA: 'abc123',
          DI_S4F4_FIXTURE_DEPLOYED_SHA: 'abc123',
          SYNQDRIVE_BACKEND_ENV: envFile,
          SYNQDRIVE_CURRENT_LINK: path.resolve(__dirname, '../../../..'),
          SYNQDRIVE_DEPLOY_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-st-')),
          DI_S4F4_TEST_INJECT_RUNTIME_PROOF_FAIL: '1',
        },
      }),
    ).toThrow();
    expectRollbackBytes(envFile, beforeContent);
  });

  it('restart A failure restores env bytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-ra-'));
    const envFile = path.join(dir, 'backend.env');
    const beforeContent = 'FOO=1\n';
    fs.writeFileSync(envFile, beforeContent, 'utf8');
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DI_S4F4_TEST_MODE: '1',
          DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
          DI_S4_REQUIRED_GIT_SHA: 'abc123',
          DI_S4F4_FIXTURE_DEPLOYED_SHA: 'abc123',
          SYNQDRIVE_BACKEND_ENV: envFile,
          SYNQDRIVE_CURRENT_LINK: path.resolve(__dirname, '../../../..'),
          SYNQDRIVE_DEPLOY_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-st-')),
          DI_S4F4_TEST_INJECT_RESTART_A_FAIL: '1',
        },
      }),
    ).toThrow();
    expectRollbackBytes(envFile, beforeContent);
  });

  it('health B failure restores env bytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-hb-'));
    const envFile = path.join(dir, 'backend.env');
    const beforeContent = 'FOO=1\n';
    fs.writeFileSync(envFile, beforeContent, 'utf8');
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DI_S4F4_TEST_MODE: '1',
          DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
          DI_S4_REQUIRED_GIT_SHA: 'abc123',
          DI_S4F4_FIXTURE_DEPLOYED_SHA: 'abc123',
          SYNQDRIVE_BACKEND_ENV: envFile,
          SYNQDRIVE_CURRENT_LINK: path.resolve(__dirname, '../../../..'),
          SYNQDRIVE_DEPLOY_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-st-')),
          DI_S4F4_TEST_INJECT_HEALTH_B_FAIL: '1',
        },
      }),
    ).toThrow();
    expectRollbackBytes(envFile, beforeContent);
  });

  it('scheduler failure restores env bytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-sch-'));
    const envFile = path.join(dir, 'backend.env');
    const beforeContent = 'FOO=1\n';
    fs.writeFileSync(envFile, beforeContent, 'utf8');
    expect(() =>
      execFileSync('bash', [WRAPPER], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DI_S4F4_TEST_MODE: '1',
          DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK: 'YES',
          DI_S4_REQUIRED_GIT_SHA: 'abc123',
          DI_S4F4_FIXTURE_DEPLOYED_SHA: 'abc123',
          SYNQDRIVE_BACKEND_ENV: envFile,
          SYNQDRIVE_CURRENT_LINK: path.resolve(__dirname, '../../../..'),
          SYNQDRIVE_DEPLOY_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 's4f4-st-')),
          DI_S4F4_TEST_INJECT_SCHEDULER_FAIL: '1',
        },
      }),
    ).toThrow();
    expectRollbackBytes(envFile, beforeContent);
  });
});
