import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { RedisService } from '@shared/redis/redis.service';
import type { AiChatRequestSlot } from './ai-agent-limit.types';

const ACQUIRE_SLOT_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
if current >= limit then
  return 0
end
local next = redis.call('INCR', KEYS[1])
if next == 1 then
  redis.call('EXPIRE', KEYS[1], ttl)
end
return 1
`;

const RELEASE_SLOT_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current <= 0 then
  return 0
end
return redis.call('DECR', KEYS[1])
`;

@Injectable()
export class AiAgentConcurrencyService {
  private readonly logger = new Logger(AiAgentConcurrencyService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
    private readonly redis: RedisService,
  ) {}

  async acquireSlots(input: {
    organizationId: string;
    userId: string;
  }): Promise<AiChatRequestSlot | null> {
    if (!this.aiConfiguration.agentLimitsEnabled) {
      return {
        organizationId: input.organizationId,
        userId: input.userId,
        slotKey: 'disabled',
      };
    }

    const ttlSeconds = Math.ceil(this.aiConfiguration.agentRequestTimeoutMs / 1000) + 30;
    const orgKey = `synqdrive:ai-chat:concurrent:org:${input.organizationId}`;
    const userKey = `synqdrive:ai-chat:concurrent:user:${input.userId}`;

    try {
      const orgOk = await this.redis.eval(
        ACQUIRE_SLOT_SCRIPT,
        1,
        orgKey,
        String(this.aiConfiguration.agentMaxConcurrentPerOrg),
        String(ttlSeconds),
      );
      if (orgOk !== 1) {
        return null;
      }

      const userOk = await this.redis.eval(
        ACQUIRE_SLOT_SCRIPT,
        1,
        userKey,
        String(this.aiConfiguration.agentMaxConcurrentPerUser),
        String(ttlSeconds),
      );
      if (userOk !== 1) {
        await this.redis.eval(RELEASE_SLOT_SCRIPT, 1, orgKey);
        return null;
      }

      return {
        organizationId: input.organizationId,
        userId: input.userId,
        slotKey: `${orgKey}|${userKey}`,
      };
    } catch (err: unknown) {
      if (this.aiConfiguration.agentLimitsFailOpen) {
        this.logger.warn(
          `AI concurrency acquire failed — fail-open: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return {
          organizationId: input.organizationId,
          userId: input.userId,
          slotKey: 'fail-open',
        };
      }
      throw err;
    }
  }

  async releaseSlots(slot: AiChatRequestSlot | null | undefined): Promise<void> {
    if (!slot || slot.slotKey === 'disabled' || slot.slotKey === 'fail-open') {
      return;
    }
    const orgKey = `synqdrive:ai-chat:concurrent:org:${slot.organizationId}`;
    const userKey = `synqdrive:ai-chat:concurrent:user:${slot.userId}`;
    try {
      await Promise.all([
        this.redis.eval(RELEASE_SLOT_SCRIPT, 1, orgKey),
        this.redis.eval(RELEASE_SLOT_SCRIPT, 1, userKey),
      ]);
    } catch (err: unknown) {
      if (!this.aiConfiguration.agentLimitsFailOpen) {
        throw err;
      }
      this.logger.warn(
        `AI concurrency release failed — swallowed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
