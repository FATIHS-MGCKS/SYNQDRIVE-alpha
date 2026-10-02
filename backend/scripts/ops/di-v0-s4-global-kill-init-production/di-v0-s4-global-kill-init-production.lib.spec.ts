import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertDeployedInitializerPathPinned,
  assertPostWriteGlobalRow,
  evaluateInitializerExecutionAuthority,
  evaluateKillInitGuards,
  parseGlobalRowDbLines,
  parseInitializerOutcome,
  parseS4PersistenceDbLines,
  type KillInitGuardInput,
  type S4PersistenceCounts,
} from './di-v0-s4-global-kill-init-production.lib';

const WRAPPER = path.join(__dirname, '../di-v0-s4-initialize-global-kill-row-production.sh');
const BOOTSTRAP = path.resolve(__dirname, '../../../../.cursor/scripts/cloud-agent-s4-global-kill-init.sh');
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..');
const PRODUCTION_SHA = 'ee9588548845c8077aa0cba0684b06eac7c9d4d2';
const PRODUCTION_RELEASE = '20261002014651_v4994';
const PRODUCTION_ENV_SHA = '6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7';
const MAIN_SHA = '24a47282937546f14d7df12b8560d01ae9df801b';

const zeroPersistence: S4PersistenceCounts = {
  pipelineRegistry: 0,
  workItems: 0,
  activeWorkItems: 0,
  evidenceSnapshots: 0,
  shadowRuns: 0,
  shadowIntervals: 0,
};

function topologyOk(overrides: Partial<KillInitGuardInput['topology']> = {}) {
  return {
    replicaAHealthOk: true,
    replicaBHealthOk: true,
    replicaAProcessReleaseIdentityOk: true,
    replicaBProcessReleaseIdentityOk: true,
    steadyStateNoMixedReleaseIdentity: true,
    schedulerSingleLeader: true,
    nginxDualUpstream: true,
    ...overrides,
  };
}

function baseInput(overrides: Partial<KillInitGuardInput> = {}): KillInitGuardInput {
  return {
    operatorAck: 'YES',
    requiredSha: PRODUCTION_SHA,
    actualSha: PRODUCTION_SHA,
    requiredReleaseId: PRODUCTION_RELEASE,
    actualReleaseId: PRODUCTION_RELEASE,
    requiredEnvSha256: PRODUCTION_ENV_SHA,
    actualEnvSha256: PRODUCTION_ENV_SHA,
    expectedPrestate: 'MISSING',
    actualGlobalPrestate: 'MISSING',
    actor: 'operator@test',
    reason: 'S4F7F_TEST',
    envContent: 'DIMO_GLOBAL_BUDGET_ENABLED=true\n',
    envReadable: true,
    topology: topologyOk(),
    budget: {
      configFileState: 'EXPLICIT_ENABLED',
      replicaARuntime: 'ENABLED',
      replicaBRuntime: 'ENABLED',
      redisReachable: true,
    },
    persistence: zeroPersistence,
    expectedPersistence: zeroPersistence,
    dryRun: false,
    verifiedReleaseDir: `/opt/synqdrive/releases/${PRODUCTION_RELEASE}`,
    wrapperBackendRoot: BACKEND_ROOT,
    deployedInitializerExists: true,
    deployedInitializerTracked: true,
    deployedInitializerWorktreeClean: true,
    deployedKillImplementationTracked: true,
    deployedKillImplementationWorktreeClean: true,
    initializerSubstitutionRisk: false,
    mainCheckoutDiffersFromProduction: true,
    ...overrides,
  };
}

