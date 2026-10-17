import { DimoDtcProcessor, DTC_JOB_FANOUT } from './dimo-dtc.processor';

const shadowBatch = jest.fn();

jest.mock('@modules/vehicle-intelligence/dtc/adaptive/dtc-02-adaptive-shadow.runtime', () => ({
  runDtc02AdaptiveSchedulerShadowBatch: (...args: unknown[]) => shadowBatch(...args),
}));

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: () => true,
}));

jest.mock('@modules/dimo/provider-budget/dimo-request-context', () => ({
  runWithDimoRequestContext: (_ctx: unknown, fn: () => Promise<void>) => fn(),
}));

describe('DimoDtcProcessor P4 shadow certification', () => {
  const queueAdd = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    vehicle: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
          registryLifecycle: 'ACTIVE',
          dimoVehicleId: 'dimo-1',
          dimoVehicle: { tokenId: 99 },
        },
      ]),
    },
    vehicleDataSourceLink: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED;
    delete process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST;
  });

  function processor(): DimoDtcProcessor {
    return new DimoDtcProcessor(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { add: queueAdd } as never,
    );
  }

  it('enqueues legacy per-vehicle jobs before shadow batch', async () => {
    shadowBatch.mockResolvedValue(undefined);
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'false';
    await processor().process({ name: DTC_JOB_FANOUT, data: {} } as never);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(shadowBatch).toHaveBeenCalledTimes(1);
    const addOrder = queueAdd.mock.invocationCallOrder[0];
    const shadowOrder = shadowBatch.mock.invocationCallOrder[0];
    expect(addOrder).toBeLessThan(shadowOrder);
  });

  it('still completes fan-out when shadow batch throws (failure isolation)', async () => {
    shadowBatch.mockRejectedValue(new Error('redis shadow read failed'));
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'false';
    await expect(
      processor().process({ name: DTC_JOB_FANOUT, data: {} } as never),
    ).resolves.toBeUndefined();
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('does not add adaptive job names', async () => {
    shadowBatch.mockResolvedValue(undefined);
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'false';
    await processor().process({ name: DTC_JOB_FANOUT, data: {} } as never);
    for (const call of queueAdd.mock.calls) {
      expect(call[0]).not.toMatch(/adaptive/i);
    }
  });
});
