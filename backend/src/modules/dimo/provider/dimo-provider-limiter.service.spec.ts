import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import {
  DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT,
  DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
  DIMO_PROVIDER_RATE_SCRIPT,
  DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT,
  dimoProviderInflightKey,
  dimoProviderRateKey,
  dimoProviderTokenBucketKey,
} from './dimo-provider-limiter.redis-scripts';
import {
  DimoProviderLimiterDecision,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';
import { inflightMember, parseInflightMember } from './dimo-provider-priority.model';

type Store = {
  strings: Map<string, string>;
  zsets: Map<string, Map<string, number>>;
  hashes: Map<string, Map<string, string>>;
};

function createInMemoryRedis(): { redis: { eval: jest.Mock; get: jest.Mock }; store: Store } {
  const store: Store = { strings: new Map(), zsets: new Map(), hashes: new Map() };

  const evalFn = jest.fn(async (script: string, numKeys: number, ...args: string[]) => {
    if (script === DIMO_PROVIDER_RATE_SCRIPT) {
      const key = args[0];
      const maxAllowed = Number.parseInt(args[1], 10);
      const current = Number.parseInt(store.strings.get(key) ?? '0', 10) + 1;
      store.strings.set(key, String(current));
      const decision = current > maxAllowed ? 'would_reject' : 'allow';
      return [current, maxAllowed, decision];
    }

    if (script === DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT) {
      const key = args[0];
      const nowMs = Number.parseInt(args[1], 10);
      const refillRate = Number.parseFloat(args[2]);
      const capacity = Number.parseFloat(args[3]);
      const hash = store.hashes.get(key) ?? new Map<string, string>();
      let tokens = Number.parseFloat(hash.get('tokens') ?? String(capacity));
      let lastRefill = Number.parseInt(hash.get('last_refill_ms') ?? String(nowMs), 10);
      const elapsedMs = Math.max(0, nowMs - lastRefill);
      tokens = Math.min(capacity, tokens + (elapsedMs * refillRate) / 1000);
      lastRefill = nowMs;
      let decision = 'allow';
      if (tokens < 1) {
        decision = 'would_reject';
      } else {
        tokens -= 1;
      }
      hash.set('tokens', String(tokens));
      hash.set('last_refill_ms', String(lastRefill));
      store.hashes.set(key, hash);
      return [capacity - tokens, capacity, decision, tokens];
    }

    if (script === DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT) {
      const key = args[0];
      const maxInflight = Number.parseInt(args[1], 10);
      const leaseId = args[2];
      const nowMs = Number.parseInt(args[3], 10);
      const expiryMs = Number.parseInt(args[4], 10);
      const rank = Number.parseInt(args[6], 10);
      const reserved = Number.parseInt(args[7], 10);
      const zset = store.zsets.get(key) ?? new Map<string, number>();
      for (const [member, score] of [...zset.entries()]) {
        if (score <= nowMs) zset.delete(member);
      }
      let highCount = 0;
      for (const member of zset.keys()) {
        if (parseInflightMember(member).rank <= 1) highCount += 1;
      }
      const count = zset.size;
      let decision = 'allow';
      if (count >= maxInflight) {
        decision = rank <= 1 && highCount < reserved ? 'allow' : 'would_reject';
      }
      if (decision === 'would_reject') {
        return [count, maxInflight, decision, count, highCount];
      }
      const member = `${rank}:${leaseId}`;
      zset.set(member, expiryMs);
      store.zsets.set(key, zset);
      return [count, maxInflight, decision, zset.size, highCount];
    }

    if (script === DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT) {
      const key = args[0];
      const member = args[1];
      const zset = store.zsets.get(key);
      if (!zset) return 0;
      return zset.delete(member) ? 1 : 0;
    }

    throw new Error(`Unknown script in test store`);
  });

  return {
    redis: {
      eval: evalFn,
      get: jest.fn(async () => null),
    },
    store,
  };
}

describe('DimoProviderLimiterService (distributed semantics)', () => {
  const baseInput = {
    mode: 'shadow' as const,
    category: 'telemetry_graphql' as any,
    priority: DimoProviderRequestPriority.P3_NORMAL,
    rateLimitPerSecond: 5,
    rateBurst: 0,
    rateAlgorithm: 'token_bucket' as const,
    maxInFlight: 2,
    inFlightLeaseMs: 30_000,
    reservedHighPrioritySlots: 1,
  } satisfies Parameters<DimoProviderLimiterService['begin']>[0];

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
    expect(store.hashes.get(dimoProviderTokenBucketKey())?.get('tokens')).toBeDefined();
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

    await replicaA.end(first.inFlightMember);
    const afterRelease = await replicaB.begin(baseInput);
    expect(afterRelease.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
  });

  it('duplicate release is safe', async () => {
    const { redis } = createInMemoryRedis();
    const svc = new DimoProviderLimiterService(redis as any);
    const begin = await svc.begin(baseInput);
    await svc.end(begin.inFlightMember);
    await svc.end(begin.inFlightMember);
    expect((redis.eval as jest.Mock).mock.calls.some((c) => c[0] === DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT)).toBe(true);
  });

  it('Redis outage fail-open preserves allow semantics', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
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
