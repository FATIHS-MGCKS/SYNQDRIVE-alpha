import { TireDs4ShadowProducerService } from './tire-ds4-shadow-producer.service';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('TireDs4ShadowProducerService', () => {
  const baseConfig = {
    enabled: true,
    vehicleAllowlist: { kind: 'allow_set' as const, vehicleIds: new Set(['veh-allowed']) },
    catchupEnabled: false,
    catchupIntervalMs: 300_000,
    catchupBatchSize: 50,
    maxAttempts: 3,
    retryBaseMs: 1000,
  };

  it('does not enqueue when vehicle is not allowlisted', async () => {
    const queue = { add: jest.fn() };
    const producer = new TireDs4ShadowProducerService(queue as never, baseConfig as never);

    const jobId = await producer.enqueueMaterialize({
      organizationId: 'org-1',
      vehicleId: 'veh-blocked',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
    });

    expect(jobId).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues when vehicle is allowlisted', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const producer = new TireDs4ShadowProducerService(queue as never, baseConfig as never);

    const jobId = await producer.enqueueMaterialize({
      organizationId: 'org-1',
      vehicleId: 'veh-allowed',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
    });

    expect(jobId).not.toBeNull();
    expect(queue.add).toHaveBeenCalled();
  });
});
