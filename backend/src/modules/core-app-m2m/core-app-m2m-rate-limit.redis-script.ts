/** Atomic fixed-window consume — returns 1 when allowed, 0 when limit exceeded. */
export const CORE_APP_M2M_CONSUME_FIXED_WINDOW_SCRIPT = `
local limit = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current + 1 > limit then
  return 0
end
local new_count = redis.call('INCR', KEYS[1])
if new_count == 1 then
  redis.call('PEXPIRE', KEYS[1], ttl_ms)
end
return 1
`;

export const CORE_APP_M2M_RATE_LIMIT_REDIS_KEY_PREFIX = 'synqdrive:core-app-m2m:rl:v1' as const;