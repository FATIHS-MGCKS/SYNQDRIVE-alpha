import { DimoProviderAdmissionService } from './dimo-provider-admission.service';
import { DimoProviderAdmissionTimeoutError } from './dimo-provider-admission.errors';
import { DimoProviderLimiterService } from './dimo-provider-limiter.service';
import {
  DimoProviderLimiterDecision,
  DimoProviderRequestCategory,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';
import type { DimoProviderLimiterConfigShape } from '@config/dimo-provider-limiter.config';

function testConfig(): DimoProviderLimiterConfigShape {
  return {
    enabled: true,
    mode: 'enforce',
    rateLimitPerSecond: 20,
    rateBurst: 0,
    maxInFlight: 2,
    inFlightLeaseMs: 30_000,
    reservedHighPrioritySlots: 2,
    maxWaitMs: 500,
    maxWaitMsByPriority: {
      [DimoProviderRequestPriority.P0_CRITICAL]: 1_000,
      [DimoProviderRequestPriority.P1_LIVE]: 1_000,
      [DimoProviderRequestPriority.P2_INTERACTIVE]: 500,
      [DimoProviderRequestPriority.P3_NORMAL]: 300,
      [DimoProviderRequestPriority.P4_BACKGROUND]: 200,
    },
    admissionPollMinMs: 10,
    admissionPollMaxMs: 50,
    retryAfterMaxSeconds: 120,
    documentedCoreRatePerSecond: 25,
  };
}

describe('DimoProviderAdmissionService', () => {
  const baseInput = {
    mode: 'enforce' as const,
    category: DimoProviderRequestCategory.TELEMETRY_GRAPHQL,
    priority: DimoProviderRequestPriority.P4_BACKGROUND,
    rateLimitPerSecond: 5,
    rateBurst: 0,
    maxInFlight: 1,
    inFlightLeaseMs: 30_000,
    reservedHighPrioritySlots: 1,
  };

  it('shadow mode delegates to single begin without waiting', async () => {
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: 'l1',
        inFlightMember: '4:l1',
        mode: 'shadow',
        rateDecision: DimoProviderLimiterDecision.ALLOW,
        inFlightDecision: DimoProviderLimiterDecision.ALLOW,
        rateWindowCount: 1,
        rateWindowLimit: 5,
        inFlightCount: 1,
        inFlightLimit: 1,
        redisFailOpen: false,
      }),
    } as unknown as DimoProviderLimiterService;

    const svc = new DimoProviderAdmissionService(testConfig(), limiter);
    const result = await svc.acquire({ ...baseInput, mode: 'shadow' });
    expect(limiter.begin).toHaveBeenCalledTimes(1);
    expect(result.inFlightMember).toBe('4:l1');
  });

  it('enforce mode waits until admission granted', async () => {
    const limiter = {
      begin: jest
        .fn()
        .mockResolvedValueOnce({
          leaseId: null,
          inFlightMember: null,
          mode: 'enforce',
          rateDecision: DimoProviderLimiterDecision.WOULD_REJECT,
          inFlightDecision: DimoProviderLimiterDecision.WOULD_REJECT,
          rateWindowCount: 6,
          rateWindowLimit: 5,
          inFlightCount: 1,
          inFlightLimit: 1,
          redisFailOpen: false,
        })
        .mockResolvedValueOnce({
          leaseId: 'l2',
          inFlightMember: '4:l2',
          mode: 'enforce',
          rateDecision: DimoProviderLimiterDecision.ALLOW,
          inFlightDecision: DimoProviderLimiterDecision.ALLOW,
          rateWindowCount: 2,
          rateWindowLimit: 5,
          inFlightCount: 1,
          inFlightLimit: 1,
          redisFailOpen: false,
        }),
    } as unknown as DimoProviderLimiterService;

    const sleeps: number[] = [];
    const svc = new DimoProviderAdmissionService(testConfig(), limiter);
    const result = await svc.acquire(
      { ...baseInput, priority: DimoProviderRequestPriority.P1_LIVE },
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(limiter.begin).toHaveBeenCalledTimes(2);
    expect(sleeps.length).toBe(1);
    expect(result.inFlightMember).toBe('4:l2');
  });

  it('enforce mode throws admission timeout when wait budget exceeded', async () => {
    const limiter = {
      begin: jest.fn().mockResolvedValue({
        leaseId: null,
        inFlightMember: null,
        mode: 'enforce',
        rateDecision: DimoProviderLimiterDecision.WOULD_REJECT,
        inFlightDecision: DimoProviderLimiterDecision.WOULD_REJECT,
        rateWindowCount: 6,
        rateWindowLimit: 5,
        inFlightCount: 1,
        inFlightLimit: 1,
        redisFailOpen: false,
      }),
    } as unknown as DimoProviderLimiterService;

    const svc = new DimoProviderAdmissionService(
      { ...testConfig(), maxWaitMsByPriority: {
        ...testConfig().maxWaitMsByPriority,
        [DimoProviderRequestPriority.P4_BACKGROUND]: 30,
      } },
      limiter,
    );

    await expect(
      svc.acquire(baseInput, { sleep: async () => undefined }),
    ).rejects.toBeInstanceOf(DimoProviderAdmissionTimeoutError);
  });

  it('live priority uses shorter poll delay than background', () => {
    const svc = new DimoProviderAdmissionService(testConfig(), {} as DimoProviderLimiterService);
    const live = svc.computePollDelay(DimoProviderRequestPriority.P1_LIVE, 2, undefined, 1_000);
    const bg = svc.computePollDelay(DimoProviderRequestPriority.P4_BACKGROUND, 2, undefined, 1_000);
    expect(live).toBeLessThan(bg);
  });
});
