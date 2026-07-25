import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { RedisService } from '@shared/redis/redis.service';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';
import type { AiDomainToolDefinition } from '../registry/ai-domain-tool-registry.types';
import { AI_GET_VEHICLE_LOCATION_TOOL } from '../tools/get-vehicle-location/ai-get-vehicle-location.types';
import type { AiGetVehicleLocationData } from '../tools/get-vehicle-location/ai-get-vehicle-location.types';

const LIVE_LOCATION_REDIS_TTL_MS = 3_000;

interface RequestCacheEntry {
  readonly outcome: AiDomainQueryOutcome<unknown>;
  readonly expiresAt: number;
}

@Injectable()
export class AiAgentToolCacheService {
  private readonly logger = new Logger(AiAgentToolCacheService.name);
  private readonly requestCache = new Map<string, RequestCacheEntry>();

  constructor(
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
    private readonly redis: RedisService,
  ) {}

  async getOrExecute(input: {
    context: AiExecutionContext;
    definition: AiDomainToolDefinition;
    cacheKeySuffix: string;
    execute: () => Promise<AiDomainQueryOutcome<unknown>>;
  }): Promise<AiDomainQueryOutcome<unknown>> {
    if (!this.aiConfiguration.agentToolCacheEnabled) {
      return input.execute();
    }

    const cacheKey = this.buildCacheKey(input.context, input.definition, input.cacheKeySuffix);
    const cached = this.getRequestCache(cacheKey, input.definition);
    if (cached) {
      return cached;
    }

    const redisCached = await this.getRedisCache(input.context, input.definition, input.cacheKeySuffix);
    if (redisCached) {
      this.setRequestCache(cacheKey, redisCached, input.definition.cacheRule.ttlMs ?? 5_000);
      return redisCached;
    }

    const outcome = await input.execute();
    await this.maybeStore(input.context, input.definition, input.cacheKeySuffix, outcome);
    return outcome;
  }

  clearRequest(correlationId: string): void {
    const prefix = `${correlationId}:`;
    for (const key of this.requestCache.keys()) {
      if (key.startsWith(prefix)) {
        this.requestCache.delete(key);
      }
    }
  }

  private getRequestCache(
    cacheKey: string,
    definition: AiDomainToolDefinition,
  ): AiDomainQueryOutcome<unknown> | null {
    const entry = this.requestCache.get(cacheKey);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.requestCache.delete(cacheKey);
      return null;
    }
    if (definition.cacheRule.policy === 'no_cache') {
      return null;
    }
    return this.sanitizeForCache(entry.outcome);
  }

  private setRequestCache(
    cacheKey: string,
    outcome: AiDomainQueryOutcome<unknown>,
    ttlMs: number,
  ): void {
    this.requestCache.set(cacheKey, {
      outcome: this.sanitizeForCache(outcome),
      expiresAt: Date.now() + ttlMs,
    });
  }

  private async getRedisCache(
    context: AiExecutionContext,
    definition: AiDomainToolDefinition,
    cacheKeySuffix: string,
  ): Promise<AiDomainQueryOutcome<unknown> | null> {
    if (definition.name !== AI_GET_VEHICLE_LOCATION_TOOL) {
      return null;
    }
    const redisKey = `synqdrive:ai-chat:tool:${context.organizationId}:${definition.name}:${cacheKeySuffix}`;
    try {
      const raw = await this.redis.get(redisKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AiDomainQueryOutcome<unknown>;
      return this.sanitizeForCache(parsed);
    } catch (err: unknown) {
      if (!this.aiConfiguration.agentLimitsFailOpen) {
        throw err;
      }
      this.logger.warn(
        `AI tool redis cache read failed — fail-open: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private async maybeStore(
    context: AiExecutionContext,
    definition: AiDomainToolDefinition,
    cacheKeySuffix: string,
    outcome: AiDomainQueryOutcome<unknown>,
  ): Promise<void> {
    if (!this.shouldCache(definition, outcome)) {
      return;
    }

    const sanitized = this.sanitizeForCache(outcome);
    const requestKey = this.buildCacheKey(context, definition, cacheKeySuffix);
    const ttlMs = this.resolveTtlMs(definition, outcome);

    if (definition.cacheRule.policy === 'request_short_ttl' && ttlMs > 0) {
      this.setRequestCache(requestKey, sanitized, ttlMs);
    }

    if (definition.name === AI_GET_VEHICLE_LOCATION_TOOL && ttlMs > 0) {
      const redisKey = `synqdrive:ai-chat:tool:${context.organizationId}:${definition.name}:${cacheKeySuffix}`;
      try {
        await this.redis.set(redisKey, JSON.stringify(sanitized), 'PX', ttlMs);
      } catch (err: unknown) {
        if (!this.aiConfiguration.agentLimitsFailOpen) {
          throw err;
        }
        this.logger.warn(
          `AI tool redis cache write failed — swallowed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private shouldCache(
    definition: AiDomainToolDefinition,
    outcome: AiDomainQueryOutcome<unknown>,
  ): boolean {
    if (definition.cacheRule.policy === 'no_cache') {
      return false;
    }
    if (outcome.errors.length > 0 && !outcome.partial) {
      return false;
    }
    if (definition.name === AI_GET_VEHICLE_LOCATION_TOOL) {
      const data = outcome.data as AiGetVehicleLocationData | null;
      if (data?.isLastKnownLocation) {
        return false;
      }
      if (data?.freshness === 'live' || data?.freshness === 'standby') {
        return true;
      }
      return false;
    }
    return definition.cacheRule.policy === 'request_short_ttl';
  }

  private resolveTtlMs(
    definition: AiDomainToolDefinition,
    outcome: AiDomainQueryOutcome<unknown>,
  ): number {
    if (definition.name === AI_GET_VEHICLE_LOCATION_TOOL) {
      const data = outcome.data as AiGetVehicleLocationData | null;
      if (data?.isLastKnownLocation) {
        return 0;
      }
      return LIVE_LOCATION_REDIS_TTL_MS;
    }
    return definition.cacheRule.ttlMs ?? 0;
  }

  private buildCacheKey(
    context: AiExecutionContext,
    definition: AiDomainToolDefinition,
    cacheKeySuffix: string,
  ): string {
    const digest = createHash('sha256')
      .update(`${context.organizationId}:${definition.name}:${cacheKeySuffix}`)
      .digest('hex')
      .slice(0, 16);
    return `${context.correlationId}:${digest}`;
  }

  private sanitizeForCache(
    outcome: AiDomainQueryOutcome<unknown>,
  ): AiDomainQueryOutcome<unknown> {
    return {
      ...outcome,
      warnings: [...outcome.warnings],
    };
  }
}
