import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import { DimoProviderMetricsService } from './dimo-provider-metrics.service';
import {
  DIMO_PROVIDER_COOLDOWN_SET_SCRIPT,
  dimoProviderCooldownKey,
} from './dimo-provider-limiter.redis-scripts';
import {
  DimoProviderLimiterDecision,
  DimoProviderRequestCategory,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';

function createCooldownRedisStore() {
  const strings = new Map<string, string>();

  const evalFn = jest.fn(async (script: string, _numKeys: number, ...args: string[]) => {
    if (script === DIMO_PROVIDER_COOLDOWN_SET_SCRIPT) {
      const key = args[0];
      const newEndMs = Number.parseInt(args[1], 10);
      const newTtlSec = Number.parseInt(args[2], 10);
      const nowMs = Number.parseInt(args[3], 10);
      let endMs = newEndMs;
      const existing = strings.get(key);
      if (existing) {
        const existingEnd = Number.parseInt(existing, 10);
        if (Number.isFinite(existingEnd) && existingEnd > endMs) {
          endMs = existingEnd;
        }
      }
      const ttlSec = Math.max(newTtlSec, Math.ceil((endMs - nowMs) / 1000));
      strings.set(key, String(endMs));
      return endMs;
    }
    throw new Error(`Unknown script in cooldown test store: ${script.slice(0, 40)}`);
  });

  return {
    redis: {
      eval: evalFn,
      get: jest.fn(async (key: string) => strings.get(key) ?? null),
    },
    strings,
  };
}

function createMetricsSpy() {
  const metrics = {
    recordCooldownActive: jest.fn(),
    recordCooldownCleared: jest.fn(),
  } as unknown as DimoProviderMetricsService;
  return metrics;
}

describe('DimoProviderLimiterService cooldown gauge lifecycle (P1-002)', () => {
  const baseInput = {
    mode: 'shadow' as const,
    category: DimoProviderRequestCategory.TELEMETRY_GRAPHQL,
    priority: DimoProviderRequestPriority.P3_NORMAL,
    rateLimitPerSecond: 20,
    rateBurst: 5,
    rateAlgorithm: 'token_bucket' as const,
    maxInFlight: 40,
    inFlightLeaseMs: 45_000,
    reservedHighPrioritySlots: 12,
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('A — 429 activation sets cooldown gauge active', async () => {
    const { redis } = createCooldownRedisStore();
    const metrics = createMetricsSpy();
    const svc = new DimoProviderLimiterService(redis as never, metrics);

    await svc.setProviderCooldown(30, 120);

    expect(metrics.recordCooldownActive).toHaveBeenCalledWith(30);
  });

  it('B — begin during cooldown keeps gauge active with remaining seconds', async () => {
    const { redis, strings } = createCooldownRedisStore();
    const metrics = createMetricsSpy();
    const svc = new DimoProviderLimiterService(redis as never, metrics);
    const nowMs = Date.now();
    const endsAtMs = nowMs + 15_000;
    strings.set(dimoProviderCooldownKey(), String(endsAtMs));

    const begin = await svc.begin(baseInput);

    expect(begin.providerCooldownActive).toBe(true);
    expect(metrics.recordCooldownActive).toHaveBeenCalledWith(15);
    expect(metrics.recordCooldownCleared).not.toHaveBeenCalled();
  });

  it('C — after expiry begin clears cooldown gauge', async () => {
    const metrics = createMetricsSpy();
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      eval: jest
        .fn()
        .mockResolvedValueOnce([1, 25, 'allow', 24])
        .mockResolvedValueOnce([1, 40, 'allow', 1, 0]),
    };
    const svc = new DimoProviderLimiterService(redis as never, metrics);

    await svc.begin(baseInput);

    expect(metrics.recordCooldownCleared).toHaveBeenCalled();
    expect(metrics.recordCooldownActive).not.toHaveBeenCalled();
  });

  it('D — repeated 429 extends cooldown end timestamp', async () => {
    const { redis, strings } = createCooldownRedisStore();
    const svc = new DimoProviderLimiterService(redis as never);

    const t0 = 1_700_000_000_000;
    jest.setSystemTime(t0);
    await svc.setProviderCooldown(10, 120);
    const firstEnd = Number.parseInt(strings.get(dimoProviderCooldownKey()) ?? '0', 10);

    jest.setSystemTime(t0 + 5_000);
    await svc.setProviderCooldown(10, 120);
    const secondEnd = Number.parseInt(strings.get(dimoProviderCooldownKey()) ?? '0', 10);

    expect(secondEnd).toBeGreaterThan(firstEnd);
  });

  it('E — two replicas observe the same shared cooldown state', async () => {
    const { redis, strings } = createCooldownRedisStore();
    const replicaA = new DimoProviderLimiterService(redis as never);
    const replicaB = new DimoProviderLimiterService(redis as never);
    const endsAtMs = Date.now() + 20_000;
    strings.set(dimoProviderCooldownKey(), String(endsAtMs));

    const a = await replicaA.begin(baseInput);
    const b = await replicaB.begin(baseInput);

    expect(a.providerCooldownActive).toBe(true);
    expect(b.providerCooldownActive).toBe(true);
    expect(a.wouldDelayMs).toBe(b.wouldDelayMs);
  });

  it('F — cooldown wait does not acquire in-flight lease (no retry storm)', async () => {
    const { redis, strings } = createCooldownRedisStore();
    const svc = new DimoProviderLimiterService(redis as never);
    strings.set(dimoProviderCooldownKey(), String(Date.now() + 30_000));

    const begin = await svc.begin(baseInput);

    expect(begin.leaseId).toBeNull();
    expect(begin.inFlightMember).toBeNull();
    expect(begin.rateDecision).toBe(DimoProviderLimiterDecision.WOULD_WAIT);
    expect(begin.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_WAIT);
  });
});
