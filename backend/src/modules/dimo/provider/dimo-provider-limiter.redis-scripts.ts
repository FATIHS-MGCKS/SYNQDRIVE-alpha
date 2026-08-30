/**
 * Atomic Redis scripts for global DIMO provider limiter.
 */

/** Legacy per-second fixed window (S2) — retained for explicit fixed_window algorithm only. */
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
 * S4 token bucket — global smoothed rate limit.
 * KEYS[1] hash: tokens, last_refill_ms
 * ARGV[1] nowMs
 * ARGV[2] refillRatePerSecond (sustained budget)
 * ARGV[3] capacity (rate + burst)
 * Returns {used, capacity, decision, tokensRemaining}
 */
export const DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT = `
local nowMs = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill_ms')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  lastRefill = nowMs
end

local elapsedMs = math.max(0, nowMs - lastRefill)
local refill = (elapsedMs * refillRate) / 1000.0
tokens = math.min(capacity, tokens + refill)
lastRefill = nowMs

local decision = 'allow'
if tokens < 1.0 then
  decision = 'would_reject'
else
  tokens = tokens - 1.0
end

redis.call('HMSET', KEYS[1], 'tokens', tokens, 'last_refill_ms', lastRefill)
redis.call('PEXPIRE', KEYS[1], 120000)

local used = capacity - tokens
return {used, capacity, decision, tokens}
`;

/**
 * KEYS[1] in-flight ZSET (score = lease expiry ms, member = rank:leaseId)
 * ARGV[1] max in-flight
 * ARGV[2] leaseId (uuid only)
 * ARGV[3] nowMs
 * ARGV[4] expiryMs
 * ARGV[5] mode ('shadow' | 'enforce')
 * ARGV[6] priority rank (0=highest)
 * ARGV[7] reserved high-priority slots (P0/P1 lane)
 */
export const DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
local members = redis.call('ZRANGE', KEYS[1], 0, -1)
local count = #members
local highCount = 0
for i = 1, count do
  local member = members[i]
  local sep = string.find(member, ':', 1, true)
  if sep then
    local rank = tonumber(string.sub(member, 1, sep - 1))
    if rank ~= nil and rank <= 1 then
      highCount = highCount + 1
    end
  end
end
local maxInflight = tonumber(ARGV[1])
local rank = tonumber(ARGV[6])
local reserved = tonumber(ARGV[7])
local decision = 'allow'
if count >= maxInflight then
  if rank <= 1 and highCount < reserved then
    decision = 'allow'
  else
    decision = 'would_reject'
  end
end
if decision == 'would_reject' then
  return {count, maxInflight, decision, count, highCount}
end
local member = ARGV[6] .. ':' .. ARGV[2]
redis.call('ZADD', KEYS[1], ARGV[4], member)
redis.call('PEXPIRE', KEYS[1], 120000)
local newCount = redis.call('ZCARD', KEYS[1])
return {count, maxInflight, decision, newCount, highCount}
`;

export const DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

/** KEYS[1] cooldown key; ARGV[1] cooldown end epoch ms; ARGV[2] ttl seconds; ARGV[3] now epoch ms */
export const DIMO_PROVIDER_COOLDOWN_SET_SCRIPT = `
local newEndMs = tonumber(ARGV[1])
local newTtlSec = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local existing = redis.call('GET', KEYS[1])
if existing then
  local existingEnd = tonumber(existing)
  if existingEnd and existingEnd > newEndMs then
    newEndMs = existingEnd
  end
end
local ttlSec = math.max(newTtlSec, math.ceil((newEndMs - nowMs) / 1000))
if ttlSec < 1 then
  ttlSec = 1
end
redis.call('SET', KEYS[1], newEndMs, 'EX', ttlSec)
return newEndMs
`;

export const DIMO_PROVIDER_KEY_PREFIX = 'dimo:provider:limiter';

export function dimoProviderRateKey(epochSecond: number): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:rate:${epochSecond}`;
}

export function dimoProviderTokenBucketKey(): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:token_bucket`;
}

export function dimoProviderInflightKey(): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:inflight`;
}

export function dimoProviderCooldownKey(): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:cooldown`;
}
