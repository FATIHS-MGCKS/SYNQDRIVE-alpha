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

function baseConfig(mode: DimoProviderLimiterConfigShape['mode']): DimoProviderLimiterConfigShape {
  return {
    enabled: mode !== 'off',
    mode,
    rateLimitPerSecond: 20,
    rateBurst: 5,
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
    documentedCoreRatePerSecond: 25,
  };
}

function createGateway(args: {
  mode: DimoProviderLimiterConfigShape['mode'];
  limiter?: DimoProviderLimiterService;
  admission?: DimoProviderAdmissionService;
}) {
  const config = baseConfig(args.mode);
  const limiter =
    args.limiter ??
    ({
      begin: jest.fn().mockResolvedValue({
        leaseId: 'lease-1',
        inFlightMember: '2:lease-1',
        mode: args.mode,
        rateDecision: DimoProviderLimiterDecision.ALLOW,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 1,
        rateWindowLimit: 25,
        inFlightCount: 1,
        inFlightLimit: 40,
        redisFailOpen: false,
      }),
      end: jest.fn().mockResolvedValue(undefined),
      setProviderCooldown: jest.fn().mockResolvedValue(undefined),
    } as unknown as DimoProviderLimiterService);

  const admission =
    args.admission ??
    ({
      acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
    } as unknown as DimoProviderAdmissionService);

  const gateway = new DimoProviderGateway(config, admission, limiter);
  gateway.onModuleInit();
  return { gateway, limiter, admission };
}

describe('DimoProviderGateway (S2/S3)', () => {
  it('returns invoke result unchanged in shadow mode', async () => {
    const { gateway } = createGateway({ mode: 'shadow' });
    const result = await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      invoke: async () => ({ data: { ok: true } }),
    });
    expect(result).toEqual({ data: { ok: true } });
  });

  it('propagates invoke rejection unchanged in shadow mode', async () => {
    const { gateway } = createGateway({ mode: 'shadow' });
    const err = Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403 },
    });
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke: async () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
  });

  it('does not reject when shadow limiter reports WOULD_REJECT', async () => {
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
        inFlightMember: null,
        mode: 'shadow',
        rateDecision: DimoProviderLimiterDecision.WOULD_REJECT,
        inFlightDecision: DimoProviderLimiterDecision.WOULD_REJECT,
        rateWindowCount: 30,
        rateWindowLimit: 25,
        inFlightCount: 41,
        inFlightLimit: 40,
        redisFailOpen: false,
      }),
      end: jest.fn().mockResolvedValue(undefined),
      setProviderCooldown: jest.fn(),
    } as unknown as DimoProviderLimiterService;

    const { gateway } = createGateway({ mode: 'shadow', limiter });
    const invoke = jest.fn().mockResolvedValue('ok');
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke,
      }),
    ).resolves.toBe('ok');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(limiter.end).toHaveBeenCalledWith(null);
  });

  it('fail-open on Redis error still executes invoke', async () => {
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
        inFlightMember: null,
        mode: 'shadow',
        rateDecision: DimoProviderLimiterDecision.ERROR_FAIL_OPEN,
        inFlightDecision: DimoProviderLimiterDecision.ERROR_FAIL_OPEN,
        rateWindowCount: 0,
        rateWindowLimit: 25,
        inFlightCount: 0,
        inFlightLimit: 40,
        redisFailOpen: true,
      }),
      end: jest.fn().mockResolvedValue(undefined),
      setProviderCooldown: jest.fn(),
    } as unknown as DimoProviderLimiterService;

    const { gateway } = createGateway({ mode: 'shadow', limiter });
    const invoke = jest.fn().mockResolvedValue(42);
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke,
      }),
    ).resolves.toBe(42);
  });

  it('enforce mode surfaces admission timeout without invoking provider', async () => {
    const admission = {
      acquire: jest.fn().mockRejectedValue(
        new DimoProviderAdmissionTimeoutError(
          DimoProviderRequestCategory.TELEMETRY_GRAPHQL,
          DimoProviderRequestPriority.P2_INTERACTIVE,
          5000,
          'rate',
        ),
      ),
    } as unknown as DimoProviderAdmissionService;

    const { gateway } = createGateway({ mode: 'enforce', admission });
    const invoke = jest.fn().mockResolvedValue('never');
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke,
      }),
    ).rejects.toBeInstanceOf(DimoProviderAdmissionTimeoutError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('records provider cooldown on HTTP 429', async () => {
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: 'lease-1',
        inFlightMember: '2:lease-1',
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
      setProviderCooldown: jest.fn().mockResolvedValue(undefined),
    } as unknown as DimoProviderLimiterService;

    const { gateway } = createGateway({ mode: 'shadow', limiter });
    const err = Object.assign(new Error('429'), {
      response: { status: 429, headers: { 'retry-after': '3' } },
    });
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke: async () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
    expect(limiter.setProviderCooldown).toHaveBeenCalledWith(3, 120);
  });
});