function runFixture(extraEnv: Record<string, string> = {}, dryRun = '1'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7f-'));
  const envFile = path.join(dir, 'backend.env');
  const envContent = extraEnv.S4F7F_FIXTURE_ENV_CONTENT ?? 'DIMO_GLOBAL_BUDGET_ENABLED=true\n';
  fs.writeFileSync(envFile, envContent, 'utf8');
  const envSha =
    extraEnv.DI_S4_KILL_INIT_REQUIRED_ENV_SHA256 ??
    createHash('sha256').update(envContent).digest('hex');
  const releaseDir = extraEnv.DI_S4F7F_FIXTURE_RELEASE_DIR || WORKSPACE_ROOT;
  const releaseId = extraEnv.DI_S4_KILL_INIT_REQUIRED_RELEASE_ID ?? path.basename(releaseDir);
  const requiredSha =
    extraEnv.DI_S4_KILL_INIT_REQUIRED_SHA ??
    (releaseDir === WORKSPACE_ROOT
      ? execFileSync('git', ['-C', WORKSPACE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      : PRODUCTION_SHA);
  return execFileSync('bash', [WRAPPER], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DI_S4F7F_FIXTURE_MODE: '1',
      DRY_RUN: dryRun,
      DI_S4_KILL_INIT_ACK: 'YES',
      DI_S4_KILL_INIT_REQUIRED_SHA: requiredSha,
      DI_S4_KILL_INIT_REQUIRED_RELEASE_ID: releaseId,
      DI_S4_KILL_INIT_REQUIRED_ENV_SHA256: envSha,
      DI_S4_KILL_INIT_EXPECTED_PRESTATE: 'MISSING',
      DI_S4_KILL_INIT_ACTOR: 'fixture-operator',
      DI_S4_KILL_INIT_REASON: 'S4F7F_FIXTURE',
      SYNQDRIVE_BACKEND_ENV: envFile,
      DI_S4F7F_FIXTURE_RELEASE_DIR: releaseDir,
      DI_S4F7F_FIXTURE_METRIC_A: '1',
      DI_S4F7F_FIXTURE_METRIC_B: '1',
      DI_S4F7F_FIXTURE_REDIS_REACHABLE: 'YES',
      ...extraEnv,
    },
  });
}

describe('DB read parsers (fail-closed)', () => {
  it('GLOBAL DB read failure shapes', () => {
    expect(parseGlobalRowDbLines([], false).ok).toBe(false);
    expect(parseGlobalRowDbLines(['x'], false).ok).toBe(false);
    expect(parseGlobalRowDbLines(['0', 'KILLED'], false).ok).toBe(false);
    expect(parseGlobalRowDbLines(['1', 'KILLED'], true).ok).toBe(false);
    expect(parseGlobalRowDbLines(['1', 'KILLED', 'r', 'a'], true).ok).toBe(true);
    expect(parseGlobalRowDbLines(['0', ''], false).ok).toBe(true);
  });

  it('S4 persistence requires exactly six integers', () => {
    expect(parseS4PersistenceDbLines(['0', '0', '0', '0', '0']).ok).toBe(false);
    expect(parseS4PersistenceDbLines(['0', '0', '0', '0', '0', '-1']).ok).toBe(false);
    expect(parseS4PersistenceDbLines(['0', '0', '0', '0', '0', '0']).ok).toBe(true);
  });
});

