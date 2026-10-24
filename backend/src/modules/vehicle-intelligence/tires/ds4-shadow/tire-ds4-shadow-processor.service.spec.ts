import { TireDs4ShadowProcessorService } from './tire-ds4-shadow-processor.service';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from './tire-ds4-shadow-adapter.version';
import {
  TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE,
  TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED,
} from './tire-ds4-shadow-terminal-runs';

describe('TireDs4ShadowProcessorService', () => {
  const config = {
    enabled: true,
    catchupEnabled: true,
    catchupIntervalMs: 300_000,
    catchupBatchSize: 50,
    maxAttempts: 3,
    retryBaseMs: 1000,
  };

  const ledgerRow = {
    id: 'ledger-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    tireSetupId: 'setup-1',
  };

  function makeRepository(overrides: Record<string, jest.Mock> = {}) {
    return {
      hasTerminalMarker: jest.fn().mockResolvedValue(false),
      insertShadowInputImmutable: jest.fn().mockResolvedValue('inserted'),
      persistTerminalMarker: jest.fn().mockResolvedValue('inserted'),
      ...overrides,
    };
  }

  it('defers when DS4 read is PENDING and re-enqueues with backoff', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const tripMapRead = { readForTrip: jest.fn().mockResolvedValue({ status: 'PENDING' }) };
    const repository = makeRepository();
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
    expect(repository.insertShadowInputImmutable).not.toHaveBeenCalled();
  });

  it('scopes readForTrip to ledger organization', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const tripMapRead = { readForTrip: jest.fn().mockResolvedValue({ status: 'NOT_AVAILABLE' }) };
    const repository = makeRepository();
    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      repository as never,
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

  it('persists terminal marker on NOT_AVAILABLE (no retry loop)', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const tripMapRead = { readForTrip: jest.fn().mockResolvedValue({ status: 'NOT_AVAILABLE' }) };
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
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'skipped', reason: 'ds4_not_available' });
    expect(repository.persistTerminalMarker).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ds4_not_available', tireTripUsageLedgerId: 'ledger-1' }),
    );
  });

  it('persists shadow row on SUCCEEDED read (immutable insert)', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
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
    const repository = makeRepository();
    const producer = { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() };

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

    expect(outcome).toEqual({ status: 'persisted', result: 'inserted' });
    expect(repository.insertShadowInputImmutable).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
        diV0MotionCoreShadowRunId: 'run-1',
        tireTripUsageLedgerId: 'ledger-1',
        temporalCoverage: 'UNVERIFIED',
      }),
    );
  });

  it('marks retry exhausted with terminal marker at maxAttempts', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const tripMapRead = { readForTrip: jest.fn().mockResolvedValue({ status: 'PENDING' }) };
    const repository = makeRepository();
    const producer = { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() };

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
      attempt: 2,
    });

    expect(outcome).toEqual({ status: 'exhausted', reason: 'ds4_pending', nextAttempt: 3 });
    expect(repository.persistTerminalMarker).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'retry_exhausted' }),
    );
    expect(producer.enqueueMaterialize).not.toHaveBeenCalled();
  });

  it('skips when terminal marker already present', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const tripMapRead = { readForTrip: jest.fn() };
    const repository = makeRepository({
      hasTerminalMarker: jest.fn().mockResolvedValue(true),
    });

    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      repository as never,
      { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() } as never,
      config as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'skipped', reason: 'terminal_marker_present' });
    expect(tripMapRead.readForTrip).not.toHaveBeenCalled();
  });

  it('allows a second row for a newer DS4 run id (replay)', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: {
        findFirst: jest.fn().mockResolvedValue({
          contentFingerprint: 'fp-2',
          shadowBundleVersion: 'bundle',
        }),
      },
    };
    const tripMapRead = {
      readForTrip: jest.fn().mockResolvedValue({
        status: 'SUCCEEDED',
        runId: 'run-2',
        workItemId: 'wi-2',
        combinedInputIdentity: 'ci-2',
        pinnedSnapshotHash: 'pin-2',
        algorithmVersions: { events: 'ev-1', bundle: 'bundle' },
        speedAuthority: 'C4_ONLY',
        events: [],
        limitations: [],
        newerFailedRunId: null,
        newerFailedRunStatus: null,
      }),
    };
    const repository = makeRepository({
      insertShadowInputImmutable: jest.fn().mockResolvedValue('inserted'),
    });

    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      repository as never,
      { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() } as never,
      config as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'persisted', result: 'inserted' });
    expect(repository.insertShadowInputImmutable).toHaveBeenCalledWith(
      expect.objectContaining({ diV0MotionCoreShadowRunId: 'run-2' }),
    );
  });

  it('returns evidence_immutable_conflict without updating row', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(ledgerRow) },
      diV0MotionCoreShadowRunV1: {
        findFirst: jest.fn().mockResolvedValue({
          contentFingerprint: 'fp-changed',
          shadowBundleVersion: 'bundle',
        }),
      },
    };
    const tripMapRead = {
      readForTrip: jest.fn().mockResolvedValue({
        status: 'SUCCEEDED',
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
    const repository = makeRepository({
      insertShadowInputImmutable: jest.fn().mockResolvedValue('evidence_immutable_conflict'),
    });

    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      tripMapRead as never,
      repository as never,
      { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() } as never,
      config as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'persisted', result: 'evidence_immutable_conflict' });
  });
});

describe('tire-ds4-shadow terminal run ids', () => {
  it('uses stable sentinel ids for terminal markers', () => {
    expect(TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED).toMatch(
      /^00000000-0000-4000-a000-/,
    );
    expect(TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE).toMatch(
      /^00000000-0000-4000-a000-/,
    );
  });
});
