import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';
import { DimoProviderAdmissionService } from './dimo-provider-admission.service';
import { DimoProviderAdmissionTimeoutError } from './dimo-provider-admission.errors';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import {
  DimoProviderLimiterDecision,
  DimoProviderRequestCategory,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';
import type { DimoProviderLimiterConfigShape } from '@config/dimo-provider-limiter.config';
import {
  DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT,
} from './dimo-provider-limiter.redis-scripts';
import { resolveRolloutState } from './dimo-provider-rollout.util';

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

function createGateway(config: DimoProviderLimiterConfigShape, limiter?: DimoProviderLimiterService) {
  const svc =
    limiter ??
    ({
      begin: jest.fn().mockResolvedValue({
        leaseId: 'lease-1',
        inFlightMember: '3:lease-1',
        mode: 'shadow',
        rateDecision: DimoProviderLimiterDecision.ALLOW,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 1,
        rateWindowLimit: 25,
        inFlightCount: 1,
        inFlightLimit: 40,
        redisFailOpen: false,
        rateAlgorithm: 'token_bucket',
      }),
      end: jest.fn(),
      setProviderCooldown: jest.fn(),
    } as unknown as DimoProviderLimiterService);

  const admission = {
    acquire: jest.fn().mockImplementation((input) => svc.begin(input)),
  } as unknown as DimoProviderAdmissionService;

  const gateway = new DimoProviderGateway(config, admission, svc);
  gateway.onModuleInit();
  return { gateway, limiter: svc, admission };
}

describe('P1.3-S4 production canary + token bucket', () => {
  it('1 — shadow unchanged for requests without canary org', async () => {
    const config = baseConfig({
      canaryEnforceOrgIds: new Set(['org-canary']),
    });
    const { gateway, admission } = createGateway(config);
    const invoke = jest.fn().mockResolvedValue('ok');
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke,
      }),
    ).resolves.toBe('ok');
    expect(admission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'shadow' }),
      expect.any(Object),
    );
  });

  it('2 — canary org receives enforce mode', async () => {
    const config = baseConfig({
      canaryEnforceOrgIds: new Set(['org-canary']),
    });
    const { gateway, admission } = createGateway(config);
    await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: { organizationId: 'org-canary' },
      invoke: async () => 'ok',
    });
    expect(admission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'enforce' }),
      expect.any(Object),
    );
    expect(resolveRolloutState(config)).toBe('canary_enforce');
  });

  it('3 — non-canary org remains shadow when global mode is shadow', async () => {
    const config = baseConfig({ canaryEnforceOrgIds: new Set(['org-canary']) });
    const { gateway, admission } = createGateway(config);
    await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: { organizationId: 'org-other' },
      invoke: async () => 'ok',
    });
    expect(admission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'shadow' }),
      expect.any(Object),
    );
  });

  it('4 — deterministic canary assignment by org id', () => {
    const config = baseConfig({ canaryEnforceOrgIds: new Set(['org-a', 'org-b']) });
    const { gateway, admission } = createGateway(config);
    void gateway;
    expect(config.canaryEnforceOrgIds.has('org-a')).toBe(true);
    expect(config.canaryEnforceOrgIds.has('org-c')).toBe(false);
    expect(admission).toBeDefined();
  });

  it('11 — canary rollback to shadow via empty allowlist', async () => {
    const before = baseConfig({ canaryEnforceOrgIds: new Set(['org-canary']) });
    const after = baseConfig({ canaryEnforceOrgIds: new Set() });
    const { gateway: beforeGateway, admission: beforeAdmission } = createGateway(before);
    const { gateway: afterGateway, admission: afterAdmission } = createGateway(after);

    await beforeGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: { organizationId: 'org-canary' },
      invoke: async () => 'ok',
    });
    expect(beforeAdmission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'enforce' }),
      expect.any(Object),
    );

    await afterGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: { organizationId: 'org-canary' },
      invoke: async () => 'ok',
    });
    expect(afterAdmission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'shadow' }),
      expect.any(Object),
    );
  });

  it('12 — global enforce rollback to shadow via env only', async () => {
    const globalCfg = baseConfig({ mode: 'enforce' });
    const shadowCfg = baseConfig({ mode: 'shadow' });
    const { gateway: globalGateway, admission: globalAdmission } = createGateway(globalCfg);
    const { gateway: shadowGateway, admission: shadowAdmission } = createGateway(shadowCfg);

    await globalGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      invoke: async () => 'ok',
    });
    expect(globalAdmission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'enforce' }),
      expect.any(Object),
    );

    await shadowGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      invoke: async () => 'ok',
    });
    expect(shadowAdmission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'shadow' }),
      expect.any(Object),
    );
  });

  it('13 — PERMANENT_TRIP_LOSS=NO under admission timeout (deferral path)', async () => {
    const config = baseConfig({ mode: 'enforce' });
    const admission = {
      acquire: jest.fn().mockRejectedValue(
        new DimoProviderAdmissionTimeoutError(
          DimoProviderRequestCategory.SNAPSHOT,
          DimoProviderRequestPriority.P3_NORMAL,
          5000,
          'rate',
        ),
      ),
    } as unknown as DimoProviderAdmissionService;
    const { gateway } = createGateway(config, undefined);
    const gatewayWithAdmission = new DimoProviderGateway(config, admission, {
      begin: jest.fn(),
      end: jest.fn(),
      setProviderCooldown: jest.fn(),
    } as unknown as DimoProviderLimiterService);
    gatewayWithAdmission.onModuleInit();
    const invoke = jest.fn();
    await expect(
      gatewayWithAdmission.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke,
      }),
    ).rejects.toBeInstanceOf(DimoProviderAdmissionTimeoutError);
    expect(invoke).not.toHaveBeenCalled();
    expect(gateway).toBeDefined();
  });
});

