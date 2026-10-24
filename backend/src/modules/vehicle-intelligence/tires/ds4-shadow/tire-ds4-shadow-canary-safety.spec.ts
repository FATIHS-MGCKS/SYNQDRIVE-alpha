import { isTireDs4ShadowVehicleAllowlisted } from '@config/tire-ds4-shadow.config';
import { parseTireDs4ShadowVehicleAllowlistV1 } from './tire-ds4-shadow-vehicle-allowlist.v1';
import { TireDs4ShadowProcessorService } from './tire-ds4-shadow-processor.service';

describe('tire DS4 shadow canary safety', () => {
  const allowlist = parseTireDs4ShadowVehicleAllowlistV1(
    '68868291-5478-42cd-b0c4-cc77b2a78e21,c10351f8-b6a2-4258-947f-631aeaa6d359',
  );

  it('defaults to deny-all when allowlist env would be empty', () => {
    expect(allowlist.kind).toBe('allow_set');
    expect(
      isTireDs4ShadowVehicleAllowlisted(
        parseTireDs4ShadowVehicleAllowlistV1(undefined),
        '68868291-5478-42cd-b0c4-cc77b2a78e21',
      ),
    ).toBe(false);
  });

  it('preserves tenant scoping on allowlisted vehicle (ledger org mismatch)', async () => {
    const prisma = {
      tireTripUsageLedger: { findFirst: jest.fn().mockResolvedValue(null) },
      diV0MotionCoreShadowRunV1: { findFirst: jest.fn() },
    };
    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      { readForTrip: jest.fn() } as never,
      {
        hasTerminalMarker: jest.fn(),
        insertShadowInputImmutable: jest.fn(),
        persistTerminalMarker: jest.fn(),
      } as never,
      { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() } as never,
      {
        enabled: true,
        catchupEnabled: false,
        vehicleAllowlist: allowlist,
        catchupIntervalMs: 300_000,
        catchupBatchSize: 50,
        maxAttempts: 3,
        retryBaseMs: 1000,
      } as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-wrong',
      vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'skipped', reason: 'ledger_not_found_or_invalidated' });
    expect(prisma.tireTripUsageLedger.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-wrong' }),
      }),
    );
  });

  it('still allows replay persistence for allowlisted vehicle', async () => {
    const prisma = {
      tireTripUsageLedger: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ledger-1',
          organizationId: 'org-1',
          vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
          tripId: 'trip-1',
          tireSetupId: 'setup-1',
        }),
      },
      diV0MotionCoreShadowRunV1: {
        findFirst: jest.fn().mockResolvedValue({
          contentFingerprint: 'fp-2',
          shadowBundleVersion: 'bundle',
        }),
      },
    };
    const repository = {
      hasTerminalMarker: jest.fn().mockResolvedValue(true),
      insertShadowInputImmutable: jest.fn().mockResolvedValue('inserted'),
      persistTerminalMarker: jest.fn(),
    };

    const svc = new TireDs4ShadowProcessorService(
      prisma as never,
      {
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
      } as never,
      repository as never,
      { enqueueMaterialize: jest.fn(), computeRetryDelayMs: jest.fn() } as never,
      {
        enabled: true,
        catchupEnabled: false,
        vehicleAllowlist: allowlist,
        catchupIntervalMs: 300_000,
        catchupBatchSize: 50,
        maxAttempts: 3,
        retryBaseMs: 1000,
      } as never,
    );

    const outcome = await svc.processJob({
      organizationId: 'org-1',
      vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      tripId: 'trip-1',
      tireTripUsageLedgerId: 'ledger-1',
      attempt: 0,
    });

    expect(outcome).toEqual({ status: 'persisted', result: 'inserted' });
    expect(repository.insertShadowInputImmutable).toHaveBeenCalled();
  });
});
