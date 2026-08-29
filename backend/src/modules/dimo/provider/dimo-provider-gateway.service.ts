import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import dimoProviderLimiterConfig from '@config/dimo-provider-limiter.config';
import type { DimoProviderExecuteParams } from './dimo-provider-gateway.types';
import { DimoProviderAdmissionService } from './dimo-provider-admission.service';
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
 * S3: priority-aware admission with bounded backpressure in enforce mode.
 * Default remains shadow — no production throttling unless explicitly configured.
 */
@Injectable()
export class DimoProviderGateway implements OnModuleInit {
  private readonly logger = new Logger(DimoProviderGateway.name);

  constructor(
    @Inject(dimoProviderLimiterConfig.KEY)
    private readonly limiterConfig: ConfigType<typeof dimoProviderLimiterConfig>,
    private readonly admission: DimoProviderAdmissionService,
    private readonly limiter: DimoProviderLimiterService,
    @Optional() private readonly metrics?: DimoProviderMetricsService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `DIMO provider limiter mode=${this.limiterConfig.mode} enabled=${this.limiterConfig.enabled} ` +
        `rate=${this.limiterConfig.rateLimitPerSecond}/s+burst${this.limiterConfig.rateBurst} ` +
        `maxInFlight=${this.limiterConfig.maxInFlight} reservedHigh=${this.limiterConfig.reservedHighPrioritySlots} ` +
        `maxWaitMs=${this.limiterConfig.maxWaitMs}`,
    );
  }

  async execute<T>(params: DimoProviderExecuteParams<T>): Promise<T> {
    const category = resolveProviderCategory(params.operation, params.category);
    const priority = params.priority ?? defaultProviderPriority(category);
    const mode = this.limiterConfig.enabled ? this.limiterConfig.mode : 'off';
    const startedAt = Date.now();

    let begin: DimoProviderLimiterBeginResult = {
      leaseId: null,
      inFlightMember: null,
      mode,
      rateDecision: DimoProviderLimiterDecision.BYPASS,
      inFlightDecision: DimoProviderLimiterDecision.BYPASS,
      rateWindowCount: 0,
      rateWindowLimit: this.limiterConfig.rateLimitPerSecond + this.limiterConfig.rateBurst,
      inFlightCount: 0,
      inFlightLimit: this.limiterConfig.maxInFlight,
      redisFailOpen: false,
    };

    const beginInput = {
      mode,
      category,
      priority,
      rateLimitPerSecond: this.limiterConfig.rateLimitPerSecond,
      rateBurst: this.limiterConfig.rateBurst,
      maxInFlight: this.limiterConfig.maxInFlight,
      inFlightLeaseMs: this.limiterConfig.inFlightLeaseMs,
      reservedHighPrioritySlots: this.limiterConfig.reservedHighPrioritySlots,
    };

    if (mode !== 'off') {
      begin = await this.admission.acquire(beginInput, { signal: params.signal });
    }

    try {
      const result = await params.invoke();
      this.metrics?.recordRequest({
        category,
        priority,
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
        await this.limiter.setProviderCooldown(
          http.retryAfterSeconds,
          this.limiterConfig.retryAfterMaxSeconds,
        );
        this.metrics?.recordProviderCooldown({
          category,
          retryAfterSeconds: http.retryAfterSeconds,
        });
      }
      if (http.statusClass === 'forbidden') {
        this.logger.debug(`DIMO provider HTTP 403 category=${category} (non-retryable)`);
      }
      this.metrics?.recordRequest({
        category,
        priority,
        mode,
        begin,
        durationMs: Date.now() - startedAt,
        http,
      });
      throw error;
    } finally {
      await this.limiter.end(begin.inFlightMember);
    }
  }
}
