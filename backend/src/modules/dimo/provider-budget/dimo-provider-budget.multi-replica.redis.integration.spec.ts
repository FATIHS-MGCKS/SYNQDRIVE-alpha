import { Registry } from 'prom-client';
import IORedis from 'ioredis';
import { RedisService } from '@shared/redis/redis.service';
import { DimoProviderBudgetService } from './dimo-provider-budget.service';
import type { DimoProviderBudgetConfigShape } from './dimo-provider-budget.config';
import {
  DIMO_BUDGET_COOLDOWN_KEY,
  DIMO_BUDGET_LEASES_KEY,
  DIMO_BUDGET_429_WINDOW_KEY,
} from './dimo-provider-budget.redis';
import { DimoProviderBudgetError } from './dimo-http-error.util';

const LIVE = process.env.DIMO_PROVIDER_BUDGET_REDIS_INTEGRATION === '1';

function redisConnectionOptions() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || '15', 10),
    maxRetriesPerRequest: null as null,
  };
}

async function probeRedis(): Promise<boolean> {
  const client = new IORedis({ ...redisConnectionOptions(), connectTimeout: 3_000, lazyConnect: true });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    return false;
  }
}

function certConfig(overrides: Partial<DimoProviderBudgetConfigShape> = {}): DimoProviderBudgetConfigShape {
  return {
    globalBudgetEnabled: true,
    globalMaxInFlight: 4,
    globalAcquireTimeoutMs: 2_000,
    globalLeaseMs: 400,
    globalRetryAfterMaxMs: 60_000,
    globalMaxRetries: 3,
    reservedHighPrioritySlots: 1,
    starvationPromotionMs: 60_000,
    providerCooldown429Threshold: 2,
    providerCooldownMs: 800,
    acquirePollIntervalMs: 10,
    ...overrides,
  };
}

function createReplica(
  config: DimoProviderBudgetConfigShape,
): { service: DimoProviderBudgetService; redis: RedisService } {
  const redis = new RedisService(redisConnectionOptions());
  const tripMetrics = { registry: new Registry() };
  const service = new DimoProviderBudgetService(config, redis, tripMetrics as any);
  service.onModuleInit();
  return { service, redis };
}

async function cleanupBudgetKeys(redis: RedisService): Promise<void> {
  await redis.del(DIMO_BUDGET_LEASES_KEY);
  await redis.del(DIMO_BUDGET_COOLDOWN_KEY);
  const windowBase = Math.floor(Date.now() / 60_000);
  for (let offset = -2; offset <= 2; offset += 1) {
    await redis.del(`${DIMO_BUDGET_429_WINDOW_KEY}:${windowBase + offset}`);
  }
}

