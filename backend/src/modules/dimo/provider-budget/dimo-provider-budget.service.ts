import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '@shared/redis/redis.service';
import dimoProviderBudgetConfig, {
  validateDimoProviderBudgetConfig,
} from './dimo-provider-budget.config';
import {
  DIMO_BUDGET_ACQUIRE_SCRIPT,
  DIMO_BUDGET_COOLDOWN_KEY,
  DIMO_BUDGET_IN_FLIGHT_SCRIPT,
  DIMO_BUDGET_LEASES_KEY,
  DIMO_BUDGET_RELEASE_SCRIPT,
  DIMO_BUDGET_429_WINDOW_KEY,
} from './dimo-provider-budget.redis';
import {
  DEFAULT_CATEGORY_PRIORITY,
  DIMO_PRIORITY_NUMERIC,
  type DimoProviderCategory,
  type DimoProviderPriority,
} from './dimo-provider-category.types';
import { DimoProviderBudgetError } from './dimo-http-error.util';
import { sleep } from './dimo-http-error.util';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { registerDimoProviderMetrics } from './dimo-provider-prometheus.metrics';

export interface DimoProviderPermit {
  token: string;
  category: DimoProviderCategory;
  acquiredAt: number;
}

export interface AcquirePermitOptions {
  category: DimoProviderCategory;
  priority?: DimoProviderPriority;
  acquireTimeoutMs?: number;
  leaseMs?: number;
  waitStartedAt?: number;
}

@Injectable()
export class DimoProviderBudgetService implements OnModuleInit {
  private readonly logger = new Logger(DimoProviderBudgetService.name);
  private metrics!: ReturnType<typeof registerDimoProviderMetrics>;

  constructor(
    @Inject(dimoProviderBudgetConfig.KEY)
    private readonly config: ConfigType<typeof dimoProviderBudgetConfig>,
    private readonly redis: RedisService,
    private readonly tripMetrics: TripMetricsService,
  ) {}