describe('di-v0-s4-global-kill-init-production.lib guards', () => {
  it('passes when all guards satisfied', () => {
    const r = evaluateKillInitGuards(baseInput());
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('ACK missing -> refuse', () => {
    const r = evaluateKillInitGuards(baseInput({ operatorAck: undefined }));
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('ACK_INVALID');
  });

  it('wrong ACK -> refuse', () => {
    const r = evaluateKillInitGuards(baseInput({ operatorAck: 'NO' }));
    expect(r.failures).toContain('ACK_INVALID');
  });

  it('SHA mismatch -> refuse', () => {
    const r = evaluateKillInitGuards(baseInput({ actualSha: 'deadbeef' }));
    expect(r.failures).toContain('SHA_MISMATCH');
  });

  it('release mismatch -> refuse', () => {
    const r = evaluateKillInitGuards(baseInput({ actualReleaseId: 'wrong_release' }));
    expect(r.failures).toContain('RELEASE_MISMATCH');
  });

  it('env hash mismatch -> refuse', () => {
    const r = evaluateKillInitGuards(baseInput({ actualEnvSha256: '0'.repeat(64) }));
    expect(r.failures).toContain('ENV_HASH_MISMATCH');
  });

  it('prestate mismatch MISSING vs KILLED -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({ expectedPrestate: 'MISSING', actualGlobalPrestate: 'KILLED' }),
    );
    expect(r.failures).toContain('PRESTATE_MISMATCH');
  });

  it('NOT_KILLED -> refuse', () => {
    const r = evaluateKillInitGuards(baseInput({ actualGlobalPrestate: 'NOT_KILLED' }));
    expect(r.failures).toContain('GLOBAL_NOT_KILLED');
  });

  it('S4 unsafe env -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({ envContent: 'DI_V0_S4_MASTER_ENABLED=true\nDIMO_GLOBAL_BUDGET_ENABLED=true\n' }),
    );
    expect(r.failures).toContain('S4_FLAGS_UNSAFE');
  });

  it('nonempty org allowlist -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({
        envContent: 'DIMO_GLOBAL_BUDGET_ENABLED=true\nDI_V0_S4_ORGANIZATION_ALLOWLIST=org-1\n',
      }),
    );
    expect(r.failures).toContain('ORG_ALLOWLIST_UNSAFE');
  });

  it('topology unsafe -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({ topology: topologyOk({ replicaAProcessReleaseIdentityOk: false }) }),
    );
    expect(r.failures).toContain('TOPOLOGY_UNSAFE');
  });

  it('budget config unsafe -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({ budget: { ...baseInput().budget, configFileState: 'EXPLICIT_DISABLED' } }),
    );
    expect(r.failures).toContain('BUDGET_CONFIG_UNSAFE');
  });

  it('redis unreachable -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({ budget: { ...baseInput().budget, redisReachable: false } }),
    );
    expect(r.failures).toContain('REDIS_UNREACHABLE');
  });

  it('persistence prestate mismatch -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({ persistence: { ...zeroPersistence, workItems: 3 } }),
    );
    expect(r.failures).toContain('PERSISTENCE_PRESTATE_MISMATCH');
  });

  it('dirty deployed initializer -> refuse', () => {
    const r = evaluateKillInitGuards(
      baseInput({ deployedInitializerWorktreeClean: false }),
    );
    expect(r.failures).toContain('DEPLOYED_RELEASE_FILE_DIRTY');
  });

  it('initializer substitution risk -> refuse', () => {
    const r = evaluateKillInitGuards(baseInput({ initializerSubstitutionRisk: true }));
    expect(r.failures).toContain('INITIALIZER_SUBSTITUTION_RISK');
  });
});

describe('main vs production release isolation', () => {
  const releaseDir = `/opt/synqdrive/releases/${PRODUCTION_RELEASE}`;
  const deployedInit = `${releaseDir}/backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts`;

  it('main newer than production does not imply substitution possible', () => {
    const authority = evaluateInitializerExecutionAuthority({
      verifiedReleaseDir: releaseDir,
      verifiedReleaseSha: PRODUCTION_SHA,
      wrapperBackendRoot: BACKEND_ROOT,
      mainCheckoutSha: MAIN_SHA,
      resolvedInitializerPath: deployedInit,
    });
    expect(authority.wrapperRequiresNewCodeDeployBeforeUse).toBe(false);
    expect(authority.deployedReleaseInitializerIsAuthority).toBe(true);
    expect(authority.mainCheckoutDiffersFromProduction).toBe(true);
    expect(authority.newerMainSubstitutionPossible).toBe(false);
    expect(authority.substitutionRisk).toBe(false);
  });

  it('path escape / wrong initializer path is substitution risk', () => {
    const pin = assertDeployedInitializerPathPinned({
      verifiedReleaseDir: releaseDir,
      resolvedInitializerPath: `${BACKEND_ROOT}/scripts/ops/di-v0-s4-initialize-global-kill-row.ts`,
    });
    expect(pin.ok).toBe(false);
    expect(pin.substitutionRisk).toBe(true);
  });
});

