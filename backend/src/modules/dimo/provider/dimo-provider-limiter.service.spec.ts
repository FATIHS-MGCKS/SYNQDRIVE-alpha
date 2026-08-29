import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import {
  DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT,
  DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
  DIMO_PROVIDER_RATE_SCRIPT,
  dimoProviderInflightKey,
  dimoProviderRateKey,
} from './dimo-provider-limiter.redis-scripts';
import { DimoProviderLimiterDecision } from './dimo-provider-limiter.types';

type Store = {
  strings: Map<string, string>;
  zsets: Map<string, Map<string, number>>;
};

function createInMemoryRedis(): { redis: { eval: jest.Mock }; store: Store } {
  const store: Store = { strings: new Map(), zsets: new Map() };

  const evalFn = jest.fn(async (script: string, numKeys: number, ...args: string[]) => {
    if (script === DIMO_PROVIDER_RATE_SCRIPT) {
      const key = args[0];
      const maxAllowed = Number.parseInt(args[1], 10);
      const current = Number.parseInt(store.strings.get(key) ?? '0', 10) + 1;
      store.strings.set(key, String(current));
      const decision = current > maxAllowed ? 'would_reject' : 'allow';
      return [current, maxAllowed, decision];
    }

    if (script === DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT) {
      const key = args[0];
      const maxInflight = Number.parseInt(args[1], 10);
      const leaseId = args[2];
      const nowMs = Number.parseInt(args[3], 10);
      const expiryMs = Number.parseInt(args[4], 10);
      const mode = args[5];
      const zset = store.zsets.get(key) ?? new Map<string, number>();
      for (const [member, score] of [...zset.entries()]) {
        if (score <= nowMs) zset.delete(member);
      }
      const count = zset.size;
      const decision = count >= maxInflight ? 'would_reject' : 'allow';
      if (decision === 'would_reject') {
        return [count, maxInflight, decision, count];
      }
      zset.set(leaseId, expiryMs);
      store.zsets.set(key, zset);
      return [count, maxInflight, decision, zset.size];
    }

    if (script === DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT) {
      const key = args[0];
      const leaseId = args[1];
      const zset = store.zsets.get(key);
      if (!zset) return 0;
      const existed = zset.delete(leaseId) ? 1 : 0;
      return existed;
    }

    throw new Error(`Unknown script in test store`);
  });

  return { redis: { eval: evalFn }, store };
}

describe('DimoProviderLimiterService (distributed semantics)', () => {
  const baseInput = {
    mode: 'shadow' as const,
    category: 'telemetry_graphql' as any,
    priority: 'p2_normal' as any,
    rateLimitPerSecond: 5,
    rateBurst: 0,
    maxInFlight: 2,
    inFlightLeaseMs: 30_000,
  };

  it('two replicas share the same rate budget', async () => {
    const { redis, store } = createInMemoryRedis();
    const replicaA = new DimoProviderLimiterService(redis as any);
    const replicaB = new DimoProviderLimiterService(redis as any);

    const results = [];
    for (let i = 0; i < 6; i++) {
      const svc = i % 2 === 0 ? replicaA : replicaB;
      results.push(await svc.begin(baseInput));
    }

    const rejects = results.filter(
      (r) => r.rateDecision === DimoProviderLimiterDecision.WOULD_REJECT,
    );
    expect(rejects.length).toBeGreaterThan(0);
    const epochSecond = Math.floor(Date.now() / 1000);
    expect(store.strings.get(dimoProviderRateKey(epochSecond))).toBe('6');
  });

  it('in-flight leases are global across replicas', async () => {
    const { redis } = createInMemoryRedis();
    const replicaA = new DimoProviderLimiterService(redis as any);
    const replicaB = new DimoProviderLimiterService(redis as any);

    const first = await replicaA.begin(baseInput);
    const second = await replicaB.begin(baseInput);
    const third = await replicaA.begin(baseInput);

    expect(first.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    expect(second.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    expect(third.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);

    await replicaA.end(first.leaseId);
    const afterRelease = await replicaB.begin(baseInput);
    expect(afterRelease.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
  });

  it('duplicate release is safe', async () => {
    const { redis } = createInMemoryRedis();
    const svc = new DimoProviderLimiterService(redis as any);
    const begin = await svc.begin(baseInput);
    await svc.end(begin.leaseId);
    await svc.end(begin.leaseId);
    const zset = (redis.eval as jest.Mock).mock.calls.find(
      (c) => c[0] === DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
    );
    expect(zset).toBeTruthy();
  });

  it('Redis outage fail-open preserves allow semantics', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    };
    const svc = new DimoProviderLimiterService(redis as any);
    const begin = await svc.begin(baseInput);
    expect(begin.redisFailOpen).toBe(true);
    expect(begin.rateDecision).toBe(DimoProviderLimiterDecision.ERROR_FAIL_OPEN);
  });

  it('enforce mode does not acquire lease when in-flight cap reached', async () => {
    const { redis, store } = createInMemoryRedis();
    const svc = new DimoProviderLimiterService(redis as any);
    const input = { ...baseInput, mode: 'enforce' as const };

    await svc.begin(input);
    await svc.begin(input);
    const third = await svc.begin(input);
    expect(third.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);
    const zset = store.zsets.get(dimoProviderInflightKey());
    expect(zset?.size ?? 0).toBe(2);
  });
});
