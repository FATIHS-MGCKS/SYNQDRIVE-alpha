#!/usr/bin/env ts-node
/**
 * CLI for S4F-4 global-budget env mutation and pre/post validation (no arbitrary keys).
 */
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import Redis from 'ioredis';
import { validateDimoProviderBudgetConfig } from '../../../src/modules/dimo/provider-budget/dimo-provider-budget.config';
import {
  applyGlobalBudgetEnabledMutation,
  assertPreflightConfigStateAllowed,
  assertS4ControlFlagsSafe,
  classifyConfigFileFromEnvContent,
  classifyLiveGlobalBudgetMetricFromPrometheusBody,
  envMapFromFileContent,
  idempotentConvergenceDecision,
  parseCanonicalRedisEnvFromMap,
  sha256Hex,
} from './di-v0-s4f-global-budget-rollout.lib';

function readFile(pathname: string): string {
  return fs.readFileSync(pathname, 'utf8');
}

function readDotenvValue(file: string, key: string): string {
  const content = readFile(file);
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    if (trimmed.slice(0, idx) !== key) continue;
    let v = trimmed.slice(idx + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return '';
}

function atomicWriteFilePreserveOwnership(target: string, content: string): void {
  const st = fs.statSync(target);
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.s4f4.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: st.mode });
  try {
    if (typeof st.uid === 'number' && typeof st.gid === 'number') {
      fs.chownSync(tmp, st.uid, st.gid);
    }
  } catch {
    console.log('BACKEND_ENV_UID_PRESERVED=NO');
    console.log('BACKEND_ENV_GID_PRESERVED=NO');
    console.log('OWNERSHIP_PRESERVATION_FAILS_CLOSED=YES');
    fs.unlinkSync(tmp);
    process.exit(1);
  }
  fs.renameSync(tmp, target);
  const after = fs.statSync(target);
  const uidOk = after.uid === st.uid;
  const gidOk = after.gid === st.gid;
  const modeOk = after.mode === st.mode;
  console.log(`BACKEND_ENV_UID_PRESERVED=${uidOk ? 'YES' : 'NO'}`);
  console.log(`BACKEND_ENV_GID_PRESERVED=${gidOk ? 'YES' : 'NO'}`);
  console.log(`BACKEND_ENV_MODE_PRESERVED=${modeOk ? 'YES' : 'NO'}`);
  if (!uidOk || !gidOk || !modeOk) {
    console.log('OWNERSHIP_PRESERVATION_FAILS_CLOSED=YES');
    process.exit(1);
  }
}

function cmdPreflight(file: string): void {
  let readable = false;
  try {
    fs.accessSync(file, fs.constants.R_OK);
    readable = true;
  } catch {
    readable = false;
  }
  let content = '';
  try {
    content = readFile(file);
  } catch {
    console.log('GLOBAL_BUDGET_CONFIG_FILE_STATE=UNREADABLE');
    process.exit(1);
  }
  const state = classifyConfigFileFromEnvContent(content, readable);
  console.log(`GLOBAL_BUDGET_CONFIG_FILE_STATE=${state}`);
  const allowed = assertPreflightConfigStateAllowed(state);
  if (!allowed.ok) {
    console.log(`PREFLIGHT_CONFIG_ALLOWED=NO reason=${allowed.reason}`);
    process.exit(1);
  }
  console.log('PREFLIGHT_CONFIG_ALLOWED=YES');
}

function cmdS4Safe(file: string): void {
  const content = readFile(file);
  const env = envMapFromFileContent(content);
  const { ok, unsafeKeys } = assertS4ControlFlagsSafe(env);
  if (!ok) {
    console.log(`S4_FLAGS_PRE_STATE_SAFE=NO unsafe=${unsafeKeys.join(',')}`);
    process.exit(1);
  }
  console.log('S4_FLAGS_PRE_STATE_SAFE=YES');
}

function cmdValidateBudget(file: string): void {
  const env = envMapFromFileContent(readFile(file));
  const merged: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    DIMO_GLOBAL_BUDGET_ENABLED: 'true',
  };
  const config = {
    globalBudgetEnabled: true,
    globalMaxInFlight: parseInt(merged.DIMO_GLOBAL_MAX_IN_FLIGHT ?? '50', 10),
    globalAcquireTimeoutMs: parseInt(merged.DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS ?? '15000', 10),
    globalLeaseMs: parseInt(merged.DIMO_GLOBAL_LEASE_MS ?? '30000', 10),
    globalRetryAfterMaxMs: parseInt(merged.DIMO_GLOBAL_RETRY_AFTER_MAX_MS ?? '120000', 10),
    globalMaxRetries: parseInt(merged.DIMO_GLOBAL_MAX_RETRIES ?? '3', 10),
    reservedHighPrioritySlots: parseInt(merged.DIMO_GLOBAL_RESERVED_HIGH_SLOTS ?? '10', 10),
    starvationPromotionMs: parseInt(merged.DIMO_GLOBAL_STARVATION_PROMOTION_MS ?? '30000', 10),
    providerCooldown429Threshold: parseInt(merged.DIMO_PROVIDER_COOLDOWN_429_THRESHOLD ?? '5', 10),
    providerCooldownMs: parseInt(merged.DIMO_PROVIDER_COOLDOWN_MS ?? '30000', 10),
    acquirePollIntervalMs: parseInt(merged.DIMO_GLOBAL_ACQUIRE_POLL_MS ?? '50', 10),
  };
  const errors = validateDimoProviderBudgetConfig(config);
  if (errors.length > 0) {
    console.log(`PROVIDER_BUDGET_CONFIG_VALID=NO errors=${errors.join(';')}`);
    process.exit(1);
  }
  console.log('PROVIDER_BUDGET_CONFIG_VALID=YES');
}

