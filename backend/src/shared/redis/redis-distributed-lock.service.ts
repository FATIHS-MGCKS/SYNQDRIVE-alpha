import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface DistributedLockHandle {
  key: string;
  token: string;
  acquiredAt: Date;
}

export type DistributedLockAcquireResult =
  | { acquired: true; handle: DistributedLockHandle }
  | { acquired: false; reason: 'contended' | 'redis_unavailable' };

/**
 * Redis SET NX PX lock with token-based safe release (compare-and-delete).
 * Chosen over PostgreSQL advisory locks: Redis is already required for BullMQ
 * debounce/coalescing state in this runtime path.
 */
@Injectable()
export class RedisDistributedLockService {
  private readonly logger = new Logger(RedisDistributedLockService.name);

  constructor(private readonly redis: RedisService) {}

  async acquire(key: string, ttlMs: number): Promise<DistributedLockAcquireResult> {
    const token = randomUUID();
    try {
      const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        return {
          acquired: true,
          handle: { key, token, acquiredAt: new Date() },
        };
      }
      return { acquired: false, reason: 'contended' };
    } catch (err) {
      this.logger.warn(`Lock acquire failed for ${key}: ${(err as Error).message}`);
      return { acquired: false, reason: 'redis_unavailable' };
    }
  }

  async release(handle: DistributedLockHandle): Promise<boolean> {
    try {
      const released = await this.redis.eval(RELEASE_SCRIPT, 1, handle.key, handle.token);
      return released === 1;
    } catch (err) {
      this.logger.warn(`Lock release failed for ${handle.key}: ${(err as Error).message}`);
      return false;
    }
  }

  async extend(handle: DistributedLockHandle, ttlMs: number): Promise<boolean> {
    try {
      const extended = await this.redis.eval(EXTEND_SCRIPT, 1, handle.key, handle.token, String(ttlMs));
      return extended === 1;
    } catch (err) {
      this.logger.warn(`Lock extend failed for ${handle.key}: ${(err as Error).message}`);
      return false;
    }
  }

  lockKeyForOrganization(organizationId: string): string {
    return `notification:eval:lock:${organizationId}`;
  }
}
