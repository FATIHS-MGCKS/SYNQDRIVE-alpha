import { TireDs4ShadowProcessorService } from './tire-ds4-shadow-processor.service';

describe('TireDs4ShadowProcessorService — premature terminal guard', () => {
  const config = {
    enabled: true,
    catchupEnabled: false,
    vehicleAllowlist: { kind: 'allow_set' as const, vehicleIds: new Set(['veh-tesla']) },
    catchupIntervalMs: 300_000,
    catchupBatchSize: 50,
    maxAttempts: 5,
    retryBaseMs: 1000,
  };

  const ledgerRow = {
    id: 'ledger-tesla',
    organizationId: 'org-1',
    vehicleId: 'veh-tesla',
    tripId: '90a903f6-6371-4b8e-a76a-ebb9071df1d5',
    tireSetupId: 'setup-1',
    distanceKm: 1.4,
    tripStartedAt: new Date('2026-10-25T12:17:00.000Z'),
    tripEndedAt: new Date('2026-10-25T12:24:17.311Z'),
  };

  function makeRepository() {
    return {
      hasTerminalMarker: jest.fn().mockResolvedValue(false),
      insertShadowInputImmutable: jest.fn().mockResolvedValue('inserted'),
      persistTerminalMarker: jest.fn().mockResolvedValue('inserted'),
    };
  }

  it('ledger before S4 PRIMARY completion: PENDING read defers without terminal marker', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const tripMapRead = { readForTrip: jest.fn().mockResolvedValue({ status: 'PENDING' }) };
    const repository = makeRepository();
    const producer = {
      enqueueMaterialize: jest.fn().mockResolvedValue('job-1'),
      computeRetryDelayMs: jest.fn().mockReturnValue(60_000),
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
      vehicleId: 'veh-tesla',
      tripId: ledgerRow.tripId,
      tireTripUsageLedgerId: ledgerRow.id,
      attempt: 0,
    });

    expect(outcome.status).toBe('deferred');
    expect(repository.persistTerminalMarker).not.toHaveBeenCalled();
  });

  it('S4 PRIMARY done, motion pending: NOT_AVAILABLE defers (bounded retry)', async () => {
    const tripMapRead = { readForTrip: jest.fn().mockResolvedValue({ status: 'NOT_AVAILABLE' }) };
    const repository = makeRepository();
    const producer = {
      enqueueMaterialize: jest.fn().mockResolvedValue('job-1'),
      computeRetryDelayMs: jest.fn().mockReturnValue(60_000),
    };
    const svc = new TireDs4ShadowProcessorService(
      {
        tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
        diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
      } as never,
      tripMapRead as never,
      repository as never,
      producer as never,
      config as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-tesla',
      tripId: ledgerRow.tripId,
      tireTripUsageLedgerId: ledgerRow.id,
      attempt: 2,
    });

    expect(outcome).toEqual({
      status: 'deferred',
      reason: 'ds4_motion_evidence_not_available_yet',
      nextAttempt: 3,
    });
    expect(repository.persistTerminalMarker).not.toHaveBeenCalled();
  });

  it('SUCCEEDED motion read during retry window persists shadow row', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: {
        findFirst: jest.fn().mockResolvedValue({
          contentFingerprint: 'fp',
          shadowBundleVersion: 'bundle',
        }),
      },
    };
    const tripMapRead = {
      readForTrip: jest.fn().mockResolvedValue({
        status: 'SUCCEEDED_EMPTY',
        runId: 'run-real',
        workItemId: 'wi',
        combinedInputIdentity: 'ci',
        pinnedSnapshotHash: 'pin',
        algorithmVersions: { events: 'ev', bundle: 'bundle' },
        speedAuthority: 'C4_ONLY',
        events: [],
        stopEpisodes: [],
        samples: [],
        limitations: [],
        newerFailedRunId: null,
        newerFailedRunStatus: null,
      }),
    };
    const repository = makeRepository();
    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      repository as never,
      { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() } as never,
      config as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-tesla',
      tripId: ledgerRow.tripId,
      tireTripUsageLedgerId: ledgerRow.id,
      attempt: 3,
    });

    expect(outcome.status).toBe('persisted');
    expect(repository.insertShadowInputImmutable).toHaveBeenCalled();
    expect(repository.persistTerminalMarker).not.toHaveBeenCalled();
  });

  it('catchup remains off (config unchanged)', () => {
    expect(config.catchupEnabled).toBe(false);
  });
});
