import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import operatorSecurityConfig from '@config/operator-security.config';
import { RedisService } from '@shared/redis/redis.service';
import { OperatorRateLimitedException } from './operator-security.errors';

export type OperatorRateLimitAction = 'scan' | 'completion' | 'verification';

@Injectable()
export class OperatorRateLimitService {
  private readonly logger = new Logger(OperatorRateLimitService.name);

  constructor(
    @Inject(operatorSecurityConfig.KEY)
    private readonly config: ConfigType<typeof operatorSecurityConfig>,
    private readonly redis: RedisService,
  ) {}

  async assertAllowed(input: {
    organizationId: string;
    userId?: string | null;
    action: OperatorRateLimitAction;
  }): Promise<void> {
    if (!this.config.rateLimitEnabled) return;
    if (!input.userId) return;

    const limit = this.resolveLimit(input.action);
    const windowMs = this.config.rateLimitWindowMs;
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `synqdrive:operator:rate:${input.action}:${input.organizationId}:${input.userId}:${bucket}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, Math.ceil(windowMs / 1000) + 5);
      }
      if (count > limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((windowMs - (Date.now() % windowMs)) / 1000),
        );
        throw new OperatorRateLimitedException(retryAfterSeconds, input.action);
      }
    } catch (error) {
      if (error instanceof OperatorRateLimitedException) throw error;
      this.logger.warn(
        `Operator rate-limit check failed for action=${input.action} — allowing request (fail-open): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolveLimit(action: OperatorRateLimitAction): number {
    switch (action) {
      case 'scan':
        return this.config.scanMaxPerUserPerWindow;
      case 'completion':
        return this.config.completionMaxPerUserPerWindow;
      case 'verification':
        return this.config.verificationMaxPerUserPerWindow;
      default:
        return this.config.completionMaxPerUserPerWindow;
    }
  }
}