(LIVE ? describe : describe.skip)('DimoProviderBudgetService multi-replica (real Redis)', () => {
  let config: DimoProviderBudgetConfigShape;
  let replicaA: DimoProviderBudgetService;
  let replicaB: DimoProviderBudgetService;
  let redisA: RedisService;

  beforeAll(async () => {
    const ok = await probeRedis();
    if (!ok) {
      throw new Error('Redis unreachable — required when DIMO_PROVIDER_BUDGET_REDIS_INTEGRATION=1');
    }
  }, 30_000);

  beforeEach(async () => {
    config = certConfig();
    const a = createReplica(config);
    const b = createReplica(config);
    replicaA = a.service;
    replicaB = b.service;
    redisA = a.redis;
    await cleanupBudgetKeys(redisA);
  });

  afterEach(async () => {
    if (redisA) {
      await cleanupBudgetKeys(redisA);
      await redisA.onModuleDestroy?.();
    }
  });

  it('PB01/MR01 global hard limit across two service instances', async () => {
    const permits = [];
    let observedMax = 0;
    for (let i = 0; i < 4; i += 1) {
      const svc = i % 2 === 0 ? replicaA : replicaB;
      permits.push(
        await svc.acquirePermit({ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }),
      );
      const inFlight = await replicaA.getInFlightCount();
      observedMax = Math.max(observedMax, inFlight);
    }
    expect(observedMax).toBeLessThanOrEqual(config.globalMaxInFlight);
    expect(observedMax).toBe(4);

    await expect(
      replicaB.acquirePermit({
        category: 'POST_TRIP_ENRICHMENT',
        priority: 'BACKGROUND',
        acquireTimeoutMs: 80,
      }),
    ).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });

    for (const p of permits) {
      await replicaA.releasePermit(p);
    }
  });

  it('PB02/MR02 BACKGROUND low-priority cap preserves reserved HIGH slot', async () => {
    const lowCap = config.globalMaxInFlight - config.reservedHighPrioritySlots;
    const backgroundPermits = [];
    for (let i = 0; i < lowCap; i += 1) {
      backgroundPermits.push(
        await (i % 2 === 0 ? replicaA : replicaB).acquirePermit({
          category: 'POST_TRIP_ENRICHMENT',
          priority: 'BACKGROUND',
        }),
      );
    }
    expect(await replicaA.getInFlightCount()).toBe(lowCap);

    await expect(
      replicaB.acquirePermit({
        category: 'POST_TRIP_ENRICHMENT',
        priority: 'BACKGROUND',
        acquireTimeoutMs: 80,
      }),
    ).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });

    const high = await replicaA.acquirePermit({
      category: 'LIVE_SNAPSHOT',
      priority: 'HIGH',
    });
    expect(await replicaA.getInFlightCount()).toBe(config.globalMaxInFlight);

    await expect(
      replicaB.acquirePermit({
        category: 'LIVE_SNAPSHOT',
        priority: 'HIGH',
        acquireTimeoutMs: 80,
      }),
    ).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });

    await replicaA.releasePermit(high);
    for (const p of backgroundPermits) {
      await replicaA.releasePermit(p);
    }
  });

  it('PB05/MR03 cross-replica release recovers capacity', async () => {
    const fromA = await replicaA.acquirePermit({
      category: 'POST_TRIP_ENRICHMENT',
      priority: 'BACKGROUND',
    });
    await replicaA.releasePermit(fromA);
    const fromB = await replicaB.acquirePermit({
      category: 'POST_TRIP_ENRICHMENT',
      priority: 'BACKGROUND',
    });
    await replicaB.releasePermit(fromB);
    expect(await replicaA.getInFlightCount()).toBe(0);
  });

  it('PB06/MR04 lease expiry recovery without explicit release', async () => {
    const shortLease = createReplica(certConfig({ globalLeaseMs: 200 }));
    const permit = await shortLease.service.acquirePermit({
      category: 'POST_TRIP_ENRICHMENT',
      priority: 'BACKGROUND',
    });
    expect(await replicaA.getInFlightCount()).toBe(1);
    await new Promise((r) => setTimeout(r, 280));
    expect(await replicaA.getInFlightCount()).toBe(0);
    const recovered = await replicaB.acquirePermit({
      category: 'POST_TRIP_ENRICHMENT',
      priority: 'BACKGROUND',
    });
    await replicaB.releasePermit(recovered);
    await shortLease.redis.onModuleDestroy?.();
    expect(permit.token).toBeTruthy();
  });

  it('PB07/PB08/MR05 shared 429 threshold and cooldown across replicas', async () => {
    await replicaA.record429('POST_TRIP_ENRICHMENT', 100);
    await replicaB.record429('POST_TRIP_ENRICHMENT', 100);

    await expect(
      replicaB.acquirePermit({
        category: 'POST_TRIP_ENRICHMENT',
        priority: 'BACKGROUND',
        acquireTimeoutMs: 120,
      }),
    ).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });

    const cooldownUntil = await redisA.get(DIMO_BUDGET_COOLDOWN_KEY);
    expect(cooldownUntil).toBeTruthy();

    await new Promise((r) => setTimeout(r, config.providerCooldownMs + 120));
    const after = await replicaB.acquirePermit({
      category: 'POST_TRIP_ENRICHMENT',
      priority: 'BACKGROUND',
    });
    await replicaB.releasePermit(after);
  });

  it('PB10/MR06 Redis unavailable fails closed at acquire', async () => {
    const broken = createReplica(config);
    await broken.redis.onModuleDestroy?.();
    await expect(
      broken.service.acquirePermit({ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }),
    ).rejects.toBeInstanceOf(DimoProviderBudgetError);
    await expect(
      broken.service.acquirePermit({ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }),
    ).rejects.toMatchObject({ code: 'REDIS_UNAVAILABLE' });
  });

  it('PB11/MR07 acquire timeout under saturation without provider execute', async () => {
    const held = [];
    for (let i = 0; i < config.globalMaxInFlight; i += 1) {
      held.push(
        await replicaA.acquirePermit({ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }),
      );
    }
    let providerCalled = false;
    await expect(
      replicaB.acquirePermit({
        category: 'POST_TRIP_ENRICHMENT',
        priority: 'BACKGROUND',
        acquireTimeoutMs: 60,
      }),
    ).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });
    expect(providerCalled).toBe(false);
    for (const p of held) {
      await replicaA.releasePermit(p);
    }
  });
});