  onModuleInit(): void {
    const errors = validateDimoProviderBudgetConfig(this.config);
    if (errors.length > 0) {
      throw new Error(`Invalid DIMO provider budget config: ${errors.join('; ')}`);
    }

    this.metrics = registerDimoProviderMetrics(this.tripMetrics.registry);
    this.metrics.globalLimit.set(this.config.globalMaxInFlight);

    if (!this.config.globalBudgetEnabled) {
      this.logger.warn(
        'DIMO_GLOBAL_BUDGET_ENABLED=false — N≈1000 certification is VOID; provider concurrency is not globally bounded',
      );
    } else {
      this.logger.log(
        `DIMO global provider budget enabled — maxInFlight=${this.config.globalMaxInFlight} acquireTimeoutMs=${this.config.globalAcquireTimeoutMs} leaseMs=${this.config.globalLeaseMs} reservedHighSlots=${this.config.reservedHighPrioritySlots}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.config.globalBudgetEnabled;
  }

  getConfig() {
    return this.config;
  }

  getMetrics() {
    return this.metrics;
  }

  resolvePriority(
    category: DimoProviderCategory,
    priority?: DimoProviderPriority,
    waitedMs = 0,
  ): DimoProviderPriority {
    let resolved = priority ?? DEFAULT_CATEGORY_PRIORITY[category];
    if (
      waitedMs >= this.config.starvationPromotionMs &&
      (resolved === 'LOW' || resolved === 'BACKGROUND')
    ) {
      resolved = resolved === 'BACKGROUND' ? 'LOW' : 'NORMAL';
    }
    return resolved;
  }

  async acquirePermit(options: AcquirePermitOptions): Promise<DimoProviderPermit> {
    if (!this.config.globalBudgetEnabled) {
      return {
        token: 'budget-disabled',
        category: options.category,
        acquiredAt: Date.now(),
      };
    }

    const startedAt = options.waitStartedAt ?? Date.now();
    const deadline =
      startedAt + (options.acquireTimeoutMs ?? this.config.globalAcquireTimeoutMs);
    const leaseMs = options.leaseMs ?? this.config.globalLeaseMs;
    const lowPriorityCap = Math.max(
      1,
      this.config.globalMaxInFlight - this.config.reservedHighPrioritySlots,
    );

    while (Date.now() < deadline) {
      const waitedMs = Date.now() - startedAt;
      const priority = this.resolvePriority(
        options.category,
        options.priority,
        waitedMs,
      );
      const priorityNumeric = DIMO_PRIORITY_NUMERIC[priority];
      const now = Date.now();
      const leaseExpiry = now + leaseMs;
      const token = randomUUID();

      try {
        const result = (await this.redis.eval(
          DIMO_BUDGET_ACQUIRE_SCRIPT,
          2,
          DIMO_BUDGET_LEASES_KEY,
          DIMO_BUDGET_COOLDOWN_KEY,
          String(now),
          String(leaseExpiry),
          String(this.config.globalMaxInFlight),
          token,
          String(priorityNumeric),
          String(lowPriorityCap),
        )) as [number, string];

        const ok = Number(result[0]) === 1;
        if (ok) {
          this.metrics.acquireWaitSeconds.observe(waitedMs / 1000);
          await this.refreshInFlightGauge(now);
          return { token, category: options.category, acquiredAt: now };
        }

        const reason = result[1];
        if (reason === 'cooldown') {
          this.metrics.providerCooldownActive.set(1);
        }
      } catch (err) {
        this.metrics.redisUnavailableTotal.inc();
        this.logger.warn(
          `DIMO budget Redis acquire failed (${options.category}): ${(err as Error).message}`,
        );
        throw new DimoProviderBudgetError(
          'Redis unavailable for DIMO provider budget',
          'REDIS_UNAVAILABLE',
          options.category,
        );
      }

      await sleep(this.config.acquirePollIntervalMs);
    }

    this.metrics.acquireTimeoutTotal.inc({ category: options.category });
    throw new DimoProviderBudgetError(
      `Timed out waiting for DIMO provider permit (${options.category})`,
      'ACQUIRE_TIMEOUT',
      options.category,
    );
  }

  async releasePermit(permit: DimoProviderPermit): Promise<void> {
    if (!this.config.globalBudgetEnabled || permit.token === 'budget-disabled') {
      return;
    }

    try {
      await this.redis.eval(
        DIMO_BUDGET_RELEASE_SCRIPT,
        1,
        DIMO_BUDGET_LEASES_KEY,
        permit.token,
      );
      await this.refreshInFlightGauge(Date.now());
    } catch (err) {
      this.logger.warn(
        `DIMO budget release failed token=${permit.token}: ${(err as Error).message}`,
      );
    }
  }

  async record429(category: DimoProviderCategory, retryAfterMs: number): Promise<void> {
    this.metrics.rateLimitedTotal.inc({ category });
    this.metrics.retryAfterSeconds.observe(retryAfterMs / 1000);

    const now = Date.now();
    const windowKey = `${DIMO_BUDGET_429_WINDOW_KEY}:${Math.floor(now / 60_000)}`;
    try {
      const count = await this.redis.incr(windowKey);
      if (count === 1) {
        await this.redis.expire(windowKey, 120);
      }
      if (count >= this.config.providerCooldown429Threshold) {
        const until = now + this.config.providerCooldownMs;
        await this.redis.set(
          DIMO_BUDGET_COOLDOWN_KEY,
          String(until),
          'PX',
          this.config.providerCooldownMs,
        );
        this.metrics.providerCooldownActive.set(1);
        this.logger.warn(
          `DIMO provider cooldown activated for ${this.config.providerCooldownMs}ms after ${count} 429s in window`,
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to record DIMO 429 window: ${(err as Error).message}`);
    }
  }

  async getInFlightCount(): Promise<number> {
    try {
      const count = await this.redis.eval(
        DIMO_BUDGET_IN_FLIGHT_SCRIPT,
        1,
        DIMO_BUDGET_LEASES_KEY,
        String(Date.now()),
      );
      return Number(count) || 0;
    } catch {
      return -1;
    }
  }

  private async refreshInFlightGauge(nowMs: number): Promise<void> {
    try {
      const count = await this.redis.eval(
        DIMO_BUDGET_IN_FLIGHT_SCRIPT,
        1,
        DIMO_BUDGET_LEASES_KEY,
        String(nowMs),
      );
      this.metrics.globalInFlight.set(Number(count) || 0);
    } catch {
      // best-effort gauge
    }
  }
}
