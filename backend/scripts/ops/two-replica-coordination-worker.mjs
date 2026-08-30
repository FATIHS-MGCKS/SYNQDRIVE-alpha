#!/usr/bin/env node
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const task = process.env.TASK;
const worker = process.env.WORKER || '?';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const DIMO_ACQUIRE = `
local leases = KEYS[1]
local nowMs = tonumber(ARGV[1])
local leaseExpiryMs = tonumber(ARGV[2])
local maxInFlight = tonumber(ARGV[3])
local leaseToken = ARGV[4]
redis.call('ZREMRANGEBYSCORE', leases, '-inf', nowMs)
local inFlight = redis.call('ZCARD', leases)
if inFlight >= maxInFlight then return {0, 'at_limit'} end
redis.call('ZADD', leases, leaseExpiryMs, leaseToken)
return {1, 'acquired'}
`;

function redisClient() {
  return new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 15),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

async function mutexAcquire() {
  const key = `synqdrive:reconciliation:lock:${process.env.ORG}:${process.env.VEHICLE}:trip`;
  const token = randomUUID();
  const redis = redisClient();
  await redis.connect();
  const ok = await redis.set(key, token, 'PX', 120_000, 'NX');
  const result = { worker, task, acquired: ok === 'OK', key };
  if (ok === 'OK') {
    await redis.eval(RELEASE_SCRIPT, 1, key, token);
  }
  await redis.quit();
  console.log(JSON.stringify(result));
}

async function dimoAcquire() {
  const maxInFlight = Number(process.env.MAX_IN_FLIGHT || 10);
  const token = randomUUID();
  const redis = redisClient();
  await redis.connect();
  const now = Date.now();
  const [ok] = await redis.eval(
    DIMO_ACQUIRE,
    1,
    'dimo:provider:budget:leases',
    String(now),
    String(now + 30_000),
    String(maxInFlight),
    token,
  );
  const result = { worker, task, acquired: Number(ok) === 1 };
  await redis.quit();
  console.log(JSON.stringify(result));
}

if (task === 'mutex_acquire') mutexAcquire().catch((e) => { console.error(e); process.exit(1); });
else if (task === 'dimo_acquire') dimoAcquire().catch((e) => { console.error(e); process.exit(1); });
else {
  console.error('unknown TASK');
  process.exit(1);
}
