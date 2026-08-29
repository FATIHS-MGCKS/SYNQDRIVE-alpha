import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type {
  DimoProviderHttpObservation,
  DimoProviderLimiterBeginResult,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';
import { DimoProviderRequestCategory } from './dimo-provider-limiter.types';
import type { DimoProviderLimiterMode } from '@config/dimo-provider-limiter.config';

export interface DimoProviderMetricsRecordInput {
  category: DimoProviderRequestCategory;
  priority: DimoProviderRequestPriority;
  mode: DimoProviderLimiterMode;
  begin: DimoProviderLimiterBeginResult;
  durationMs: number;
  http: DimoProviderHttpObservation;
}

export interface DimoProviderAdmissionWaitInput {
  category: DimoProviderRequestCategory;
  priority: DimoProviderRequestPriority;
  waitedMs: number;
  outcome: 'granted' | 'timeout';
}

export interface DimoProviderBackpressureInput {
  category: DimoProviderRequestCategory;
  priority: DimoProviderRequestPriority;
  reason: 'rate' | 'inflight' | 'cooldown' | 'combined';
}

export interface DimoProviderCooldownInput {
  category: DimoProviderRequestCategory;
  retryAfterSeconds: number;
}

@Injectable()
export class DimoProviderMetricsService {
  readonly requestsTotal: Counter<string>;
  readonly inFlightGauge: Gauge<string>;
  readonly shadowDecisionsTotal: Counter<string>;
  readonly rateBudgetUsage: Gauge<string>;
  readonly limiterRedisErrorsTotal: Counter<string>;
  readonly http429Total: Counter<string>;
  readonly http403Total: Counter<string>;
  readonly http5xxTotal: Counter<string>;
  readonly timeoutsTotal: Counter<string>;
  readonly requestDuration: Histogram<string>;
  readonly admissionWaitDuration: Histogram<string>;
  readonly admissionTimeoutsTotal: Counter<string>;
  readonly backpressureTotal: Counter<string>;
  readonly providerCooldownTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.requestsTotal = new Counter({
      name: 'synqdrive_dimo_provider_requests_total',
      help: 'DIMO provider gateway requests',
      labelNames: ['operation', 'mode', 'status_class', 'priority'],
      registers: [register],
    });

    this.inFlightGauge = new Gauge({
      name: 'synqdrive_dimo_provider_in_flight',
      help: 'Estimated global DIMO provider in-flight requests',
      labelNames: ['mode'],
      registers: [register],
    });

    this.shadowDecisionsTotal = new Counter({
      name: 'synqdrive_dimo_provider_shadow_decisions_total',
      help: 'DIMO provider limiter shadow decisions',
      labelNames: ['operation', 'decision_type', 'decision'],
      registers: [register],
    });

    this.rateBudgetUsage = new Gauge({
      name: 'synqdrive_dimo_provider_rate_budget_usage',
      help: 'Current second rate window usage vs configured budget',
      labelNames: ['mode'],
      registers: [register],
    });

    this.limiterRedisErrorsTotal = new Counter({
      name: 'synqdrive_dimo_provider_limiter_redis_errors_total',
      help: 'DIMO provider limiter Redis failures (fail-open)',
      registers: [register],
    });

    this.http429Total = new Counter({
      name: 'synqdrive_dimo_provider_http_429_total',
      help: 'DIMO provider HTTP 429 responses',
      labelNames: ['operation'],
      registers: [register],
    });

    this.http403Total = new Counter({
      name: 'synqdrive_dimo_provider_http_403_total',
      help: 'DIMO provider HTTP 403 responses',
      labelNames: ['operation'],
      registers: [register],
    });

    this.http5xxTotal = new Counter({
      name: 'synqdrive_dimo_provider_http_5xx_total',
      help: 'DIMO provider HTTP 5xx responses',
      labelNames: ['operation'],
      registers: [register],
    });

    this.timeoutsTotal = new Counter({
      name: 'synqdrive_dimo_provider_timeouts_total',
      help: 'DIMO provider request timeouts',
      labelNames: ['operation'],
      registers: [register],
    });

    this.requestDuration = new Histogram({
      name: 'synqdrive_dimo_provider_request_duration_seconds',
      help: 'DIMO provider gateway request duration',
      labelNames: ['operation', 'status_class', 'priority'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30],
      registers: [register],
    });

    this.admissionWaitDuration = new Histogram({
      name: 'synqdrive_dimo_provider_admission_wait_seconds',
      help: 'DIMO provider admission wait before invoke (enforce mode)',
      labelNames: ['operation', 'priority', 'outcome'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers: [register],
    });

    this.admissionTimeoutsTotal = new Counter({
      name: 'synqdrive_dimo_provider_admission_timeouts_total',
      help: 'DIMO provider admission wait budget exceeded',
      labelNames: ['operation', 'priority', 'reason'],
      registers: [register],
    });

    this.backpressureTotal = new Counter({
      name: 'synqdrive_dimo_provider_backpressure_total',
      help: 'DIMO provider admission backpressure poll iterations',
      labelNames: ['operation', 'priority', 'reason'],
      registers: [register],
    });

    this.providerCooldownTotal = new Counter({
      name: 'synqdrive_dimo_provider_cooldown_total',
      help: 'DIMO provider Retry-After cooldown activations',
      labelNames: ['operation'],
      registers: [register],
    });
  }

  recordRequest(input: DimoProviderMetricsRecordInput): void {
    const op = input.category;
    const mode = input.mode;
    const status = input.http.statusClass;
    const priority = input.priority;

    this.requestsTotal.inc({ operation: op, mode, status_class: status, priority });
    this.requestDuration.observe(
      { operation: op, status_class: status, priority },
      input.durationMs / 1000,
    );

    if (input.begin.redisFailOpen) {
      this.limiterRedisErrorsTotal.inc();
    }

    if (mode !== 'off') {
      this.inFlightGauge.set({ mode }, input.begin.inFlightCount);
      this.rateBudgetUsage.set(
        { mode },
        input.begin.rateWindowLimit > 0
          ? input.begin.rateWindowCount / input.begin.rateWindowLimit
          : 0,
      );

      this.shadowDecisionsTotal.inc({
        operation: op,
        decision_type: 'rate',
        decision: input.begin.rateDecision,
      });
      this.shadowDecisionsTotal.inc({
        operation: op,
        decision_type: 'inflight',
        decision: input.begin.inFlightDecision,
      });
    }

    if (input.http.statusClass === 'rate_limited') {
      this.http429Total.inc({ operation: op });
    }
    if (input.http.statusClass === 'forbidden') {
      this.http403Total.inc({ operation: op });
    }
    if (input.http.statusClass === 'server_error') {
      this.http5xxTotal.inc({ operation: op });
    }
    if (input.http.statusClass === 'timeout') {
      this.timeoutsTotal.inc({ operation: op });
    }
  }

  recordAdmissionWait(input: DimoProviderAdmissionWaitInput): void {
    this.admissionWaitDuration.observe(
      {
        operation: input.category,
        priority: input.priority,
        outcome: input.outcome,
      },
      input.waitedMs / 1000,
    );
    if (input.outcome === 'timeout') {
      this.admissionTimeoutsTotal.inc({
        operation: input.category,
        priority: input.priority,
        reason: 'combined',
      });
    }
  }

  recordBackpressure(input: DimoProviderBackpressureInput): void {
    this.backpressureTotal.inc({
      operation: input.category,
      priority: input.priority,
      reason: input.reason,
    });
  }

  recordProviderCooldown(input: DimoProviderCooldownInput): void {
    this.providerCooldownTotal.inc({ operation: input.category });
  }
}
