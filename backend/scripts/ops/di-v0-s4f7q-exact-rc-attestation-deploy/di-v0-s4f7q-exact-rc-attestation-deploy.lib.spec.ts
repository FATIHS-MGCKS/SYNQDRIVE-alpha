import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DI_S4F7Q_EXPECTED_PRESTATE_FINGERPRINT,
  DI_S4F7Q_FROZEN_EXPECTED_OLD_PRODUCTION_SHA,
  DI_S4F7Q_FROZEN_TARGET_RC_SHA,
  assertDiS4f7qPreDeployEnvGates,
  assertDiS4f7qShaPins,
  assertMetricsTokenNotInOutput,
  decideDiS4f7qRollingContinue,
  formatAttestationMetricLineForFixture,
  genericDeployGateEnabledFromEnv,
  simulateDiS4f7qRollingDeploy,
  verifyReplicaPrestateAttestationFromMetricsBody,
} from './di-v0-s4f7q-exact-rc-attestation-deploy.lib';

const CLI = path.join(__dirname, 'di-v0-s4f7q-exact-rc-attestation-deploy-cli.ts');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const REPLICA_LIB = path.join(BACKEND_ROOT, 'scripts/ops/lib/vps-production-replica.lib.sh');
const WRAPPER = path.join(BACKEND_ROOT, 'scripts/ops/di-v0-s4-exact-rc-attestation-deploy-production.sh');

function goodBody(): string {
  return formatAttestationMetricLineForFixture(DI_S4F7Q_EXPECTED_PRESTATE_FINGERPRINT, 'PRESTATE');
}

function runCli(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', CLI, ...args], {
      encoding: 'utf8',
      cwd: BACKEND_ROOT,
    });
    return { stdout, code: 0 };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { stdout: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
  }
}

function baseAfterA(overrides: Partial<Parameters<typeof decideDiS4f7qRollingContinue>[0]> = {}) {
  return {
    phase: 'AFTER_A' as const,
    replicaHealthy: true,
    replicaShaMatchesTarget: true,
    metricsBody: goodBody(),
    ...overrides,
  };
}