function cmdMutate(file: string): void {
  const before = readFile(file);
  const beforeSha = sha256Hex(before);
  const { nextContent, unrelatedDeltaCount, mutated } = applyGlobalBudgetEnabledMutation(before);
  if (unrelatedDeltaCount !== 0) {
    console.log(`UNRELATED_ENV_DELTA_COUNT=${unrelatedDeltaCount}`);
    console.log('MUTATION_VALIDATION=FAIL');
    process.exit(1);
  }
  atomicWriteFilePreserveOwnership(file, nextContent);
  const afterSha = sha256Hex(readFile(file));
  console.log(`ENV_MUTATION_PERFORMED=${mutated ? 'YES' : 'NO'}`);
  console.log(`UNRELATED_ENV_DELTA_COUNT=${unrelatedDeltaCount}`);
  console.log(`BACKEND_ENV_SHA256_BEFORE=${beforeSha}`);
  console.log(`BACKEND_ENV_SHA256_AFTER=${afterSha}`);
  const state = classifyConfigFileFromEnvContent(readFile(file), true);
  console.log(`GLOBAL_BUDGET_CONFIG_FILE_STATE=${state}`);
  if (state !== 'EXPLICIT_ENABLED') {
    console.log('MUTATION_VALIDATION=FAIL');
    process.exit(1);
  }
  console.log('DIMO_GLOBAL_BUDGET_CONFIG_NORMALIZED_VALUE=ENABLED');
  console.log('MUTATION_VALIDATION=PASS');
}

function cmdIdempotentDecision(file: string, runtimeA: string, runtimeB: string): void {
  const state = classifyConfigFileFromEnvContent(readFile(file), true);
  const mapRuntime = (v: string) => (v === 'ENABLED' || v === 'DISABLED' ? v : 'UNKNOWN');
  const decision = idempotentConvergenceDecision({
    configState: state,
    replicaARuntime: mapRuntime(runtimeA),
    replicaBRuntime: mapRuntime(runtimeB),
  });
  console.log(`IDEMPOTENT_DECISION=${decision}`);
}

async function cmdRedisPing(file: string, fixtureOk: boolean): Promise<void> {
  const env = envMapFromFileContent(readFile(file));
  const cfg = parseCanonicalRedisEnvFromMap(env);
  console.log('REDIS_CONFIG_SOURCE=CANONICAL_HOST_PORT_PASSWORD_DB');
  console.log('REDIS_PING_REQUIRED=YES');
  if (fixtureOk) {
    if (process.env.DI_S4F4_TEST_INJECT_REDIS_FAIL === '1') {
      console.log('REDIS_REACHABLE=NO');
      process.exit(1);
    }
    console.log(`REDIS_HOST_RESOLVED=${cfg.host}`);
    console.log(`REDIS_PORT_RESOLVED=${cfg.port}`);
    console.log(`REDIS_DB_RESOLVED=${cfg.db}`);
    console.log('REDIS_SECRET_EXPOSED=NO');
    console.log('REDIS_REACHABLE=YES');
    return;
  }
  const client = new Redis({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    db: cfg.db,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      console.log('REDIS_REACHABLE=NO');
      process.exit(1);
    }
    console.log('REDIS_SECRET_EXPOSED=NO');
    console.log('REDIS_REACHABLE=YES');
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

function httpGetMetrics(port: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: Number(port),
        path: '/api/v1/metrics',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`metrics_http_${res.statusCode}`));
            return;
          }
          resolve(body);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('metrics_timeout'));
    });
    req.end();
  });
}

async function cmdFetchLiveMetric(envFile: string, port: string): Promise<void> {
  const token = readDotenvValue(envFile, 'METRICS_BEARER_TOKEN');
  if (!token) {
    process.exit(1);
  }
  const body = await httpGetMetrics(port, token);
  const proof = classifyLiveGlobalBudgetMetricFromPrometheusBody(body);
  if (proof === 'ENABLED') {
    process.stdout.write('1');
    return;
  }
  if (proof === 'DISABLED') {
    process.stdout.write('0');
    return;
  }
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const file = args[1];
  if (!cmd || !file) {
    console.error(
      'usage: cli.ts <preflight|s4-safe|validate-budget|mutate|idempotent-decision|redis-ping|fetch-live-metric> <env-file> [port] [--fixture-ok]',
    );
    process.exit(2);
  }
  const fixtureOk = args.includes('--fixture-ok');
  switch (cmd) {
    case 'preflight':
      cmdPreflight(file);
      break;
    case 's4-safe':
      cmdS4Safe(file);
      break;
    case 'validate-budget':
      cmdValidateBudget(file);
      break;
    case 'mutate':
      cmdMutate(file);
      break;
    case 'idempotent-decision':
      cmdIdempotentDecision(file, args[2] ?? 'UNKNOWN', args[3] ?? 'UNKNOWN');
      break;
    case 'redis-ping':
      await cmdRedisPing(file, fixtureOk);
      break;
    case 'fetch-live-metric': {
      const port = args[2];
      if (!port) process.exit(2);
      await cmdFetchLiveMetric(file, port);
      break;
    }
    default:
      console.error(`unknown command ${cmd}`);
      process.exit(2);
  }
}

main().catch(() => process.exit(1));
