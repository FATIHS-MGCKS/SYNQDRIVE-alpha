import type { Registry } from 'prom-client';
import { Counter, Gauge, Histogram } from 'prom-client';

export interface DimoProviderMetricsHandles {
  globalInFlight: Gauge<string>;
  globalLimit: Gauge<string>;
  acquireWaitSeconds: Histogram<string>;
  acquireTimeoutTotal: Counter<string>;
  requestsTotal: Counter<string>;
  rateLimitedTotal: Counter<string>;
  retryAfterSeconds: Histogram<string>;
  requestDurationSeconds: Histogram<string>;
  redisUnavailableTotal: Counter<string>;
  providerCooldownActive: Gauge<string>;
}

export function registerDimoProviderMetrics(registry: Registry): DimoProviderMetricsHandles {
  const globalInFlight = new Gauge({
    name: 'synqdrive_dimo_global_in_flight',
    help: 'Current globally leased DIMO provider in-flight requests',
    registers: [registry],
  });

  const globalLimit = new Gauge({
    name: 'synqdrive_dimo_global_limit',
    help: 'Configured global DIMO provider in-flight limit',
    registers: [registry],
  });

  const acquireWaitSeconds = new Histogram({
    name: 'synqdrive_dimo_acquire_wait_seconds',
    help: 'Time spent waiting for a global DIMO provider permit',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30],
    registers: [registry],
  });

  const acquireTimeoutTotal = new Counter({
    name: 'synqdrive_dimo_acquire_timeout_total',
    help: 'Global DIMO permit acquire timeouts',
    labelNames: ['category'],
    registers: [registry],
  });

  const requestsTotal = new Counter({
    name: 'synqdrive_dimo_requests_total',
    help: 'DIMO provider HTTP requests through global budget',
    labelNames: ['category', 'result'],
    registers: [registry],
  });

  const rateLimitedTotal = new Counter({
    name: 'synqdrive_dimo_429_total',
    help: 'DIMO HTTP 429 responses',
    labelNames: ['category'],
    registers: [registry],
  });

  const retryAfterSeconds = new Histogram({
    name: 'synqdrive_dimo_retry_after_seconds',
    help: 'Observed Retry-After delay for DIMO 429 responses',
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
    registers: [registry],
  });

  const requestDurationSeconds = new Histogram({
    name: 'synqdrive_dimo_request_duration_seconds',
    help: 'DIMO provider HTTP request duration',
    labelNames: ['category'],
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30],
    registers: [registry],
  });

  const redisUnavailableTotal = new Counter({
    name: 'synqdrive_dimo_budget_redis_unavailable_total',
    help: 'Redis failures while acquiring DIMO provider permits',
    registers: [registry],
  });

  const providerCooldownActive = new Gauge({
    name: 'synqdrive_dimo_global_budget_cooldown_active',
    help: '1 when global DIMO budget cooldown is active after 429 pressure',
    registers: [registry],
  });

  return {
    globalInFlight,
    globalLimit,
    acquireWaitSeconds,
    acquireTimeoutTotal,
    requestsTotal,
    rateLimitedTotal,
    retryAfterSeconds,
    requestDurationSeconds,
    redisUnavailableTotal,
    providerCooldownActive,
  };
}
