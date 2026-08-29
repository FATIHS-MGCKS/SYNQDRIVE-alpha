/**
 * Atomic Redis scripts for global DIMO provider limiter.
 * KEYS[1] rate counter key (per-second bucket)
 * ARGV[1] max allowed (limit + burst)
 * Returns {count, maxAllowed, decision}
 */
export const DIMO_PROVIDER_RATE_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], 3)
end
local maxAllowed = tonumber(ARGV[1])
local decision = 'allow'
if current > maxAllowed then
  decision = 'would_reject'
end
return {current, maxAllowed, decision}
`;

/**
 * KEYS[1] in-flight ZSET (score = lease expiry ms, member = leaseId)
 * ARGV[1] max in-flight
 * ARGV[2] leaseId
 * ARGV[3] nowMs
 * ARGV[4] expiryMs
 * ARGV[5] mode ('shadow' | 'enforce')
 */
export const DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
local count = redis.call('ZCARD', KEYS[1])
local maxInflight = tonumber(ARGV[1])
local decision = 'allow'
if count >= maxInflight then
  decision = 'would_reject'
end
local mode = ARGV[5]
-- Shadow and enforce both skip lease acquisition when at cap; shadow still
-- executes the provider call but must not inflate global in-flight accounting.
if decision == 'would_reject' then
  return {count, maxInflight, decision, count}
end
redis.call('ZADD', KEYS[1], ARGV[4], ARGV[2])
redis.call('PEXPIRE', KEYS[1], 120000)
local newCount = redis.call('ZCARD', KEYS[1])
return {count, maxInflight, decision, newCount}
`;

export const DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

export const DIMO_PROVIDER_KEY_PREFIX = 'dimo:provider:limiter';

export function dimoProviderRateKey(epochSecond: number): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:rate:${epochSecond}`;
}

export function dimoProviderInflightKey(): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:inflight`;
}
