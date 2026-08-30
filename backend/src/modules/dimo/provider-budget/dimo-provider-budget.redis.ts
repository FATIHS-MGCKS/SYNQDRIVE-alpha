/** Redis keys for global DIMO provider budget. */
export const DIMO_BUDGET_LEASES_KEY = 'dimo:provider:budget:leases';
export const DIMO_BUDGET_COOLDOWN_KEY = 'dimo:provider:budget:cooldown_until_ms';
export const DIMO_BUDGET_429_WINDOW_KEY = 'dimo:provider:budget:429_window';

/**
 * Atomic lease acquire.
 *
 * KEYS[1] leases zset (member=token, score=expiryMs)
 * KEYS[2] cooldown until ms string
 * ARGV[1] nowMs
 * ARGV[2] leaseExpiryMs (score)
 * ARGV[3] maxInFlight
 * ARGV[4] leaseToken
 * ARGV[5] priorityNumeric (1=highest)
 * ARGV[6] lowPriorityCap (max - reservedHighSlots)
 *
 * Returns: {ok, reason} where ok=1 success, ok=0 failure
 */
export const DIMO_BUDGET_ACQUIRE_SCRIPT = `
local leases = KEYS[1]
local cooldownKey = KEYS[2]
local nowMs = tonumber(ARGV[1])
local leaseExpiryMs = tonumber(ARGV[2])
local maxInFlight = tonumber(ARGV[3])
local leaseToken = ARGV[4]
local priorityNumeric = tonumber(ARGV[5])
local lowPriorityCap = tonumber(ARGV[6])

redis.call('ZREMRANGEBYSCORE', leases, '-inf', nowMs)
local inFlight = redis.call('ZCARD', leases)

local cooldownUntil = redis.call('GET', cooldownKey)
if cooldownUntil and tonumber(cooldownUntil) > nowMs then
  return {0, 'cooldown'}
end

if inFlight >= maxInFlight then
  return {0, 'at_limit'}
end

if priorityNumeric >= 4 and inFlight >= lowPriorityCap then
  return {0, 'low_priority_cap'}
end

redis.call('ZADD', leases, leaseExpiryMs, leaseToken)
return {1, leaseToken}
`;

/** Idempotent release — ZREM by token. */
export const DIMO_BUDGET_RELEASE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

/** Current in-flight count after expiry cleanup. */
export const DIMO_BUDGET_IN_FLIGHT_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
return redis.call('ZCARD', KEYS[1])
`;
