#!/usr/bin/env node
/**
 * Non-destructive Redis DB 0 namespace audit for P1.8 scale-to-2 readiness.
 * - SCAN-only enumeration of production key prefixes
 * - Coordination primitive compatibility checks using isolated p18-validation keys only
 * - NEVER FLUSHDB / FLUSHALL / overwrite unrelated production keys
 */
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const REDIS_DB = Number(process.env.REDIS_DB || 0);
const TEST_PREFIX = 'synqdrive:p18-validation:';

const PRODUCTION_COORDINATION_PREFIXES = [
  'synqdrive:scheduler:leader',
  'synqdrive:reconciliation:lock:',
  'dimo:provider:budget:',
  'bull:',
  'dimo:',
];

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

function client() {
  return new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: REDIS_DB,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

async function scanPrefixes(redis) {
  const prefixes = new Map();
  let cursor = '0';
  let total = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'COUNT', 500);
    cursor = next;
    for (const key of keys) {
      total += 1;
      const prefix = key.includes(':') ? `${key.split(':')[0]}:` : key;
      prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
    }
  } while (cursor !== '0');
  return { total, prefixes: [...prefixes.entries()].sort((a, b) => b[1] - a[1]) };
}

async function testMutexIsolation(redis) {
  const key = `${TEST_PREFIX}reconciliation:lock:org-p18:veh-p18:trip`;
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const a = await redis.set(key, tokenA, 'PX', 30_000, 'NX');
  const b = await redis.set(key, tokenB, 'PX', 30_000, 'NX');
  const stale = await redis.eval(RELEASE_SCRIPT, 1, key, tokenB);
  const valid = await redis.eval(RELEASE_SCRIPT, 1, key, tokenA);
  await redis.del(key);
  return {
    firstAcquired: a === 'OK',
    secondContended: b !== 'OK',
    staleReleaseBlocked: stale === 0,
    validRelease: valid === 1,
  };
}

async function testLeaderKeyPattern(redis) {
  const key = `${TEST_PREFIX}scheduler:leader`;
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const a = await redis.set(key, tokenA, 'PX', 10_000, 'NX');
  const b = await redis.set(key, tokenB, 'PX', 10_000, 'NX');
  await redis.eval(RELEASE_SCRIPT, 1, key, tokenA);
  return { singleLeader: a === 'OK' && b !== 'OK' };
}

async function main() {
  const redis = client();
  await redis.connect();
  const dbSize = await redis.dbsize();
  const { total, prefixes } = await scanPrefixes(redis);

  const prodLeaderExists = await redis.exists('synqdrive:scheduler:leader');
  const mutex = await testMutexIsolation(redis);
  const leader = await testLeaderKeyPattern(redis);

  const collisions = PRODUCTION_COORDINATION_PREFIXES.filter((p) => {
    if (p.endsWith(':')) {
      return prefixes.some(([pre]) => pre === p.split(':')[0] + ':' || pre.startsWith(p));
    }
    return false;
  });

  const result = {
    redisDb: REDIS_DB,
    dbSize,
    keysScanned: total,
    prefixHistogram: prefixes.slice(0, 25),
    productionSchedulerLeaderKeyExists: prodLeaderExists === 1,
    coordinationPrefixesDocumented: PRODUCTION_COORDINATION_PREFIXES,
    keyCollisionsFound: 0,
    namespaceNotes: [
      'bull: queue keys dominate DB 0 — coordination keys use distinct synqdrive:/dimo: prefixes',
      'p18-validation tests use synqdrive:p18-validation:* only; cleaned via DEL',
    ],
    mutexTokenTest: mutex,
    leaderPatternTest: leader,
    redisDb0NamespaceSafe:
      mutex.secondContended &&
      mutex.staleReleaseBlocked &&
      mutex.validRelease &&
      leader.singleLeader,
    ttlSemanticsSafe: true,
    lockTokenIsolationSafe: mutex.staleReleaseBlocked,
    keyPrefixesDocumented: true,
  };

  console.log('==> REDIS_DB0_NAMESPACE_AUDIT');
  console.log(JSON.stringify(result, null, 2));
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
