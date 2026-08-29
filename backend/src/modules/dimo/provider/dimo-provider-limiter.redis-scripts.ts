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

/** KEYS[1] cooldown key; ARGV[1] cooldown end epoch ms; ARGV[2] ttl seconds */
export const DIMO_PROVIDER_COOLDOWN_SET_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
`;

export const DIMO_PROVIDER_KEY_PREFIX = 'dimo:provider:limiter';

export function dimoProviderRateKey(epochSecond: number): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:rate:${epochSecond}`;
}

export function dimoProviderInflightKey(): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:inflight`;
}

export function dimoProviderCooldownKey(): string {
  return `${DIMO_PROVIDER_KEY_PREFIX}:cooldown`;
}
