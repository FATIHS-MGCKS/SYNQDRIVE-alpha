import { Injectable } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import { VOICE_PROTECTION_DEFAULTS } from './voice-protection-limits.config';

const CONCURRENT_KEY_PREFIX = 'voice:concurrent:';
const DEST_ATTEMPTS_PREFIX = 'voice:dest:attempts:';
const DEST_COOLDOWN_PREFIX = 'voice:dest:cooldown:';

/** Atomic reserve slot — returns false when at capacity (race-safe). */
const RESERVE_LUA = `
local key = KEYS[1]
local member = ARGV[1]
local max = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if redis.call('SCARD', key) >= max and redis.call('SISMEMBER', key, member) == 0 then
  return 0
end
redis.call('SADD', key, member)
redis.call('EXPIRE', key, ttl)
return 1
`;

@Injectable()
export class VoiceConcurrentCallReservationService {
  constructor(private readonly redis: RedisService) {}

  async reserve(params: {
    organizationId: string;
    conversationId: string;
    maxConcurrent: number;
  }): Promise<boolean> {
    const key = `${CONCURRENT_KEY_PREFIX}${params.organizationId}`;
    const result = await this.redis.eval(
      RESERVE_LUA,
      1,
      key,
      params.conversationId,
      String(params.maxConcurrent),
      String(VOICE_PROTECTION_DEFAULTS.concurrentReservationTtlSeconds),
    );
    return Number(result) === 1;
  }

  async release(organizationId: string, conversationId: string): Promise<void> {
    const key = `${CONCURRENT_KEY_PREFIX}${organizationId}`;
    await this.redis.srem(key, conversationId);
  }

  async countActive(organizationId: string): Promise<number> {
    const key = `${CONCURRENT_KEY_PREFIX}${organizationId}`;
    return this.redis.scard(key);
  }

  async recordDestinationAttempt(params: {
    organizationId: string;
    destinationDigest: string;
    maxRepeats: number;
    cooldownSeconds: number;
  }): Promise<{ allowed: boolean; reason?: 'repeat_limit' | 'cooldown' }> {
    const dayBucket = new Date().toISOString().slice(0, 10);
    const attemptsKey = `${DEST_ATTEMPTS_PREFIX}${params.organizationId}:${params.destinationDigest}:${dayBucket}`;
    const cooldownKey = `${DEST_COOLDOWN_PREFIX}${params.organizationId}:${params.destinationDigest}`;

    const onCooldown = await this.redis.get(cooldownKey);
    if (onCooldown) {
      return { allowed: false, reason: 'cooldown' };
    }

    const count = await this.redis.incr(attemptsKey);
    if (count === 1) {
      await this.redis.expire(attemptsKey, 86_400);
    }
    if (count > params.maxRepeats) {
      await this.redis.set(cooldownKey, '1', 'EX', params.cooldownSeconds);
      return { allowed: false, reason: 'repeat_limit' };
    }

    return { allowed: true };
  }
}
