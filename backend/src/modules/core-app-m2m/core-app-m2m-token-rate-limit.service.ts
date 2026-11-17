import { createHash } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';
import { isCoreAppM2mEnabled } from './core-app-m2m.config';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import { CoreAppM2mRateLimitedException } from './core-app-m2m-rate-limit.errors';
import {
  isCoreAppM2mRateLimitEnabled,
  resolveCoreAppM2mRateLimitMaxPerClient,
  resolveCoreAppM2mRateLimitMaxPerIp,
  resolveCoreAppM2mRateLimitRedisTimeoutMs,
  resolveCoreAppM2mRateLimitWindowMs,
} from './core-app-m2m-rate-limit.config';
import {
  CORE_APP_M2M_CONSUME_FIXED_WINDOW_SCRIPT,
  CORE_APP_M2M_RATE_LIMIT_REDIS_KEY_PREFIX,
} from './core-app-m2m-rate-limit.redis-script';
import { runWithBoundedTimeout } from './core-app-m2m-redis-eval-timeout';
import { normalizeClientId } from './core-app-service-registry.policy';

export type CoreAppM2mTokenRateLimitInput = {
  clientId: string;
  clientIp: string | null;
};

@Injectable()
export class CoreAppM2mTokenRateLimitService {
  private readonly logger = new Logger(CoreAppM2mTokenRateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Enforce distributed limits before credential verification / DB access.
   * Fail-closed when M2M runtime is enabled and Redis cannot enforce policy.
   */
  async assertBeforeTokenExchange(input: CoreAppM2mTokenRateLimitInput): Promise<void> {
    if (!isCoreAppM2mEnabled()) {
      return;
    }
    if (!isCoreAppM2mRateLimitEnabled()) {
      throw new Error(
        'CORE_APP_M2M_RATE_LIMIT_ENABLED=false is invalid while CORE_APP_M2M_ENABLED=true',
      );
    }

    const trustBoundaryIp = input.clientIp?.trim();
    if (!trustBoundaryIp) {
      this.failClosed();
    }

    const windowMs = resolveCoreAppM2mRateLimitWindowMs();
    const bucket = Math.floor(Date.now() / windowMs);
    const ttlMs = windowMs + 5_000;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (Date.now() % windowMs)) / 1000),
    );
    const redisTimeoutMs = resolveCoreAppM2mRateLimitRedisTimeoutMs();

    const scopes: Array<{ dimension: 'ip' | 'client'; keyId: string; limit: number }> = [
      {
        dimension: 'ip',
        keyId: hashRateLimitKeyPart(trustBoundaryIp),
        limit: resolveCoreAppM2mRateLimitMaxPerIp(),
      },
    ];

    const normalizedClientId = normalizeClientId(input.clientId);
    if (normalizedClientId) {
      scopes.push({
        dimension: 'client',
        keyId: hashRateLimitKeyPart(normalizedClientId),
        limit: resolveCoreAppM2mRateLimitMaxPerClient(),
      });
    }

    for (const scope of scopes) {
      const redisKey = `${CORE_APP_M2M_RATE_LIMIT_REDIS_KEY_PREFIX}:${scope.dimension}:${scope.keyId}:${bucket}`;
      try {
        const allowed = await runWithBoundedTimeout(
          () =>
            this.redis.eval(
              CORE_APP_M2M_CONSUME_FIXED_WINDOW_SCRIPT,
              1,
              redisKey,
              String(scope.limit),
              String(ttlMs),
            ) as Promise<number>,
          redisTimeoutMs,
        );
        if (allowed !== 1) {
          throw new CoreAppM2mRateLimitedException(retryAfterSeconds);
        }
      } catch (error) {
        if (error instanceof CoreAppM2mRateLimitedException) {
          throw error;
        }
        this.logger.warn(
          `Core app M2M rate limit Redis failure (fail-closed): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw new UnauthorizedException(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
      }
    }
  }

  private failClosed(): never {
    throw new UnauthorizedException(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  }
}

function hashRateLimitKeyPart(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}