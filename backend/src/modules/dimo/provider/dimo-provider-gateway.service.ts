import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import dimoProviderLimiterConfig from '@config/dimo-provider-limiter.config';
import type { DimoProviderExecuteParams } from './dimo-provider-gateway.types';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import { DimoProviderMetricsService } from './dimo-provider-metrics.service';
import {
  defaultProviderPriority,
  resolveProviderCategory,
} from './dimo-provider-category.util';
import {
  classifyDimoProviderHttpError,
  successHttpObservation,
} from './dimo-provider-http-classifier';
import type { DimoProviderLimiterBeginResult } from './dimo-provider-limiter.types';
import { DimoProviderLimiterDecision } from './dimo-provider-limiter.types';

/**
 * Canonical outbound DIMO provider gateway (P1.3).
 *
 * S2: Redis-backed limiter in SHADOW mode by default — evaluates rate/in-flight
 * budgets, records observability, but never blocks provider traffic unless
 * DIMO_PROVIDER_LIMITER_MODE=enforce is explicitly set.
 */
@Injectable()
export class DimoProviderGateway {
  private readonly logger = new Logger(DimoProviderGateway.name);

  constructor(
    @Inject(dimoProviderLimiterConfig.KEY)
    private readonly limiterConfig: ConfigType<typeof dimoProviderLimiterConfig>,
    private readonly limiter: DimoProviderLimiterService,
    @Optional() private readonly metrics?: DimoProviderMetricsService,
  ) {}

  async execute<T>(params: DimoProviderExecuteParams<T>): Promise<T> {
    const category = resolveProviderCategory(params.operation, params.category);
    const priority = params.priority ?? defaultProviderPriority(category);
    const mode = this.limiterConfig.enabled ? this.limiterConfig.mode : 'off';
    const startedAt = Date.now();

    let begin: DimoProviderLimiterBeginResult = {
      leaseId: null,
      mode,
      rateDecision: DimoProviderLimiterDecision.BYPASS,
      inFlightDecision: DimoProviderLimiterDecision.BYPASS,
      rateWindowCount: 0,
      rateWindowLimit: this.limiterConfig.rateLimitPerSecond + this.limiterConfig.rateBurst,
      inFlightCount: 0,
      inFlightLimit: this.limiterConfig.maxInFlight,
      redisFailOpen: false,
    };

    if (mode !== 'off') {
      begin = await this.limiter.begin({
        mode,
        category,
        priority,
        rateLimitPerSecond: this.limiterConfig.rateLimitPerSecond,
        rateBurst: this.limiterConfig.rateBurst,
        maxInFlight: this.limiterConfig.maxInFlight,
        inFlightLeaseMs: this.limiterConfig.inFlightLeaseMs,
      });

      if (
        mode === 'enforce' &&
        (begin.rateDecision === DimoProviderLimiterDecision.WOULD_REJECT ||
          begin.inFlightDecision === DimoProviderLimiterDecision.WOULD_REJECT)
      ) {
        this.metrics?.recordRequest({
          category,
          mode,
          begin,
          durationMs: Date.now() - startedAt,
          http: { statusClass: 'client_error' },
        });
        throw new Error(
          `DIMO provider limiter rejected request category=${category} rate=${begin.rateDecision} inflight=${begin.inFlightDecision}`,
        );
      }
    }

    try {
      const result = await params.invoke();
      this.metrics?.recordRequest({
        category,
        mode,
        begin,
        durationMs: Date.now() - startedAt,
        http: successHttpObservation(),
      });
      return result;
    } catch (error) {
      const http = classifyDimoProviderHttpError(error);
      if (http.retryAfterSeconds != null) {
        this.logger.debug(
          `DIMO provider HTTP 429 category=${category} retryAfter=${http.retryAfterSeconds}s`,
        );
      }
      if (http.statusClass === 'forbidden') {
        this.logger.debug(`DIMO provider HTTP 403 category=${category} (non-retryable)`);
      }
      this.metrics?.recordRequest({
        category,
        mode,
        begin,
        durationMs: Date.now() - startedAt,
        http,
      });
      throw error;
    } finally {
      await this.limiter.end(begin.leaseId);
    }
  }
}
