import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';
import { DimoProviderAdmissionService } from './dimo-provider-admission.service';
import { DimoProviderAdmissionTimeoutError } from './dimo-provider-admission.errors';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import { DimoProviderMetricsService } from './dimo-provider-metrics.service';
import {
  DimoProviderLimiterDecision,
  DimoProviderRequestCategory,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';
import type { DimoProviderLimiterConfigShape } from '@config/dimo-provider-limiter.config';
import { classifyDimoProviderHttpError } from './dimo-provider-http-classifier';
import { isInCanaryPercentBucket } from './dimo-provider-canary-hash.util';
import { resolveCanaryEnforcement } from './dimo-provider-rollout.util';
import {
  DIMO_PROVIDER_COOLDOWN_SET_SCRIPT,
  DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT,
  DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT,
  DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT,
} from './dimo-provider-limiter.redis-scripts';

function baseConfig(
  overrides: Partial<DimoProviderLimiterConfigShape> = {},
): DimoProviderLimiterConfigShape {
  return {
    enabled: true,
    mode: 'shadow',
    rateLimitPerSecond: 20,
    rateBurst: 5,
    rateAlgorithm: 'token_bucket',
    maxInFlight: 40,
    inFlightLeaseMs: 45_000,
    reservedHighPrioritySlots: 12,
    maxWaitMs: 5_000,
    maxWaitMsByPriority: {
      [DimoProviderRequestPriority.P0_CRITICAL]: 10_000,
      [DimoProviderRequestPriority.P1_LIVE]: 10_000,
      [DimoProviderRequestPriority.P2_INTERACTIVE]: 5_000,
      [DimoProviderRequestPriority.P3_NORMAL]: 3_750,
      [DimoProviderRequestPriority.P4_BACKGROUND]: 2_500,
    },
    admissionPollMinMs: 25,
    admissionPollMaxMs: 250,
    retryAfterMaxSeconds: 120,
    canaryEnforceOrgIds: new Set<string>(),
    enforceCanaryEnabled: false,
    enforceCanaryPercent: 0,
    enforceCanaryVehicleIds: new Set<string>(),
    documentedCoreRatePerSecond: 25,
    ...overrides,
  };
}

function createInMemoryRedis() {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();

  const evalFn = jest.fn(async (script: string, _numKeys: number, ...args: string[]) => {
    if (script === DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT) {
      const key = args[0];
      const nowMs = Number.parseInt(args[1], 10);
      const refillRate = Number.parseFloat(args[2]);
      const capacity = Number.parseFloat(args[3]);
      const hash = hashes.get(key) ?? new Map<string, string>();
      let tokens = Number.parseFloat(hash.get('tokens') ?? String(capacity));
      let lastRefill = Number.parseInt(hash.get('last_refill_ms') ?? String(nowMs), 10);
      const elapsedMs = Math.max(0, nowMs - lastRefill);
      tokens = Math.min(capacity, tokens + (elapsedMs * refillRate) / 1000);
      lastRefill = nowMs;
      let decision = 'allow';
      if (tokens < 1) decision = 'would_reject';
      else tokens -= 1;
      hash.set('tokens', String(tokens));
      hash.set('last_refill_ms', String(lastRefill));
      hashes.set(key, hash);
      return [capacity - tokens, capacity, decision, tokens];
    }
    if (script === DIMO_PROVIDER_INFLIGHT_ACQUIRE_SCRIPT) {
      const key = args[0];
      const maxInFlight = Number.parseInt(args[1], 10);
      const leaseId = args[2];
      const nowMs = Number.parseInt(args[3], 10);
      const expiryMs = Number.parseInt(args[4], 10);
      const mode = args[5];
      const rank = Number.parseInt(args[6], 10);
      const reserved = Number.parseInt(args[7], 10);
      const zset = zsets.get(key) ?? new Map<string, number>();
      for (const [member, score] of [...zset.entries()]) {
        if (score <= nowMs) zset.delete(member);
      }
      const count = zset.size;
      let decision = 'allow';
      if (count >= maxInFlight) {
        const highCount = [...zset.keys()].filter((m) => m.startsWith('0:') || m.startsWith('1:')).length;
        decision = rank <= 1 && highCount < reserved ? 'allow' : 'would_reject';
      }
      if (decision !== 'would_reject' && mode !== 'shadow') {
        zset.set(`${rank}:${leaseId}`, expiryMs);
      } else if (decision !== 'would_reject' && mode === 'shadow') {
        zset.set(`${rank}:${leaseId}`, expiryMs);
      }
      zsets.set(key, zset);
      return [zset.size, maxInFlight, decision, zset.size, reserved];
    }
    if (script === DIMO_PROVIDER_INFLIGHT_RELEASE_SCRIPT) {
      const key = args[0];
      const member = args[1];
      const zset = zsets.get(key);
      zset?.delete(member);
      return [zset?.size ?? 0];
    }
    if (script === DIMO_PROVIDER_COOLDOWN_SET_SCRIPT) {
      const key = args[0];
      const endsAtMs = args[1];
      kv.set(key, endsAtMs);
      return [1];
    }
    return [0, 0, 'allow'];
  });

  return {
    redis: {
      eval: evalFn,
      get: jest.fn(async (key: string) => kv.get(key) ?? null),
      disconnect: jest.fn(),
    },
    zsets,
    kv,
  };
}

describe('P1.3-S4 chaos / failure matrix', () => {
  it('provider 429 storm activates bounded cooldown', async () => {
    const config = baseConfig();
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: 'l1',
        inFlightMember: '3:l1',
        mode: 'shadow',
        rateDecision: DimoProviderLimiterDecision.ALLOW,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 1,
        rateWindowLimit: 25,
        inFlightCount: 1,
        inFlightLimit: 40,
        redisFailOpen: false,
      }),
      end: jest.fn(),
      setProviderCooldown: jest.fn(),
    } as unknown as DimoProviderLimiterService;
    const admission = {
      acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
    } as unknown as DimoProviderAdmissionService;
    const gateway = new DimoProviderGateway(config, admission, limiter);
    const err429 = Object.assign(new Error('rate limited'), {
      response: { status: 429, headers: { 'retry-after': '30' } },
    });
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke: async () => {
          throw err429;
        },
      }),
    ).rejects.toThrow('rate limited');
    expect(limiter.setProviderCooldown).toHaveBeenCalledWith(30, 120);
  });

  it('malformed Retry-After does not set cooldown', () => {
    const err = Object.assign(new Error('rate limited'), {
      response: { status: 429, headers: { 'retry-after': 'not-a-number' } },
    });
    expect(classifyDimoProviderHttpError(err).retryAfterSeconds).toBeUndefined();
  });

  it('extreme Retry-After is bounded by retryAfterMaxSeconds', async () => {
    const config = baseConfig({ retryAfterMaxSeconds: 60 });
    const setCooldown = jest.fn();
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
        inFlightMember: null,
        mode: 'shadow',
        rateDecision: DimoProviderLimiterDecision.ALLOW,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 0,
        rateWindowLimit: 25,
        inFlightCount: 0,
        inFlightLimit: 40,
        redisFailOpen: false,
      }),
      end: jest.fn(),
      setProviderCooldown: setCooldown,
    } as unknown as DimoProviderLimiterService;
    const admission = {
      acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
    } as unknown as DimoProviderAdmissionService;
    const gateway = new DimoProviderGateway(config, admission, limiter);
    const err = Object.assign(new Error('rate limited'), {
      response: { status: 429, headers: { 'retry-after': '9999' } },
    });
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke: async () => {
          throw err;
        },
      }),
    ).rejects.toThrow();
    expect(setCooldown).toHaveBeenCalledWith(9999, 60);
  });

  it('provider 5xx storm does not trip cooldown', async () => {
    const setCooldown = jest.fn();
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
        inFlightMember: null,
        mode: 'shadow',
        rateDecision: DimoProviderLimiterDecision.ALLOW,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 0,
        rateWindowLimit: 25,
        inFlightCount: 0,
        inFlightLimit: 40,
        redisFailOpen: false,
      }),
      end: jest.fn(),
      setProviderCooldown: setCooldown,
    } as unknown as DimoProviderLimiterService;
    const admission = {
      acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
    } as unknown as DimoProviderAdmissionService;
    const gateway = new DimoProviderGateway(baseConfig(), admission, limiter);
    const err = Object.assign(new Error('server'), { response: { status: 503 } });
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke: async () => {
          throw err;
        },
      }),
    ).rejects.toThrow();
    expect(setCooldown).not.toHaveBeenCalled();
  });

  it('provider timeout storm is classified without cooldown', () => {
    const err = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    expect(classifyDimoProviderHttpError(err).statusClass).toBe('timeout');
  });

  it('Redis unavailable fail-open allows invoke', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const limiter = new DimoProviderLimiterService(redis as any);
    const begin = await limiter.begin({
      mode: 'enforce',
      category: DimoProviderRequestCategory.SNAPSHOT,
      priority: DimoProviderRequestPriority.P3_NORMAL,
      rateLimitPerSecond: 1,
      rateBurst: 0,
      rateAlgorithm: 'token_bucket',
      maxInFlight: 1,
      inFlightLeaseMs: 30_000,
      reservedHighPrioritySlots: 1,
    });
    expect(begin.redisFailOpen).toBe(true);
  });

  it('Redis reconnect after fail-open resumes enforcement decisions', async () => {
    const { redis } = createInMemoryRedis();
    redis.eval.mockRejectedValueOnce(new Error('down'));
    const limiter = new DimoProviderLimiterService(redis as any);
    const input = {
      mode: 'enforce' as const,
      category: DimoProviderRequestCategory.SNAPSHOT,
      priority: DimoProviderRequestPriority.P3_NORMAL,
      rateLimitPerSecond: 2,
      rateBurst: 0,
      rateAlgorithm: 'token_bucket' as const,
      maxInFlight: 10,
      inFlightLeaseMs: 30_000,
      reservedHighPrioritySlots: 2,
    };
    const failOpen = await limiter.begin(input);
    expect(failOpen.redisFailOpen).toBe(true);
    const normal = await limiter.begin(input);
    expect(normal.redisFailOpen).toBe(false);
    expect(normal.rateDecision).toBe(DimoProviderLimiterDecision.ALLOW);
  });

  it('admission timeout surfaces DimoProviderAdmissionTimeoutError', async () => {
    const config = baseConfig({ mode: 'enforce', maxWaitMs: 100 });
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
        inFlightMember: null,
        mode: 'enforce',
        rateDecision: DimoProviderLimiterDecision.WOULD_REJECT,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 25,
        rateWindowLimit: 25,
        inFlightCount: 0,
        inFlightLimit: 40,
        redisFailOpen: false,
      }),
      end: jest.fn(),
      setProviderCooldown: jest.fn(),
    } as unknown as DimoProviderLimiterService;
    const admission = new DimoProviderAdmissionService(config, limiter);
    await expect(
      admission.acquire(
        {
          mode: 'enforce',
          category: DimoProviderRequestCategory.SNAPSHOT,
          priority: DimoProviderRequestPriority.P4_BACKGROUND,
          rateLimitPerSecond: 20,
          rateBurst: 0,
          rateAlgorithm: 'token_bucket',
          maxInFlight: 40,
          inFlightLeaseMs: 45_000,
          reservedHighPrioritySlots: 12,
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(DimoProviderAdmissionTimeoutError);
  });

  it('high-priority starvation protection allows P0 when cap reached', async () => {
    const { redis } = createInMemoryRedis();
    const limiter = new DimoProviderLimiterService(redis as any);
    const input = {
      mode: 'enforce' as const,
      category: DimoProviderRequestCategory.SNAPSHOT,
      priority: DimoProviderRequestPriority.P4_BACKGROUND,
      rateLimitPerSecond: 100,
      rateBurst: 100,
      rateAlgorithm: 'token_bucket' as const,
      maxInFlight: 1,
      inFlightLeaseMs: 30_000,
      reservedHighPrioritySlots: 1,
    };
    const holder = await limiter.begin(input);
    expect(holder.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    const blocked = await limiter.begin(input);
    expect(blocked.inFlightDecision).toBe(DimoProviderLimiterDecision.WOULD_REJECT);
    const p0 = await limiter.begin({
      ...input,
      priority: DimoProviderRequestPriority.P0_CRITICAL,
    });
    expect(p0.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    await limiter.end(holder.inFlightMember);
    await limiter.end(p0.inFlightMember);
  });

  it('process restart with expired leases does not lock out new acquisitions', async () => {
    const { redis, zsets } = createInMemoryRedis();
    const limiter = new DimoProviderLimiterService(redis as any);
    const input = {
      mode: 'enforce' as const,
      category: DimoProviderRequestCategory.SNAPSHOT,
      priority: DimoProviderRequestPriority.P3_NORMAL,
      rateLimitPerSecond: 100,
      rateBurst: 100,
      rateAlgorithm: 'token_bucket' as const,
      maxInFlight: 1,
      inFlightLeaseMs: 1_000,
      reservedHighPrioritySlots: 1,
    };
    const stale = await limiter.begin(input);
    expect(stale.inFlightMember).toBeTruthy();
    const key = 'dimo:provider:limiter:inflight';
    const zset = zsets.get(key);
    if (zset && stale.inFlightMember) {
      zset.set(stale.inFlightMember, Date.now() - 1);
    }
    const fresh = await limiter.begin(input);
    expect(fresh.inFlightDecision).toBe(DimoProviderLimiterDecision.ALLOW);
    await limiter.end(fresh.inFlightMember);
  });

  it('two-replica concurrent acquisition respects shared in-flight cap', async () => {
    const { redis } = createInMemoryRedis();
    const replicaA = new DimoProviderLimiterService(redis as any);
    const replicaB = new DimoProviderLimiterService(redis as any);
    const input = {
      mode: 'enforce' as const,
      category: DimoProviderRequestCategory.SNAPSHOT,
      priority: DimoProviderRequestPriority.P3_NORMAL,
      rateLimitPerSecond: 100,
      rateBurst: 100,
      rateAlgorithm: 'token_bucket' as const,
      maxInFlight: 2,
      inFlightLeaseMs: 30_000,
      reservedHighPrioritySlots: 1,
    };
    const results = await Promise.all([
      replicaA.begin(input),
      replicaB.begin(input),
      replicaA.begin(input),
    ]);
    const allows = results.filter((r) => r.inFlightDecision === DimoProviderLimiterDecision.ALLOW);
    const rejects = results.filter((r) => r.inFlightDecision === DimoProviderLimiterDecision.WOULD_REJECT);
    expect(allows).toHaveLength(2);
    expect(rejects).toHaveLength(1);
    for (const r of allows) await replicaA.end(r.inFlightMember);
  });

  it('canary percent stable across two gateway replicas', () => {
    const config = baseConfig({
      enforceCanaryEnabled: true,
      enforceCanaryPercent: 25,
    });
    const vehicleId = 'veh-stable-canary';
    const a = resolveCanaryEnforcement(config, { vehicleId });
    const b = resolveCanaryEnforcement(config, { vehicleId });
    expect(a).toEqual(b);
    expect(a.canaryMatch).toBe(isInCanaryPercentBucket(vehicleId, 25));
  });

  it('rollback from enforce-canary percent to shadow stops enforcement', () => {
    const canary = baseConfig({
      enforceCanaryEnabled: true,
      enforceCanaryPercent: 100,
    });
    const rolledBack = baseConfig({ enforceCanaryEnabled: false, enforceCanaryPercent: 0 });
    expect(resolveCanaryEnforcement(canary, { vehicleId: 'v1' }).effectiveMode).toBe('enforce');
    expect(resolveCanaryEnforcement(rolledBack, { vehicleId: 'v1' }).effectiveMode).toBe('shadow');
  });
});