describe('di-v0-s4-initialize-global-kill-row-production.sh fixture', () => {
  it('dry run zero mutation', () => {
    const out = runFixture();
    expect(out).toContain('DRY_RUN_ZERO_MUTATION=PASS');
    expect(out).toContain('INITIALIZER_INVOKED=NO');
    expect(out).toContain('PRODUCTION_DB_WRITE_OCCURRED=NO');
    expect(out).toContain('DEPLOYED_RELEASE_INITIALIZER_IS_EXECUTION_AUTHORITY=YES');
    expect(out).toContain('POST_DEPLOY_UPTIME_HELPER_USED_FOR_STEADY_STATE=NO');
    expect(out).toContain('INTENDED_INITIALIZER=');
    expect(out).toContain('di-v0-s4-initialize-global-kill-row.ts');
  });

  it('GLOBAL DB read failure fails closed before initializer', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_GLOBAL_DB_READ_FAIL: '1' })).toThrow();
  });

  it('S4 persistence DB read failure fails closed', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_S4_PERSISTENCE_READ_FAIL: '1' })).toThrow();
  });

  it('malformed GLOBAL DB output fails closed', () => {
    expect(() =>
      runFixture({ DI_S4F7F_FIXTURE_MALFORMED_GLOBAL_DB_OUTPUT: 'not-a-number' }),
    ).toThrow();
  });

  it('malformed S4 persistence output fails closed', () => {
    expect(() =>
      runFixture({ DI_S4F7F_FIXTURE_MALFORMED_S4_PERSISTENCE_OUTPUT: '1\n2\n3' }),
    ).toThrow();
  });

  it('steady-state identity passes with fixture (simulated high uptime)', () => {
    const out = runFixture({
      DI_S4F7F_FIXTURE_REPLICA_A_PROCESS_RELEASE_IDENTITY: 'YES',
      DI_S4F7F_FIXTURE_REPLICA_B_PROCESS_RELEASE_IDENTITY: 'YES',
    });
    expect(out).toContain('REPLICA_A_PROCESS_RELEASE_IDENTITY=YES');
    expect(out).toContain('STEADY_STATE_NO_MIXED_RELEASE_IDENTITY=YES');
  });

  it('wrong process release identity fails', () => {
    expect(() =>
      runFixture({ DI_S4F7F_FIXTURE_REPLICA_A_PROCESS_RELEASE_IDENTITY: 'NO' }),
    ).toThrow();
  });

  it('metric auth failure fails closed', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_METRIC_AUTH_FAIL: '1' })).toThrow();
  });

  it('dirty deployed release files fail closed', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_DEPLOYED_DIRTY: '1' })).toThrow();
  });

  it('missing ACK fails closed', () => {
    expect(() => runFixture({ DI_S4_KILL_INIT_ACK: '' })).toThrow();
  });

  it('wrong SHA fails closed', () => {
    expect(() => runFixture({ DI_S4_KILL_INIT_REQUIRED_SHA: 'badsha' })).toThrow();
  });

  it('wrong release fails closed', () => {
    expect(() =>
      runFixture({ DI_S4_KILL_INIT_REQUIRED_RELEASE_ID: 'wrong_release_id' }),
    ).toThrow();
  });

  it('wrong env hash fails closed', () => {
    expect(() =>
      runFixture({ DI_S4_KILL_INIT_REQUIRED_ENV_SHA256: '0'.repeat(64) }),
    ).toThrow();
  });

  it('prestate mismatch fails closed', () => {
    expect(() =>
      runFixture({
        DI_S4F7F_FIXTURE_GLOBAL_ROW_COUNT: '1',
        DI_S4F7F_FIXTURE_GLOBAL_KILL_STATE: 'KILLED',
      }),
    ).toThrow();
  });

  it('NOT_KILLED refuses', () => {
    expect(() =>
      runFixture({
        DI_S4F7F_FIXTURE_GLOBAL_ROW_COUNT: '1',
        DI_S4F7F_FIXTURE_GLOBAL_KILL_STATE: 'NOT_KILLED',
      }),
    ).toThrow();
  });

  it('S4 master enabled refuses', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's4f7f-env-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(
      envFile,
      'DIMO_GLOBAL_BUDGET_ENABLED=true\nDI_V0_S4_MASTER_ENABLED=true\n',
      'utf8',
    );
    expect(() =>
      runFixture({
        SYNQDRIVE_BACKEND_ENV: envFile,
        DI_S4_KILL_INIT_REQUIRED_ENV_SHA256: createHash('sha256')
          .update(fs.readFileSync(envFile))
          .digest('hex'),
      }),
    ).toThrow();
  });

  it('topology failure refuses', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_REPLICA_A_HEALTH: 'FAIL' })).toThrow();
  });

  it('global budget runtime failure refuses', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_METRIC_A: '0' })).toThrow();
  });

  it('redis failure refuses', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_REDIS_REACHABLE: 'NO' })).toThrow();
  });

  it('persistence prestate failure refuses', () => {
    expect(() => runFixture({ DI_S4F7F_FIXTURE_S4_WORK_ITEMS: '2' })).toThrow();
  });

  it('injected INSERTED_KILLED path with DB-backed post-verify', () => {
    const out = runFixture(
      {
        DI_S4F7F_TEST_POST_GLOBAL_ROW_COUNT: '1',
        DI_S4F7F_TEST_POST_GLOBAL_KILL_STATE: 'KILLED',
        DI_S4F7F_TEST_INJECT_INITIALIZER_OUTCOME: 'INSERTED_KILLED',
      },
      '0',
    );
    expect(out).toContain('DI_V0_S4_GLOBAL_KILL_INIT_RESULT=INSERTED_KILLED');
    expect(out).toContain('POST_WRITE_VERIFY=PASS');
  });

  it('DB actor mismatch fails post-verify', () => {
    expect(() =>
      runFixture(
        {
          DI_S4F7F_TEST_INJECT_INITIALIZER_OUTCOME: 'INSERTED_KILLED',
          DI_S4F7F_TEST_POST_GLOBAL_REASON: 'S4F7F_FIXTURE',
          DI_S4F7F_TEST_POST_GLOBAL_ACTOR: 'wrong-actor',
        },
        '0',
      ),
    ).toThrow();
  });

  it('DB reason mismatch fails post-verify', () => {
    expect(() =>
      runFixture(
        {
          DI_S4F7F_TEST_INJECT_INITIALIZER_OUTCOME: 'INSERTED_KILLED',
          DI_S4F7F_TEST_POST_GLOBAL_REASON: 'wrong-reason',
          DI_S4F7F_TEST_POST_GLOBAL_ACTOR: 'fixture-operator',
        },
        '0',
      ),
    ).toThrow();
  });

  it('injected ALREADY_KILLED idempotent path', () => {
    const out = runFixture(
      {
        DI_S4_KILL_INIT_EXPECTED_PRESTATE: 'KILLED',
        DI_S4F7F_FIXTURE_GLOBAL_ROW_COUNT: '1',
        DI_S4F7F_FIXTURE_GLOBAL_KILL_STATE: 'KILLED',
        DI_S4F7F_FIXTURE_GLOBAL_REASON: 'historical-reason',
        DI_S4F7F_FIXTURE_GLOBAL_ACTOR: 'historical-actor',
        DI_S4F7F_TEST_INJECT_INITIALIZER_OUTCOME: 'ALREADY_KILLED',
      },
      '0',
    );
    expect(out).toContain('DI_V0_S4_GLOBAL_KILL_INIT_RESULT=ALREADY_KILLED');
    expect(out).toContain('PRODUCTION_DB_WRITE_OCCURRED=NO');
    expect(out).toContain('POST_WRITE_VERIFY=PASS');
  });
});

