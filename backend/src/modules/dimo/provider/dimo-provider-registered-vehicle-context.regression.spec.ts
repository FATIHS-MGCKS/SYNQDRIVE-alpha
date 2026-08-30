import { buildDimoProviderRequestContext, mergeDimoProviderRequestContext } from './dimo-provider-request-context.util';
import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';
import { DimoProviderLimiterDecision, DimoProviderRequestPriority } from './dimo-provider-limiter.types';
import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';
import { resolveCanaryEnforcement } from './dimo-provider-rollout.util';
import { DimoProviderAdmissionService } from './dimo-provider-admission.service';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';

const fullContext = {
  organizationId: 'org-canary',
  vehicleId: 'veh-cross-path',
  tokenId: 187336,
};

describe('Registered-vehicle context propagation regressions (P1-001)', () => {
  it('buildDimoProviderRequestContext preserves org/vehicle when tokenId is merged last', () => {
    const ctx = buildDimoProviderRequestContext(99, {
      organizationId: 'org-a',
      vehicleId: 'veh-b',
      tokenId: 1,
    });
    expect(ctx).toEqual({
      organizationId: 'org-a',
      vehicleId: 'veh-b',
      tokenId: 99,
    });
  });

  it('mergeDimoProviderRequestContext does not drop org/vehicle on tokenId-only override', () => {
    const base = buildDimoProviderRequestContext(42, fullContext);
    const merged = mergeDimoProviderRequestContext(base, { tokenId: 42 });
    expect(merged.organizationId).toBe(fullContext.organizationId);
    expect(merged.vehicleId).toBe(fullContext.vehicleId);
    expect(merged.tokenId).toBe(42);
  });
});

describe('Canary cross-path consistency (P1-001)', () => {
  const limiter = {
    begin: jest.fn().mockResolvedValue({
      leaseId: null,
      inFlightMember: null,
      mode: 'enforce',
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
    getProviderCooldownRemainingMs: jest.fn().mockResolvedValue(0),
  } as unknown as DimoProviderLimiterService;

  const admission = {
    acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
  } as unknown as DimoProviderAdmissionService;

  const operations = [
    DimoProviderOperation.TELEMETRY_GRAPHQL,
    DimoProviderOperation.TELEMETRY_VEHICLE_SUMMARY,
    DimoProviderOperation.TELEMETRY_VEHICLE_VIN,
  ];

  function gatewayWithEnv(env: Record<string, string | undefined>) {
    const config = resolveDimoProviderLimiterConfig(env as NodeJS.ProcessEnv);
    const gateway = new DimoProviderGateway(config, admission, limiter);
    gateway.onModuleInit();
    return gateway;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('org allowlist enforces consistently across provider operation types', async () => {
    const gateway = gatewayWithEnv({
      DIMO_PROVIDER_LIMITER_MODE: 'shadow',
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS: 'org-canary',
    });

    for (const operation of operations) {
      const acquire = jest.spyOn(admission, 'acquire');
      await gateway.execute({
        operation,
        requestContext: fullContext,
        priority: DimoProviderRequestPriority.P3_NORMAL,
        invoke: async () => ({ ok: true }),
      });
      expect(acquire.mock.calls.at(-1)?.[0]?.mode).toBe('enforce');
      const canary = resolveCanaryEnforcement(
        resolveDimoProviderLimiterConfig({
          DIMO_PROVIDER_LIMITER_MODE: 'shadow',
          DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
          DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS: 'org-canary',
        } as NodeJS.ProcessEnv),
        fullContext,
      );
      expect(canary.canaryReason).toBe('org_allowlist');
    }
  });

  it('vehicle allowlist enforces consistently across provider operation types', async () => {
    const gateway = gatewayWithEnv({
      DIMO_PROVIDER_LIMITER_MODE: 'shadow',
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_VEHICLE_IDS: 'veh-cross-path',
    });

    for (const operation of operations) {
      const acquire = jest.spyOn(admission, 'acquire');
      await gateway.execute({
        operation,
        requestContext: fullContext,
        priority: DimoProviderRequestPriority.P3_NORMAL,
        invoke: async () => ({ ok: true }),
      });
      expect(acquire.mock.calls.at(-1)?.[0]?.mode).toBe('enforce');
    }
  });

  it('percent canary bucket is deterministic for same org+vehicle across operations', () => {
    const config = resolveDimoProviderLimiterConfig({
      DIMO_PROVIDER_LIMITER_MODE: 'shadow',
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_PERCENT: '100',
    } as NodeJS.ProcessEnv);

    const buckets = operations.map(() =>
      resolveCanaryEnforcement(config, fullContext).canaryHashBucket,
    );
    expect(new Set(buckets).size).toBe(1);
    expect(resolveCanaryEnforcement(config, fullContext).effectiveMode).toBe('enforce');
  });

  it('tokenId-only context stays shadow under canary_enforce', async () => {
    const gateway = gatewayWithEnv({
      DIMO_PROVIDER_LIMITER_MODE: 'shadow',
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS: 'other-org',
    });

    const acquire = jest.spyOn(admission, 'acquire');
    await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: { tokenId: fullContext.tokenId },
      invoke: async () => ({ ok: true }),
    });
    expect(acquire.mock.calls.at(-1)?.[0]?.mode).toBe('shadow');
  });

  it('non-canary organization stays shadow with full vehicle context', () => {
    const config = resolveDimoProviderLimiterConfig({
      DIMO_PROVIDER_LIMITER_MODE: 'shadow',
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS: 'other-org',
    } as NodeJS.ProcessEnv);
    const result = resolveCanaryEnforcement(config, fullContext);
    expect(result.effectiveMode).toBe('shadow');
    expect(result.canaryMatch).toBe(false);
  });
});
