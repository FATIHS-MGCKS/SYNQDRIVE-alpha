import IORedis from 'ioredis';
import { RedisService } from '@shared/redis/redis.service';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';
import {
  dimoProviderInflightKey,
  dimoProviderRateKey,
} from './dimo-provider-limiter.redis-scripts';
import {
  DimoProviderLimiterDecision,
  DimoProviderRequestCategory,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';
import type { DimoProviderLimiterConfigShape } from '@config/dimo-provider-limiter.config';
import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';

const LIVE = process.env.DIMO_PROVIDER_LIMITER_REDIS_INTEGRATION === '1';

function redisConnectionOptions() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
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

function createLimiterReplica(): { limiter: DimoProviderLimiterService; redis: RedisService } {
  const redis = new RedisService(redisConnectionOptions());
  return { limiter: new DimoProviderLimiterService(redis), redis };
}

async function cleanupLimiterKeys(redis: RedisService): Promise<void> {
  await redis.del(dimoProviderInflightKey());
  const epochSecond = Math.floor(Date.now() / 1000);
  for (let offset = -2; offset <= 2; offset += 1) {
    await redis.del(dimoProviderRateKey(epochSecond + offset));
  }
}

function baseBeginInput(
  overrides: Partial<Parameters<DimoProviderLimiterService['begin']>[0]> = {},
) {
  return {
    mode: 'shadow' as const,
    category: DimoProviderRequestCategory.TELEMETRY_GRAPHQL,
    priority: DimoProviderRequestPriority.P2_NORMAL,
    rateLimitPerSecond: 5,
    rateBurst: 0,
    maxInFlight: 2,
    inFlightLeaseMs: 30_000,
    ...overrides,
  };
}

(LIVE ? describe : describe.skip)(
  'DimoProviderLimiterService — real Redis distributed proof',
  () => {
    let redisOk = false;
    let replicaA: ReturnType<typeof createLimiterReplica>;
    let replicaB: ReturnType<typeof createLimiterReplica>;

    beforeAll(async () => {
      redisOk = await probeRedis();
      if (!redisOk) {
        throw new Error(
          'Redis unreachable — required when DIMO_PROVIDER_LIMITER_REDIS_INTEGRATION=1',
        );
      }
    }, 30_000);

    beforeEach(async () => {
      replicaA = createLimiterReplica();
      replicaB = createLimiterReplica();
      await cleanupLimiterKeys(replicaA.redis);
    });

    afterEach(async () => {
      if (!replicaA?.redis) return;
      await cleanupLimiterKeys(replicaA.redis);
      await replicaA.redis.quit();
      await replicaB?.redis?.quit();
    });

    it('connects to real Redis', () => {
      expect(redisOk).toBe(true);
    });

    it('A: two replicas share one global rate budget', async () => {
      const input = baseBeginInput({ rateLimitPerSecond: 3, rateBurst: 0, maxInFlight: 100 });
      const results = [];
      for (let i = 0; i < 5; i += 1) {
        const replica = i % 2 === 0 ? replicaA : replicaB;
        results.push(await replica.limiter.begin(input));
      }

      const rateAllows = results.filter(
        (r) => r.rateDecision === DimoProviderLimiterDecision.ALLOW,
      );
      const rateRejects = results.filter(
        (r) => r.rateDecision === DimoProviderLimiterDecision.WOULD_REJECT,
      );
      expect(rateAllows).toHaveLength(3);
      expect(rateRejects).toHaveLength(2);

      const epochSecond = Math.floor(Date.now() / 1000);
      const count = await replicaA.redis.get(dimoProviderRateKey(epochSecond));
      expect(Number.parseInt(count ?? '0', 10)).toBe(5);
    });

    it('B: two replicas share global in-flight leases', async () => {
      const input = baseBeginInput({ maxInFlight: 2, rateLimitPerSecond: 100, rateBurst: 100 });

      const first = await replicaA.limiter.begin(input);
      const second = await replicaB.limiter.begin(input);
      const third = await replicaA.limiter.begin(input);

      expect(first.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
      expect(second.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
      expect(third.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);

      const inflightCount = await replicaA.redis.zcard(dimoProviderInflightKey());
      expect(inflightCount).toBe(2);
    });

    it('C: concurrent acquisitions cannot oversubscribe in-flight cap', async () => {
      const input = baseBeginInput({ maxInFlight: 3, rateLimitPerSecond: 100, rateBurst: 100 });
      const begins = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          (i % 2 === 0 ? replicaA : replicaB).limiter.begin(input),
        ),
      );

      const allows = begins.filter(
        (r) => r.inFlightDecision === DimoProviderLimiterDecision.ALLOW,
      );
      const rejects = begins.filter(
        (r) => r.inFlightDecision === DimoProviderLimiterDecision.WOULD_REJECT,
      );
      expect(allows).toHaveLength(3);
      expect(rejects).toHaveLength(5);
      expect(await replicaA.redis.zcard(dimoProviderInflightKey())).toBe(3);
    });

    it('D: release on replica A restores capacity visible to replica B', async () => {
      const input = baseBeginInput({ maxInFlight: 2, rateLimitPerSecond: 100, rateBurst: 100 });

      const first = await replicaA.limiter.begin(input);
      await replicaB.limiter.begin(input);
      const blocked = await replicaA.limiter.begin(input);
      expect(blocked.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);

      await replicaA.limiter.end(first.leaseId);
      const recovered = await replicaB.limiter.begin(input);
      expect(recovered.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    });

    it('E: double release is safe (no negative accounting)', async () => {
      const input = baseBeginInput({ maxInFlight: 2, rateLimitPerSecond: 100, rateBurst: 100 });
      const begin = await replicaA.limiter.begin(input);
      await replicaA.limiter.end(begin.leaseId);
      await replicaA.limiter.end(begin.leaseId);

      expect(await replicaA.redis.zcard(dimoProviderInflightKey())).toBe(0);

      const second = await replicaB.limiter.begin(input);
      const third = await replicaB.limiter.begin(input);
      expect(second.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
      expect(third.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    });

    it('F: stale lease expires and capacity is recovered without manual release', async () => {
      const input = baseBeginInput({
        maxInFlight: 1,
        inFlightLeaseMs: 150,
        rateLimitPerSecond: 100,
        rateBurst: 100,
      });

      const held = await replicaA.limiter.begin(input);
      expect(held.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);

      const blocked = await replicaB.limiter.begin(input);
      expect(blocked.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);

      await new Promise((resolve) => setTimeout(resolve, 220));

      const recovered = await replicaB.limiter.begin(input);
      expect(recovered.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
      expect(await replicaB.redis.zcard(dimoProviderInflightKey())).toBe(1);

      await replicaB.limiter.end(recovered.leaseId);
      await replicaA.limiter.end(held.leaseId);
    });

    it('G: shadow WOULD_REJECT does not inflate in-flight accounting', async () => {
      const input = baseBeginInput({ maxInFlight: 2, rateLimitPerSecond: 100, rateBurst: 100 });

      await replicaA.limiter.begin(input);
      await replicaB.limiter.begin(input);
      const shadowReject = await replicaA.limiter.begin(input);

      expect(shadowReject.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);
      expect(await replicaA.redis.zcard(dimoProviderInflightKey())).toBe(2);

      const config: DimoProviderLimiterConfigShape = {
        ...resolveDimoProviderLimiterConfig({ DIMO_PROVIDER_LIMITER_MODE: 'shadow' }),
        enabled: true,
        mode: 'shadow',
        maxInFlight: 1,
        rateLimitPerSecond: 100,
        rateBurst: 100,
      };
      const gateway = new DimoProviderGateway(config, replicaA.limiter);
      const invoke = jest.fn().mockResolvedValue('provider-ok');

      const startedAt = Date.now();
      await expect(
        gateway.execute({
          operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
          invoke,
        }),
      ).resolves.toBe('provider-ok');
      expect(Date.now() - startedAt).toBeLessThan(200);
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('H: Redis failure fail-open on real limiter boundary', async () => {
      const brokenRedis = new RedisService({
        host: '127.0.0.1',
        port: 6399,
        password: undefined,
        db: redisConnectionOptions().db,
      });
      const brokenLimiter = new DimoProviderLimiterService(brokenRedis);
      const begin = await brokenLimiter.begin(baseBeginInput());
      expect(begin.redisFailOpen).toBe(true);
      expect(begin.rateDecision).toBe(DimoProviderLimiterDecision.ERROR_FAIL_OPEN);

      const config: DimoProviderLimiterConfigShape = {
        ...resolveDimoProviderLimiterConfig({ DIMO_PROVIDER_LIMITER_MODE: 'shadow' }),
        enabled: true,
        mode: 'shadow',
      };
      const gateway = new DimoProviderGateway(config, brokenLimiter);
      const invoke = jest.fn().mockResolvedValue(99);
      await expect(
        gateway.execute({
          operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
          invoke,
        }),
      ).resolves.toBe(99);
      await brokenRedis.quit();
    });

    it('rate window: per-second bucket TTL and clean next window', async () => {
      const input = baseBeginInput({ rateLimitPerSecond: 2, rateBurst: 0, maxInFlight: 100 });
      const epochSecond = Math.floor(Date.now() / 1000);
      const rateKey = dimoProviderRateKey(epochSecond);

      await replicaA.limiter.begin(input);
      await replicaB.limiter.begin(input);
      const third = await replicaA.limiter.begin(input);
      expect(third.rateDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);

      const ttl = await replicaA.redis.ttl(rateKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3);

      const keysBefore = await replicaA.redis.keys('dimo:provider:limiter:rate:*');
      expect(keysBefore.length).toBeLessThanOrEqual(3);

      await new Promise((resolve) => setTimeout(resolve, 1_100));
      await cleanupLimiterKeys(replicaA.redis);

      const fresh = await replicaB.limiter.begin(input);
      expect(fresh.rateDecision).toBe(DimoProviderLimiterDecision.ALLOW);
      expect(fresh.rateWindowCount).toBe(1);

      const keysAfter = await replicaB.redis.keys('dimo:provider:limiter:*');
      expect(keysAfter.length).toBeLessThanOrEqual(2);
    });

    it('C-rate: concurrent acquisitions respect global rate budget atomically', async () => {
      const input = baseBeginInput({ rateLimitPerSecond: 4, rateBurst: 0, maxInFlight: 100 });
      const begins = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          (i % 2 === 0 ? replicaA : replicaB).limiter.begin(input),
        ),
      );

      const rateAllows = begins.filter(
        (r) => r.rateDecision === DimoProviderLimiterDecision.ALLOW,
      );
      const rateRejects = begins.filter(
        (r) => r.rateDecision === DimoProviderLimiterDecision.WOULD_REJECT,
      );
      expect(rateAllows).toHaveLength(4);
      expect(rateRejects).toHaveLength(6);
    });
  },
);
