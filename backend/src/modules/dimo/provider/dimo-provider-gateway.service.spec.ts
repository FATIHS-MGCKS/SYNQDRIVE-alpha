import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import { DimoProviderLimiterDecision } from './dimo-provider-limiter.types';
import type { DimoProviderLimiterConfigShape } from '@config/dimo-provider-limiter.config';

function createGateway(args: {
  mode: DimoProviderLimiterConfigShape['mode'];
  limiter?: DimoProviderLimiterService;
}) {
  const config: DimoProviderLimiterConfigShape = {
    enabled: args.mode !== 'off',
    mode: args.mode,
    rateLimitPerSecond: 20,
    rateBurst: 5,
    maxInFlight: 40,
    inFlightLeaseMs: 45_000,
    documentedCoreRatePerSecond: 25,
  };
  const limiter =
    args.limiter ??
    ({
      begin: jest.fn().mockResolvedValue({
        leaseId: 'lease-1',
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
    } as unknown as DimoProviderLimiterService);

  return { gateway: new DimoProviderGateway(config, limiter), limiter };
}

describe('DimoProviderGateway (S2 shadow)', () => {
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
        leaseId: 'lease-shadow',
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
    expect(limiter.end).toHaveBeenCalledWith('lease-shadow');
  });

  it('fail-open on Redis error still executes invoke', async () => {
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
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

  it('enforce mode rejects when limiter reports WOULD_REJECT', async () => {
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
        mode: 'enforce',
        rateDecision: DimoProviderLimiterDecision.WOULD_REJECT,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 30,
        rateWindowLimit: 25,
        inFlightCount: 1,
        inFlightLimit: 40,
        redisFailOpen: false,
      }),
      end: jest.fn(),
    } as unknown as DimoProviderLimiterService;

    const { gateway } = createGateway({ mode: 'enforce', limiter });
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke: async () => 'never',
      }),
    ).rejects.toThrow(/limiter rejected/);
  });
});
