import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import operatorSecurityConfig from '@config/operator-security.config';
import { RedisService } from '@shared/redis/redis.service';
import {
  buildOperatorIdempotencyLockKey,
  buildOperatorIdempotencyRedisKey,
} from './operator-idempotency.util';
import { OperatorIdempotencyConflictException } from './operator-security.errors';

type CachedOperatorResponse = {
  statusCode: number;
  body: unknown;
};

@Injectable()
export class OperatorIdempotencyService {
  private readonly logger = new Logger(OperatorIdempotencyService.name);

  constructor(
    @Inject(operatorSecurityConfig.KEY)
    private readonly config: ConfigType<typeof operatorSecurityConfig>,
    private readonly redis: RedisService,
  ) {}

  async execute<T>(input: {
    organizationId: string;
    scope: string;
    idempotencyKey?: string | null;
    work: () => Promise<T>;
    statusCode?: number;
  }): Promise<T> {
    const key = input.idempotencyKey?.trim();
    if (!this.config.idempotencyEnabled || !key) {
      return input.work();
    }

    const redisKey = buildOperatorIdempotencyRedisKey(input.organizationId, input.scope, key);
    const lockKey = buildOperatorIdempotencyLockKey(redisKey);

    try {
      const cachedRaw = await this.redis.get(redisKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as CachedOperatorResponse;
        return cached.body as T;
      }

      const lockAcquired = await this.redis.set(
        lockKey,
        '1',
        'EX',
        this.config.idempotencyLockTtlSeconds,
        'NX',
      );
      if (!lockAcquired) {
        const retryCached = await this.redis.get(redisKey);
        if (retryCached) {
          const cached = JSON.parse(retryCached) as CachedOperatorResponse;
          return cached.body as T;
        }
        throw new OperatorIdempotencyConflictException();
      }

      const result = await input.work();
      const payload: CachedOperatorResponse = {
        statusCode: input.statusCode ?? 200,
        body: result,
      };
      await this.redis.set(
        redisKey,
        JSON.stringify(payload),
        'EX',
        this.config.idempotencyTtlSeconds,
      );
      await this.redis.del(lockKey);
      return result;
    } catch (error) {
      if (!(error instanceof OperatorIdempotencyConflictException)) {
        await this.redis.del(lockKey).catch(() => undefined);
      }
      if (error instanceof OperatorIdempotencyConflictException) throw error;
      this.logger.warn(
        `Operator idempotency failed for scope=${input.scope} — running without cache: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return input.work();
    }
  }
}
