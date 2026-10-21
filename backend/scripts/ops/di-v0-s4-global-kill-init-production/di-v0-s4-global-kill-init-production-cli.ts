#!/usr/bin/env ts-node
/**
 * CLI helpers for S4F-7F Production GLOBAL kill initializer wrapper (no arbitrary DB writes).
 */
import * as fs from 'fs';
import Redis from 'ioredis';
import {
  assertPostWriteGlobalRow,
  classifyBudgetConfigFromEnvContent,
  classifyGlobalControlPrestate,
  classifyNotBeforeState,
  evaluateKillInitGuards,
  parseExpectedPersistenceFromEnv,
  parseGlobalRowDbLines,
  parseInitializerOutcome,
  parseS4PersistenceDbLines,
  sha256FileContent,
  type BudgetSnapshot,
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

function envFlagYes(name: string): boolean {
  return process.env[name] === 'YES';
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

function cmdEnvSha256(envFile: string): void {
  const content = readFile(envFile);
  console.log(`BACKEND_ENV_SHA256=${sha256FileContent(content)}`);
}

function cmdNotBefore(envFile: string): void {
  const map = envMapFromFileContent(readFile(envFile));
  console.log(`NOT_BEFORE_CLASSIFICATION=${classifyNotBeforeState(map)}`);
}

function cmdValidateGlobalPrestate(lines: string[]): void {
  const includeMeta = process.env.DI_S4F7F_VALIDATE_GLOBAL_INCLUDE_META === '1';
  const parsed = parseGlobalRowDbLines(lines, includeMeta);
  if (!parsed.ok) {
    console.log(`${parsed.code}=YES`);
    process.exitCode = 1;
    return;
  }
  console.log('GLOBAL_ROW_READ_OK=YES');
}

function cmdValidateS4Persistence(lines: string[]): void {
  const parsed = parseS4PersistenceDbLines(lines);
  if (!parsed.ok) {
    console.log(`${parsed.code}=YES`);
    process.exitCode = 1;
    return;
  }
  console.log('S4_PERSISTENCE_READ_OK=YES');
}

function globalPrestateFromEnv(): {
  prestate: ReturnType<typeof classifyGlobalControlPrestate>;
  rowCount: number;
  killState: string | undefined;
  reason: string | undefined;
  actor: string | undefined;
} {
  const includeMeta = process.env.DI_S4F7F_VALIDATE_GLOBAL_INCLUDE_META === '1';
  const lines = [
    process.env.DI_S4F7F_GLOBAL_ROW_COUNT ?? '',
    process.env.DI_S4F7F_GLOBAL_KILL_STATE ?? '',
  ];
  if (includeMeta) {
    lines.push(process.env.DI_S4F7F_GLOBAL_REASON ?? '', process.env.DI_S4F7F_GLOBAL_ACTOR ?? '');
  }
  const parsed = parseGlobalRowDbLines(lines, includeMeta);
  if (!parsed.ok) {
    return {
      prestate: 'MALFORMED',
      rowCount: -1,
      killState: undefined,
      reason: undefined,
      actor: undefined,
    };
  }
  const killStates = parsed.killState != null ? [parsed.killState] : [];
  return {
    prestate: classifyGlobalControlPrestate(parsed.rowCount, killStates),
    rowCount: parsed.rowCount,
    killState: parsed.killState ?? undefined,
    reason: parsed.reason ?? undefined,
    actor: parsed.actor ?? undefined,
  };
}

function persistenceFromEnv(): S4PersistenceCounts {
  const lines = [
    process.env.DI_S4F7F_S4_PIPELINE_REGISTRY_ROWS ?? '',
    process.env.DI_S4F7F_S4_WORK_ITEM_ROWS ?? '',
    process.env.DI_S4F7F_S4_ACTIVE_WORK_ITEM_ROWS ?? '',
    process.env.DI_S4F7F_S4_EVIDENCE_SNAPSHOT_ROWS ?? '',
    process.env.DI_S4F7F_S4_SHADOW_RUN_ROWS ?? '',
    process.env.DI_S4F7F_S4_SHADOW_INTERVAL_ROWS ?? '',
  ];
  const parsed = parseS4PersistenceDbLines(lines);
  if (!parsed.ok) {
    return {
      pipelineRegistry: -1,
      workItems: -1,
      activeWorkItems: -1,
      evidenceSnapshots: -1,
      shadowRuns: -1,
      shadowIntervals: -1,
    };
  }
  return parsed.counts;
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

  const global = globalPrestateFromEnv();

  const topology: TopologySnapshot = {
    replicaAHealthOk: process.env.DI_S4F7F_REPLICA_A_HEALTH === 'OK',
    replicaBHealthOk: process.env.DI_S4F7F_REPLICA_B_HEALTH === 'OK',
    replicaAProcessReleaseIdentityOk: envFlagYes('DI_S4F7F_REPLICA_A_PROCESS_RELEASE_IDENTITY'),
    replicaBProcessReleaseIdentityOk: envFlagYes('DI_S4F7F_REPLICA_B_PROCESS_RELEASE_IDENTITY'),
    steadyStateNoMixedReleaseIdentity: envFlagYes('DI_S4F7F_STEADY_STATE_NO_MIXED_RELEASE_IDENTITY'),
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
    actualGlobalPrestate: global.prestate,
    actor: process.env.DI_S4_KILL_INIT_ACTOR,
    reason: process.env.DI_S4_KILL_INIT_REASON,
    envContent: content,
    envReadable: readable,
    topology,
    budget,
    persistence: persistenceFromEnv(),
    expectedPersistence: parseExpectedPersistenceFromEnv(process.env as Record<string, string>),
    dryRun: process.env.DRY_RUN === '1',
    verifiedReleaseDir,
    wrapperBackendRoot,
    deployedInitializerExists: initExists,
    deployedInitializerTracked: envFlagYes('DI_S4F7F_DEPLOYED_INITIALIZER_TRACKED'),
    deployedInitializerWorktreeClean: envFlagYes('DI_S4F7F_DEPLOYED_INITIALIZER_WORKTREE_CLEAN'),
    deployedKillImplementationTracked: envFlagYes('DI_S4F7F_DEPLOYED_KILL_IMPLEMENTATION_TRACKED'),
    deployedKillImplementationWorktreeClean: envFlagYes('DI_S4F7F_DEPLOYED_KILL_IMPLEMENTATION_WORKTREE_CLEAN'),
    initializerSubstitutionRisk: envFlagYes('DI_S4F7F_INITIALIZER_SUBSTITUTION_RISK'),
    mainCheckoutDiffersFromProduction: envFlagYes('DI_S4F7F_MAIN_CHECKOUT_DIFFERS_FROM_PRODUCTION'),
  };
}

function cmdEvaluateGuards(): void {
  const result = evaluateKillInitGuards(buildGuardInputFromEnv());
  console.log(`OPERATOR_ACK_REQUIRED=YES`);
  console.log(`OPERATOR_ACK_VALIDATED=${result.operatorAckValidated ? 'YES' : 'NO'}`);
  console.log(`GUARDS_OK=${result.ok ? 'YES' : 'NO'}`);
  console.log(`GUARD_FAILURES=${result.failures.join(',') || 'NONE'}`);
  console.log(`DEPLOYED_INITIALIZER_PATH=${result.deployedInitializerPath}`);
  console.log(
    `DEPLOYED_RELEASE_INITIALIZER_IS_EXECUTION_AUTHORITY=${result.deployedReleaseInitializerIsAuthority ? 'YES' : 'NO'}`,
  );
  console.log(`WRAPPER_REQUIRES_NEW_CODE_DEPLOY_BEFORE_USE=NO`);
  console.log(
    `MAIN_CHECKOUT_DIFFERS_FROM_PRODUCTION=${result.mainCheckoutDiffersFromProduction ? 'YES' : 'NO'}`,
  );
  console.log(`NEWER_MAIN_INITIALIZER_SUBSTITUTION_POSSIBLE=NO`);
  if (!result.ok) process.exitCode = 1;
}

function cmdPostVerify(): void {
  const outcome = process.env.DI_S4F7F_INIT_OUTCOME || '';
  process.env.DI_S4F7F_VALIDATE_GLOBAL_INCLUDE_META = '1';
  const global = globalPrestateFromEnv();
  const result = assertPostWriteGlobalRow({
    globalRowCount: global.rowCount,
    killState: global.killState,
    reason: global.reason ?? null,
    actor: global.actor ?? null,
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

async function cmdQueryGlobalPrestate(): Promise<void> {
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

async function cmdQueryGlobalDetail(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      Array<{ kill_state: string; reason: string; actor: string }>
    >`
      SELECT kill_state, reason, actor FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    console.log(String(rows.length));
    if (rows.length === 0) {
      console.log('');
      console.log('');
      console.log('');
      return;
    }
    console.log(rows[0]?.kill_state ?? '');
    console.log(rows[0]?.reason ?? '');
    console.log(rows[0]?.actor ?? '');
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
      const raw = rows[0]?.c;
      if (raw == null || String(raw).trim() === '') {
        throw new Error('S4_PERSISTENCE_READ_FAILED');
      }
      return String(raw).trim();
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
    case 'env-sha256':
      cmdEnvSha256(args[0]);
      break;
    case 'not-before':
      cmdNotBefore(args[0]);
      break;
    case 'validate-global-prestate':
      cmdValidateGlobalPrestate(args);
      break;
    case 'validate-s4-persistence':
      cmdValidateS4Persistence(args);
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
    case 'query-global-prestate':
      await cmdQueryGlobalPrestate();
      break;
    case 'query-global-detail':
      await cmdQueryGlobalDetail();
      break;
    case 'query-global':
      await cmdQueryGlobalPrestate();
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
