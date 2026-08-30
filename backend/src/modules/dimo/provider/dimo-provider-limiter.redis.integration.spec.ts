import IORedis from 'ioredis';
import { RedisService } from '@shared/redis/redis.service';
import { DimoProviderAdmissionService } from './dimo-provider-admission.service';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';
import {
  dimoProviderCooldownKey,
  dimoProviderInflightKey,
  dimoProviderRateKey,
  dimoProviderTokenBucketKey,
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

function createAdmissionReplica(
  config: DimoProviderLimiterConfigShape,
): { admission: DimoProviderAdmissionService; limiter: DimoProviderLimiterService; redis: RedisService } {
  const { limiter, redis } = createLimiterReplica();
  return { admission: new DimoProviderAdmissionService(config, limiter), limiter, redis };
}

function createGatewayReplica(
  config: DimoProviderLimiterConfigShape,
): {
  gateway: DimoProviderGateway;
  admission: DimoProviderAdmissionService;
  limiter: DimoProviderLimiterService;
  redis: RedisService;
} {
  const { admission, limiter, redis } = createAdmissionReplica(config);
  return { gateway: new DimoProviderGateway(config, admission, limiter), admission, limiter, redis };
}

async function cleanupLimiterKeys(redis: RedisService): Promise<void> {
  await redis.del(dimoProviderInflightKey());
  await redis.del(dimoProviderCooldownKey());
  await redis.del(dimoProviderTokenBucketKey());
  const epochSecond = Math.floor(Date.now() / 1000);
  for (let offset = -2; offset <= 2; offset += 1) {
    await redis.del(dimoProviderRateKey(epochSecond + offset));
  }
}

function baseBeginInput(
  overrides: Partial<Parameters<DimoProviderLimiterService['begin']>[0]> = {},
): Parameters<DimoProviderLimiterService['begin']>[0] {
  return {
    mode: 'shadow' as const,
    category: DimoProviderRequestCategory.TELEMETRY_GRAPHQL,
    priority: DimoProviderRequestPriority.P3_NORMAL,
    rateLimitPerSecond: 5,
    rateBurst: 0,
    rateAlgorithm: 'token_bucket' as const,
    maxInFlight: 2,
    inFlightLeaseMs: 30_000,
    reservedHighPrioritySlots: 1,
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

    it('A: two replicas share one global token bucket budget', async () => {
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

      await replicaA.limiter.end(first.inFlightMember);
      const recovered = await replicaB.limiter.begin(input);
      expect(recovered.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    });

    it('E: double release is safe (no negative accounting)', async () => {
      const input = baseBeginInput({ maxInFlight: 2, rateLimitPerSecond: 100, rateBurst: 100 });
      const begin = await replicaA.limiter.begin(input);
      await replicaA.limiter.end(begin.inFlightMember);
      await replicaA.limiter.end(begin.inFlightMember);

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

      await replicaB.limiter.end(recovered.inFlightMember);
      await replicaA.limiter.end(held.inFlightMember);
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
      const { gateway } = createGatewayReplica(config);
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
      const { limiter, redis } = createLimiterReplica();
      await redis.ping();
      redis.disconnect(false);

      const begin = await limiter.begin(baseBeginInput());
      expect(begin.redisFailOpen).toBe(true);
      expect(begin.rateDecision).toBe(DimoProviderLimiterDecision.ERROR_FAIL_OPEN);

      const config: DimoProviderLimiterConfigShape = {
        ...resolveDimoProviderLimiterConfig({ DIMO_PROVIDER_LIMITER_MODE: 'shadow' }),
        enabled: true,
        mode: 'shadow',
      };
      const { gateway } = createGatewayReplica(config);
      const invoke = jest.fn().mockResolvedValue(99);
      await expect(
        gateway.execute({
          operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
          invoke,
        }),
      ).resolves.toBe(99);
    });

    it('I: P1 live traffic admitted when background fills in-flight cap', async () => {
      const bgInput = baseBeginInput({
        mode: 'enforce',
        priority: DimoProviderRequestPriority.P4_BACKGROUND,
        maxInFlight: 2,
        reservedHighPrioritySlots: 1,
        rateLimitPerSecond: 100,
        rateBurst: 100,
      });
      const liveInput = {
        ...bgInput,
        priority: DimoProviderRequestPriority.P1_LIVE,
      };

      const bg1 = await replicaA.limiter.begin(bgInput);
      const bg2 = await replicaB.limiter.begin(bgInput);
      expect(bg1.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
      expect(bg2.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);

      const bgBlocked = await replicaA.limiter.begin(bgInput);
      expect(bgBlocked.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);

      const live = await replicaB.limiter.begin(liveInput);
      expect(live.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);

      await replicaA.limiter.end(bg1.inFlightMember);
      await replicaA.limiter.end(bg2.inFlightMember);
      await replicaB.limiter.end(live.inFlightMember);
    });

    it('J: provider Retry-After cooldown is shared across replicas', async () => {
      await replicaA.limiter.setProviderCooldown(2, 120);
      const blocked = await replicaB.limiter.begin(baseBeginInput({ mode: 'enforce' }));
      expect(blocked.rateDecision).toBe(DimoProviderLimiterDecision.WOULD_WAIT);
      expect(blocked.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_WAIT);
      expect(blocked.providerCooldownActive).toBe(true);
      expect(blocked.wouldDelayMs).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 2_200));
      const resumed = await replicaA.limiter.begin(baseBeginInput({ mode: 'enforce' }));
      expect(resumed.providerCooldownActive).toBeUndefined();
      expect(resumed.rateDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    });

    it('K: enforce admission waits then grants when capacity frees', async () => {
      const config: DimoProviderLimiterConfigShape = {
        ...resolveDimoProviderLimiterConfig({ DIMO_PROVIDER_LIMITER_MODE: 'enforce' }),
        enabled: true,
        mode: 'enforce',
        maxInFlight: 1,
        maxWaitMs: 2_000,
        maxWaitMsByPriority: {
          ...resolveDimoProviderLimiterConfig().maxWaitMsByPriority,
          [DimoProviderRequestPriority.P3_NORMAL]: 2_000,
        },
        admissionPollMinMs: 50,
        admissionPollMaxMs: 100,
      };
      const { admission, limiter } = createAdmissionReplica(config);
      const input = baseBeginInput({
        mode: 'enforce',
        maxInFlight: 1,
        rateLimitPerSecond: 100,
        rateBurst: 100,
      });

      const holder = await limiter.begin(input);
      expect(holder.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);

      const waiter = admission.acquire(input, { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
      setTimeout(() => {
        void limiter.end(holder.inFlightMember);
      }, 150);

      const granted = await waiter;
      expect(granted.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
      await limiter.end(granted.inFlightMember);
    });

    it('rate window: token bucket refills smoothly across time', async () => {
      const input = baseBeginInput({ rateLimitPerSecond: 2, rateBurst: 0, maxInFlight: 100 });

      await replicaA.limiter.begin(input);
      await replicaB.limiter.begin(input);
      const third = await replicaA.limiter.begin(input);
      expect(third.rateDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);

      await new Promise((resolve) => setTimeout(resolve, 600));

      const fresh = await replicaB.limiter.begin(input);
      expect(fresh.rateDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    });

    it('L: canary gateway enforces only allowlisted org', async () => {
      const config: DimoProviderLimiterConfigShape = {
        ...resolveDimoProviderLimiterConfig({
          DIMO_PROVIDER_LIMITER_MODE: 'shadow',
          DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS: 'org-canary',
        }),
        enabled: true,
        mode: 'shadow',
      };
      const { gateway, admission } = createGatewayReplica(config);
      const acquireSpy = jest.spyOn(admission, 'acquire');

      await gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        requestContext: { organizationId: 'org-canary' },
        invoke: async () => 'canary-ok',
      });
      expect(acquireSpy.mock.calls[0][0].mode).toBe('enforce');

      await gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        requestContext: { organizationId: 'org-other' },
        invoke: async () => 'shadow-ok',
      });
      expect(acquireSpy.mock.calls[1][0].mode).toBe('shadow');
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
