import { TireDs4ShadowProcessorService } from './tire-ds4-shadow-processor.service';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from './tire-ds4-shadow-adapter.version';

describe('TireDs4ShadowProcessorService', () => {
  const config = {
    enabled: true,
    catchupEnabled: true,
    catchupIntervalMs: 300_000,
    catchupBatchSize: 50,
    maxAttempts: 3,
    retryBaseMs: 1000,
  };

  it('defers when DS4 read is PENDING and re-enqueues with backoff', async () => {
    const prisma = {
      tireTripUsageLedger: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ledger-1',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          tireSetupId: 'setup-1',
        }),
      },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const tripMapRead = {
      readForTrip: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    };
    const repository = { upsertShadowInput: jest.fn() };
    const producer = {
      enqueueMaterialize: jest.fn().mockResolvedValue('job-1'),
      computeRetryDelayMs: jest.fn().mockReturnValue(2000),
    };

    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      repository as never,
      producer as never,
      config as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'deferred', reason: 'ds4_pending', nextAttempt: 1 });
    expect(producer.enqueueMaterialize).toHaveBeenCalledWith(
      expect.objectContaining({
        tireTripUsageLedgerId: 'ledger-1',
        attempt: 1,
        delayMs: 2000,
      }),
    );
    expect(repository.upsertShadowInput).not.toHaveBeenCalled();
  });

  it('scopes readForTrip to ledger organization', async () => {
    const prisma = {
      tireTripUsageLedger: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ledger-1',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          tireSetupId: 'setup-1',
        }),
      },
      diV0MotionCoreShadowRunV1: {
        findFirst: jest.fn().mockResolvedValue({
          contentFingerprint: 'fp-1',
          shadowBundleVersion: 'bundle',
        }),
      },
    };
    const tripMapRead = {
      readForTrip: jest.fn().mockResolvedValue({ status: 'NOT_AVAILABLE' }),
    };
    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      { upsertShadowInput: jest.fn() } as never,
      { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() } as never,
      config as never,
    );

    await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(tripMapRead.readForTrip).toHaveBeenCalledWith('org-1', 'veh-1', 'trip-1');
  });

  it('persists shadow row on SUCCEEDED read', async () => {
    const prisma = {
      tireTripUsageLedger: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ledger-1',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          tireSetupId: 'setup-1',
        }),
      },
      diV0MotionCoreShadowRunV1: {
        findFirst: jest.fn().mockResolvedValue({
          contentFingerprint: 'fp-1',
          shadowBundleVersion: 'bundle',
        }),
      },
    };
    const tripMapRead = {
      readForTrip: jest.fn().mockResolvedValue({
        status: 'SUCCEEDED_EMPTY',
        runId: 'run-1',
        workItemId: 'wi-1',
        combinedInputIdentity: 'ci',
        pinnedSnapshotHash: 'pin',
        algorithmVersions: { events: 'ev-1', bundle: 'bundle' },
        speedAuthority: 'C4_ONLY',
        events: [],
        limitations: [],
        newerFailedRunId: null,
        newerFailedRunStatus: null,
      }),
    };
    const repository = {
      upsertShadowInput: jest.fn().mockResolvedValue('inserted'),
    };
    const producer = {
      enqueueMaterialize: jest.fn(),
      computeRetryDelayMs: jest.fn(),
    };

    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      repository as never,
      producer as never,
      config as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'persisted', upsert: 'inserted' });
    expect(repository.upsertShadowInput).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
        diV0MotionCoreShadowRunId: 'run-1',
        tireTripUsageLedgerId: 'ledger-1',
      }),
    );
  });
});
