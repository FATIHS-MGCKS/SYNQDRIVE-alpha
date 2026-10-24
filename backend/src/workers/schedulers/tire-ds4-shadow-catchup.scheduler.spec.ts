import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { TireDs4ShadowCatchupScheduler } from './tire-ds4-shadow-catchup.scheduler';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('TireDs4ShadowCatchupScheduler', () => {
  const config = {
    enabled: true,
    catchupEnabled: true,
    catchupIntervalMs: 60_000,
    catchupBatchSize: 2,
    maxAttempts: 3,
    retryBaseMs: 1000,
  };

  beforeEach(() => {
    jest.mocked(canEnqueueQueue).mockReturnValue(true);
  });

  it('enqueues catch-up jobs only for repository candidates', async () => {
    const leaderGuard = { shouldRun: jest.fn().mockReturnValue(true) };
    const producer = { enqueueMaterialize: jest.fn().mockResolvedValue('job-1'), isEnabled: jest.fn() };
    const repository = {
      findCatchupCandidates: jest.fn().mockResolvedValue([
        {
          tireTripUsageLedgerId: 'ledger-1',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          reason: 'newer_ds4_run',
        },
      ]),
    };

    const scheduler = new TireDs4ShadowCatchupScheduler(
      config as never,
      leaderGuard as never,
      producer as never,
      repository as never,
    );

    await scheduler.runCatchup();

    expect(repository.findCatchupCandidates).toHaveBeenCalled();
    expect(producer.enqueueMaterialize).toHaveBeenCalledWith(
      expect.objectContaining({ tireTripUsageLedgerId: 'ledger-1', attempt: 0 }),
    );
  });

  it('does nothing when catch-up disabled', async () => {
    const producer = { enqueueMaterialize: jest.fn(), isEnabled: jest.fn() };
    const repository = { findCatchupCandidates: jest.fn() };
    const scheduler = new TireDs4ShadowCatchupScheduler(
      { ...config, catchupEnabled: false } as never,
      { shouldRun: jest.fn() } as never,
      producer as never,
      repository as never,
    );

    await scheduler.runCatchup();
    expect(repository.findCatchupCandidates).not.toHaveBeenCalled();
  });
});
