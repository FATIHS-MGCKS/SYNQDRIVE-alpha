#!/usr/bin/env ts-node
/**
 * CLI helpers for S4F-7F Production GLOBAL kill initializer wrapper (no arbitrary DB writes).
 */
import * as fs from 'fs';
import * as http from 'http';
import Redis from 'ioredis';
import {
  assertPostWriteGlobalRow,
  classifyBudgetConfigFromEnvContent,
  classifyGlobalControlPrestate,
  classifyLiveMetricBody,
  classifyNotBeforeState,
  evaluateKillInitGuards,
  parseExpectedPersistenceFromEnv,
  parseInitializerOutcome,
  sha256FileContent,
  type BudgetSnapshot,
  type GlobalControlPrestate,
  type KillInitGuardInput,
  type S4PersistenceCounts,
  type TopologySnapshot,
} from './di-v0-s4-global-kill-init-production.lib';
import {
  envMapFromFileContent,
  parseCanonicalRedisEnvFromMap,
} from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';

function readFile(pathname: string): string {
  return fs.readFileSync(pathname, 'utf8');
}

function fetchMetrics(port: string, pathSuffix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port: Number(port), path: pathSuffix, timeout: 5000 },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve(body));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function cmdRedisPing(envFile: string, fixtureOk: boolean): Promise<void> {
  const map = envMapFromFileContent(readFile(envFile));
  const cfg = parseCanonicalRedisEnvFromMap(map);
  if (fixtureOk) {
    console.log('REDIS_REACHABLE=YES');
    console.log('REDIS_CONFIG_SOURCE=FIXTURE');
    return;
  }
  const client = new Redis({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    db: cfg.db,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    console.log(`REDIS_REACHABLE=${pong === 'PONG' ? 'YES' : 'NO'}`);
  } catch {
    console.log('REDIS_REACHABLE=NO');
    process.exitCode = 1;
  } finally {
    await client.quit().catch(() => undefined);
  }
}

function cmdLiveMetric(envFile: string, port: string): void {
  const metricsPath = process.env.DI_S4_METRICS_PATH || '/api/v1/metrics';
  fetchMetrics(port, metricsPath)
    .then((body) => {
      const proof = classifyLiveMetricBody(body);
      console.log(`LIVE_GLOBAL_BUDGET_METRIC=${proof}`);
      if (proof === 'UNKNOWN') process.exitCode = 1;
    })
    .catch(() => {
      console.log('LIVE_GLOBAL_BUDGET_METRIC=UNKNOWN');
      process.exitCode = 1;
    });
}

function cmdEnvSha256(envFile: string): void {
  const content = readFile(envFile);
  console.log(`BACKEND_ENV_SHA256=${sha256FileContent(content)}`);
}

function cmdNotBefore(envFile: string): void {
  const map = envMapFromFileContent(readFile(envFile));
  console.log(`NOT_BEFORE_CLASSIFICATION=${classifyNotBeforeState(map)}`);
}

function buildGuardInputFromEnv(): KillInitGuardInput {
  const envFile = process.env.SYNQDRIVE_BACKEND_ENV || '';
  let content = '';
  let readable = false;
  try {
    content = readFile(envFile);
    readable = true;
  } catch {
    readable = false;
  }

  const globalCount = Number.parseInt(process.env.DI_S4F7F_GLOBAL_ROW_COUNT || '0', 10);
  const killState = process.env.DI_S4F7F_GLOBAL_KILL_STATE;
  const prestate: GlobalControlPrestate = classifyGlobalControlPrestate(
    globalCount,
    killState != null && killState !== '' ? [killState] : [],
  );

  const persistence: S4PersistenceCounts = {
    pipelineRegistry: Number(process.env.DI_S4F7F_S4_PIPELINE_REGISTRY_ROWS || '0'),
    workItems: Number(process.env.DI_S4F7F_S4_WORK_ITEM_ROWS || '0'),
    activeWorkItems: Number(process.env.DI_S4F7F_S4_ACTIVE_WORK_ITEM_ROWS || '0'),
    evidenceSnapshots: Number(process.env.DI_S4F7F_S4_EVIDENCE_SNAPSHOT_ROWS || '0'),
    shadowRuns: Number(process.env.DI_S4F7F_S4_SHADOW_RUN_ROWS || '0'),
    shadowIntervals: Number(process.env.DI_S4F7F_S4_SHADOW_INTERVAL_ROWS || '0'),
  };

  const topology: TopologySnapshot = {
    replicaAHealthOk: process.env.DI_S4F7F_REPLICA_A_HEALTH === 'OK',
    replicaBHealthOk: process.env.DI_S4F7F_REPLICA_B_HEALTH === 'OK',
    noMixedSha: process.env.DI_S4F7F_NO_MIXED_SHA === 'YES',
    schedulerSingleLeader: process.env.DI_S4F7F_SCHEDULER_SINGLE_LEADER === 'YES',
    nginxDualUpstream: process.env.DI_S4F7F_NGINX_DUAL_UPSTREAM === 'YES',
  };

  const budget: BudgetSnapshot = {
    configFileState: classifyBudgetConfigFromEnvContent(content, readable),
    replicaARuntime: (process.env.DI_S4F7F_REPLICA_A_BUDGET_RUNTIME || 'UNKNOWN') as BudgetSnapshot['replicaARuntime'],
    replicaBRuntime: (process.env.DI_S4F7F_REPLICA_B_BUDGET_RUNTIME || 'UNKNOWN') as BudgetSnapshot['replicaBRuntime'],
    redisReachable: process.env.DI_S4F7F_REDIS_REACHABLE === 'YES',
  };

  const verifiedReleaseDir = process.env.DI_S4F7F_VERIFIED_RELEASE_DIR || '';
  const wrapperBackendRoot = process.env.DI_S4F7F_WRAPPER_BACKEND_ROOT || '';
  const initPath = process.env.DI_S4F7F_DEPLOYED_INITIALIZER_PATH || '';
  const initExists = initPath !== '' && fs.existsSync(initPath);

  return {
    operatorAck: process.env.DI_S4_KILL_INIT_ACK,
    requiredSha: process.env.DI_S4_KILL_INIT_REQUIRED_SHA,
    actualSha: process.env.DI_S4F7F_ACTUAL_SHA,
    requiredReleaseId: process.env.DI_S4_KILL_INIT_REQUIRED_RELEASE_ID,
    actualReleaseId: process.env.DI_S4F7F_ACTUAL_RELEASE_ID,
    requiredEnvSha256: process.env.DI_S4_KILL_INIT_REQUIRED_ENV_SHA256,
    actualEnvSha256: process.env.DI_S4F7F_ACTUAL_ENV_SHA256,
    expectedPrestate: process.env.DI_S4_KILL_INIT_EXPECTED_PRESTATE,
    actualGlobalPrestate: prestate,
    actor: process.env.DI_S4_KILL_INIT_ACTOR,
    reason: process.env.DI_S4_KILL_INIT_REASON,
    envContent: content,
    envReadable: readable,
    topology,
    budget,
    persistence,
    expectedPersistence: parseExpectedPersistenceFromEnv(process.env as Record<string, string>),
    dryRun: process.env.DRY_RUN === '1',
    verifiedReleaseDir,
    wrapperBackendRoot,
    deployedInitializerExists: initExists,
  };
}

function cmdEvaluateGuards(): void {
  const result = evaluateKillInitGuards(buildGuardInputFromEnv());
  console.log(`OPERATOR_ACK_REQUIRED=YES`);
  console.log(`OPERATOR_ACK_VALIDATED=${result.operatorAckValidated ? 'YES' : 'NO'}`);
  console.log(`GUARDS_OK=${result.ok ? 'YES' : 'NO'}`);
  console.log(`GUARD_FAILURES=${result.failures.join(',') || 'NONE'}`);
  console.log(`DEPLOYED_INITIALIZER_PATH=${result.deployedInitializerPath}`);
  console.log(`DEPLOYED_RELEASE_INITIALIZER_IS_EXECUTION_AUTHORITY=YES`);
  console.log(`WRAPPER_REQUIRES_NEW_CODE_DEPLOY_BEFORE_USE=NO`);
  console.log(`NEWER_MAIN_INITIALIZER_SUBSTITUTION_POSSIBLE=${result.newerMainSubstitutionPossible ? 'YES' : 'NO'}`);
  if (!result.ok) process.exitCode = 1;
}

function cmdPostVerify(): void {
  const outcome = process.env.DI_S4F7F_INIT_OUTCOME || '';
  const result = assertPostWriteGlobalRow({
    globalRowCount: Number(process.env.DI_S4F7F_GLOBAL_ROW_COUNT || '0'),
    killState: process.env.DI_S4F7F_GLOBAL_KILL_STATE,
    reason: process.env.DI_S4F7F_GLOBAL_REASON ?? null,
    actor: process.env.DI_S4F7F_GLOBAL_ACTOR ?? null,
    requestedReason: process.env.DI_S4_KILL_INIT_REASON || '',
    requestedActor: process.env.DI_S4_KILL_INIT_ACTOR || '',
    initOutcome: outcome,
  });
  console.log(`POST_WRITE_VERIFY=${result.ok ? 'PASS' : 'FAIL'}`);
  console.log(`POST_WRITE_FAILURES=${result.failures.join(',') || 'NONE'}`);
  if (!result.ok) process.exitCode = 1;
}

function cmdParseInitOutcome(stdoutFile: string): void {
  const stdout = readFile(stdoutFile);
  const outcome = parseInitializerOutcome(stdout);
  console.log(`DI_V0_S4_GLOBAL_KILL_INIT_RESULT=${outcome ?? 'UNKNOWN'}`);
  if (!outcome) process.exitCode = 1;
}

async function cmdQueryGlobal(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ kill_state: string }>>`
      SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    console.log(String(rows.length));
    console.log(rows[0]?.kill_state ?? '');
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function cmdQueryS4Counts(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const q = async (sql: string): Promise<string> => {
      const rows = await prisma.$queryRawUnsafe<Array<{ c: string }>>(sql);
      return String(rows[0]?.c ?? '0');
    };
    console.log(await q('SELECT COUNT(*)::text AS c FROM di_v0_s4_pipeline_versions'));
    console.log(await q('SELECT COUNT(*)::text AS c FROM di_v0_s4_work_items'));
    console.log(
      await q(
        "SELECT COUNT(*)::text AS c FROM di_v0_s4_work_items WHERE status NOT IN ('RETIRED','FAILED')",
      ),
    );
    console.log(await q('SELECT COUNT(*)::text AS c FROM di_v0_s4_evidence_snapshots'));
    console.log(await q('SELECT COUNT(*)::text AS c FROM di_v0_shadow_runs'));
    console.log(await q('SELECT COUNT(*)::text AS c FROM di_v0_shadow_intervals'));
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'redis-ping':
      await cmdRedisPing(args[0], args[1] === '--fixture-ok');
      break;
    case 'live-metric':
      cmdLiveMetric(args[0], args[1]);
      break;
    case 'env-sha256':
      cmdEnvSha256(args[0]);
      break;
    case 'not-before':
      cmdNotBefore(args[0]);
      break;
    case 'evaluate-guards':
      cmdEvaluateGuards();
      break;
    case 'post-verify':
      cmdPostVerify();
      break;
    case 'parse-init-outcome':
      cmdParseInitOutcome(args[0]);
      break;
    case 'query-global':
      await cmdQueryGlobal();
      break;
    case 'query-s4-counts':
      await cmdQueryS4Counts();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