describe('initializer outcome parsing', () => {
  it('parses stdout', () => {
    expect(parseInitializerOutcome('DI_V0_S4_GLOBAL_KILL_INIT_RESULT=INSERTED_KILLED\n')).toBe(
      'INSERTED_KILLED',
    );
  });
});

describe('post-write verification helper', () => {
  it('validates INSERTED_KILLED metadata', () => {
    const post = assertPostWriteGlobalRow({
      globalRowCount: 1,
      killState: 'KILLED',
      reason: 'r',
      actor: 'a',
      requestedReason: 'r',
      requestedActor: 'a',
      initOutcome: 'INSERTED_KILLED',
    });
    expect(post.ok).toBe(true);
  });

  it('rejects actor mismatch on INSERTED_KILLED', () => {
    const post = assertPostWriteGlobalRow({
      globalRowCount: 1,
      killState: 'KILLED',
      reason: 'r',
      actor: 'a',
      requestedReason: 'r',
      requestedActor: 'b',
      initOutcome: 'INSERTED_KILLED',
    });
    expect(post.failures).toContain('ACTOR_MISMATCH');
  });
});

describe('cloud-agent S4 kill bootstrap script', () => {
  it('pins wrapper SHA separately and forbids deploy/restart/migrate', () => {
    const content = fs.readFileSync(BOOTSTRAP, 'utf8');
    expect(content).toContain('CLOUD_AGENT_S4_KILL_WRAPPER_SHA');
    expect(content).toContain('DI_S4_KILL_INIT_REQUIRED_SHA');
    expect(content).toContain('REMOTE_TOOL_SHA_VERIFIED=YES');
    expect(content).toContain('mktemp');
    expect(content).not.toMatch(/vps-deploy-release/);
    expect(content).not.toMatch(/pm2 restart/i);
    expect(content).not.toMatch(/prisma migrate/i);
    expect(content).toContain('DRY_RUN');
  });
});