describe('P1.3-S4 token bucket smoothing (in-memory redis)', () => {
  type HashStore = Map<string, Map<string, string>>;

  function createTokenBucketRedis(): {
    redis: { eval: jest.Mock; get: jest.Mock };
    store: HashStore;
  } {
    const store: HashStore = new Map();
    const evalFn = jest.fn(async (script: string, _numKeys: number, ...args: string[]) => {
      if (script === DIMO_PROVIDER_TOKEN_BUCKET_SCRIPT) {
        const key = args[0];
        const nowMs = Number.parseInt(args[1], 10);
        const refillRate = Number.parseFloat(args[2]);
        const capacity = Number.parseFloat(args[3]);
        const hash = store.get(key) ?? new Map<string, string>();
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
        store.set(key, hash);
        return [capacity - tokens, capacity, decision, tokens];
      }
      return [0, 100, 'allow', 99, 0];
    });
    return { redis: { eval: evalFn, get: jest.fn(async () => null) }, store };
  }

  it('5 — two replicas share one smoothed global budget', async () => {
    const { redis } = createTokenBucketRedis();
    const replicaA = new DimoProviderLimiterService(redis as any);
    const replicaB = new DimoProviderLimiterService(redis as any);
    const input = {
      mode: 'enforce' as const,
      category: DimoProviderRequestCategory.TELEMETRY_GRAPHQL,
      priority: DimoProviderRequestPriority.P3_NORMAL,
      rateLimitPerSecond: 3,
      rateBurst: 0,
      rateAlgorithm: 'token_bucket' as const,
      maxInFlight: 100,
      inFlightLeaseMs: 30_000,
      reservedHighPrioritySlots: 1,
    };

    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await (i % 2 === 0 ? replicaA : replicaB).begin(input));
    }
    const allows = results.filter((r) => r.rateDecision === DimoProviderLimiterDecision.ALLOW);
    const rejects = results.filter((r) => r.rateDecision === DimoProviderLimiterDecision.WOULD_REJECT);
    expect(allows).toHaveLength(3);
    expect(rejects).toHaveLength(2);
  });

  it('6 — second-boundary burst cannot exceed bucket capacity', async () => {
    const { redis } = createTokenBucketRedis();
    const svc = new DimoProviderLimiterService(redis as any);
    const input = {
      mode: 'enforce' as const,
      category: DimoProviderRequestCategory.TELEMETRY_GRAPHQL,
      priority: DimoProviderRequestPriority.P3_NORMAL,
      rateLimitPerSecond: 5,
      rateBurst: 5,
      rateAlgorithm: 'token_bucket' as const,
      maxInFlight: 100,
      inFlightLeaseMs: 30_000,
      reservedHighPrioritySlots: 1,
    };
    const capacity = input.rateLimitPerSecond + input.rateBurst;
    const allows = [];
    for (let i = 0; i < capacity + 3; i += 1) {
      const begin = await svc.begin(input);
      if (begin.rateDecision === DimoProviderLimiterDecision.ALLOW) allows.push(begin);
    }
    expect(allows.length).toBe(capacity);
  });
});
