import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { RedisService } from '@shared/redis/redis.service';
import type { AiAgentLimitDecision } from './ai-agent-limit.types';

const RATE_PREFIX = 'synqdrive:ai-chat:rate:';

type RateScope = 'organization' | 'user' | 'ip';

@Injectable()
export class AiAgentRateLimitService {
  private readonly logger = new Logger(AiAgentRateLimitService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
    private readonly redis: RedisService,
  ) {}

  async assertWithinLimits(input: {
    organizationId: string;
    userId: string;
    clientIp?: string | null;
  }): Promise<Extract<AiAgentLimitDecision, { allowed: false }> | null> {
    if (!this.aiConfiguration.agentLimitsEnabled || !this.aiConfiguration.agentRateLimitEnabled) {
      return null;
    }

    const windowMs = this.aiConfiguration.agentRateLimitWindowMs;
    const bucket = Math.floor(Date.now() / windowMs);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (Date.now() % windowMs)) / 1000),
    );

    const scopes: Array<{ scope: RateScope; keyId: string; limit: number }> = [
      {
        scope: 'organization',
        keyId: input.organizationId,
        limit: this.aiConfiguration.agentRateLimitPerOrgPerMinute,
      },
      {
        scope: 'user',
        keyId: input.userId,
        limit: this.aiConfiguration.agentRateLimitPerUserPerMinute,
      },
    ];

    const clientIp = normalizeClientIp(input.clientIp);
    if (clientIp) {
      scopes.push({
        scope: 'ip',
        keyId: clientIp,
        limit: this.aiConfiguration.agentRateLimitPerIpPerMinute,
      });
    }

    for (const entry of scopes) {
      const violation = await this.consume(entry.scope, entry.keyId, bucket, entry.limit, windowMs);
      if (violation) {
        return {
          allowed: false,
          kind: 'rate_limit',
          retryAfterSeconds,
          scope: entry.scope,
          message: {
            de: 'Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.',
            en: 'Too many requests. Please wait a moment and try again.',
          },
        };
      }
    }

    return null;
  }

  private async consume(
    scope: RateScope,
    keyId: string,
    bucket: number,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const key = `${RATE_PREFIX}${scope}:${keyId}:${bucket}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.pexpire(key, windowMs + 5_000);
      }
      return count > limit;
    } catch (err: unknown) {
      if (this.aiConfiguration.agentLimitsFailOpen) {
        this.logger.warn(
          `AI rate limit check failed scope=${scope} — fail-open: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return false;
      }
      throw err;
    }
  }
}

export function normalizeClientIp(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}