describe('di-v0-s4f7q-exact-rc-attestation-deploy.lib', () => {
  it('1 exact RC + A PRESTATE correct → B allowed', () => {
    const d = decideDiS4f7qRollingContinue(baseAfterA());
    expect(d.allowRestartB).toBe(true);
  });

  it('2 A metric missing → B blocked', () => {
    const d = decideDiS4f7qRollingContinue(baseAfterA({ metricsBody: null }));
    expect(d.allowRestartB).toBe(false);
    expect(d.reason).toBe('ATTESTATION_METRIC_MISSING');
  });

  it('3 A duplicate metric → B blocked', () => {
    const dup = goodBody() + goodBody();
    const d = decideDiS4f7qRollingContinue(baseAfterA({ metricsBody: dup }));
    expect(d.reason).toBe('ATTESTATION_METRIC_DUPLICATE');
  });

  it('4 A malformed fingerprint → B blocked', () => {
    const bad = formatAttestationMetricLineForFixture('not-hex', 'PRESTATE');
    const d = decideDiS4f7qRollingContinue(baseAfterA({ metricsBody: bad }));
    expect(d.reason).toBe('ATTESTATION_MALFORMED');
  });

  it('5 A OTHER state → B blocked', () => {
    const body = formatAttestationMetricLineForFixture(DI_S4F7Q_EXPECTED_PRESTATE_FINGERPRINT, 'OTHER');
    const d = decideDiS4f7qRollingContinue(baseAfterA({ metricsBody: body }));
    expect(d.reason).toBe('ATTESTATION_WRONG_STATE');
  });

  it('6 A STAGED state → B blocked', () => {
    const body = formatAttestationMetricLineForFixture(DI_S4F7Q_EXPECTED_PRESTATE_FINGERPRINT, 'STAGED');
    const d = decideDiS4f7qRollingContinue(baseAfterA({ metricsBody: body }));
    expect(d.reason).toBe('ATTESTATION_WRONG_STATE');
  });

  it('7 A wrong PRESTATE fingerprint → B blocked', () => {
    const body = formatAttestationMetricLineForFixture('a'.repeat(64), 'PRESTATE');
    const d = decideDiS4f7qRollingContinue(baseAfterA({ metricsBody: body }));
    expect(d.reason).toBe('ATTESTATION_WRONG_FINGERPRINT');
  });

  it('8 A auth failure → B blocked', () => {
    const d = decideDiS4f7qRollingContinue(
      baseAfterA({ metricsBody: null, metricsFetchError: 'METRICS_AUTH_FAILURE' }),
    );
    expect(d.reason).toBe('METRICS_AUTH_FAILURE');
  });

  it('9 A timeout → B blocked', () => {
    const d = decideDiS4f7qRollingContinue(
      baseAfterA({ metricsBody: null, metricsFetchError: 'METRICS_TIMEOUT' }),
    );
    expect(d.reason).toBe('METRICS_TIMEOUT');
  });

  it('10 A health failure → B blocked', () => {
    const d = decideDiS4f7qRollingContinue(baseAfterA({ replicaHealthy: false }));
    expect(d.reason).toBe('REPLICA_HEALTH_FAILURE');
  });

  it('11 A SHA mismatch → B blocked', () => {
    const d = decideDiS4f7qRollingContinue(baseAfterA({ replicaShaMatchesTarget: false }));
    expect(d.reason).toBe('REPLICA_SHA_MISMATCH');
  });

  it('12 A failure triggers A-only rollback', () => {
    const sim = simulateDiS4f7qRollingDeploy({
      preDeployAbort: null,
      afterA: baseAfterA({ replicaHealthy: false }),
    });
    expect(sim.replicaBRestartAttempted).toBe(false);
    expect(sim.rollbackScope).toBe('A_ONLY');
  });

  it('13 A passes, B PRESTATE correct → deploy continues', () => {
    const sim = simulateDiS4f7qRollingDeploy({
      preDeployAbort: null,
      afterA: baseAfterA(),
      afterB: { ...baseAfterA(), phase: 'AFTER_B' },
    });
    expect(sim.deployContinues).toBe(true);
  });

  it('14 B wrong fingerprint → full rollback', () => {
    const sim = simulateDiS4f7qRollingDeploy({
      preDeployAbort: null,
      afterA: baseAfterA(),
      afterB: baseAfterA({
        phase: 'AFTER_B',
        metricsBody: formatAttestationMetricLineForFixture('b'.repeat(64), 'PRESTATE'),
      }),
    });
    expect(sim.rollbackScope).toBe('FULL');
  });

  it('15 B health failure → full rollback', () => {
    const sim = simulateDiS4f7qRollingDeploy({
      preDeployAbort: null,
      afterA: baseAfterA(),
      afterB: baseAfterA({ phase: 'AFTER_B', replicaHealthy: false }),
    });
    expect(sim.rollbackScope).toBe('FULL');
  });

  it('16 wrong target RC SHA → abort before mutation', () => {
    expect(assertDiS4f7qShaPins({ targetSha: 'f'.repeat(40), observedOldProductionSha: DI_S4F7Q_FROZEN_EXPECTED_OLD_PRODUCTION_SHA })).toBe(
      'TARGET_SHA_MISMATCH',
    );
  });

  it('17 wrong old Production SHA → abort before mutation', () => {
    expect(assertDiS4f7qShaPins({ targetSha: DI_S4F7Q_FROZEN_TARGET_RC_SHA, observedOldProductionSha: 'a'.repeat(40) })).toBe(
      'OLD_PRODUCTION_SHA_MISMATCH',
    );
  });

  it('18 GLOBAL not KILLED → abort before mutation', () => {
    expect(assertDiS4f7qPreDeployEnvGates({ globalKillState: 'ARMED', env: {} })).toBe('GLOBAL_NOT_KILLED');
  });

  it('19 one S4 flag ON → abort before mutation', () => {
    expect(assertDiS4f7qPreDeployEnvGates({ globalKillState: 'KILLED', env: { DI_V0_S4_MASTER_ENABLED: 'true' } })).toBe(
      'S4_FLAG_ON',
    );
  });

  it('20 staging key present → abort before mutation', () => {
    expect(
      assertDiS4f7qPreDeployEnvGates({
        globalKillState: 'KILLED',
        env: { DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1' },
      }),
    ).toBe('STAGING_KEY_PRESENT');
  });

  it('21 generic/default deploy mode unaffected', () => {
    expect(genericDeployGateEnabledFromEnv(undefined)).toBe(false);
    expect(genericDeployGateEnabledFromEnv('0')).toBe(false);
    const lib = fs.readFileSync(REPLICA_LIB, 'utf8');
    expect(lib).toContain('SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE:-0');
    const s4f7q = fs.readFileSync(
      path.join(BACKEND_ROOT, 'scripts/ops/lib/di-v0-s4f7q-exact-rc-attestation-deploy.lib.sh'),
      'utf8',
    );
    expect(s4f7q).toContain('SYNQDRIVE_DEPLOY_CONTROLLER_ROOT');
    expect(s4f7q).not.toMatch(/s4f7q_cli_path\(\)[\s\S]*SYNQDRIVE_CURRENT_LINK/);
  });

  it('22 token never logged', () => {
    const token = 'secret-metrics-token-value';
    expect(assertMetricsTokenNotInOutput('port=3001 bytes=42', token)).toBe(true);
    expect(assertMetricsTokenNotInOutput(`leak ${token}`, token)).toBe(false);
  });

  it('23 verify body parser rejects missing metric (no provider)', () => {
    expect(verifyReplicaPrestateAttestationFromMetricsBody('noise').ok).toBe(false);
  });

  it('24 CLI sha-pins accepts frozen pair', () => {
    const { code, stdout } = runCli(['sha-pins', DI_S4F7Q_FROZEN_TARGET_RC_SHA, DI_S4F7Q_FROZEN_EXPECTED_OLD_PRODUCTION_SHA]);
    expect(code).toBe(0);
    expect(stdout).toContain('SHA_PINS_OK=YES');
  });

  it('25 operator wrapper requires OPERATOR_ACK', () => {
    expect(fs.existsSync(WRAPPER)).toBe(true);
    try {
      execFileSync('bash', [WRAPPER], { encoding: 'utf8', env: { ...process.env, OPERATOR_ACK: '' } });
      fail('expected exit');
    } catch (e: unknown) {
      const err = e as { status?: number };
      expect(err.status).toBe(1);
    }
  });

  it('predeploy-env fixture via temp file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7q-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'DIMO_GLOBAL_BUDGET_ENABLED=true\n', 'utf8');
    const { code } = runCli(['predeploy-env', 'KILLED', envFile]);
    expect(code).toBe(0);
  });
});
