import { TireDs4ShadowRepository } from './tire-ds4-shadow.repository';
import { TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED } from './tire-ds4-shadow-terminal-runs';
import type { TireDs4ShadowPersistInput } from './tire-ds4-shadow.types';

function basePersistInput(overrides: Partial<TireDs4ShadowPersistInput> = {}): TireDs4ShadowPersistInput {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    tireSetupId: 'setup-1',
    tireTripUsageLedgerId: 'ledger-1',
    diV0MotionCoreShadowRunId: 'run-1',
    workItemId: 'wi-1',
    combinedInputIdentity: 'ci',
    pinnedSnapshotHash: 'pin',
    contentFingerprint: 'fp-1',
    shadowBundleVersion: 'bundle',
    speedAuthority: 'C4_ONLY',
    eventsAlgorithmVersion: 'ev',
    adapterVersion: 'tire-ds4-shadow-input-v1.0.1',
    eventQualityCoverage: 'NONE',
    temporalCoverage: 'UNVERIFIED',
    ds4ReadStatus: 'SUCCEEDED_EMPTY',
    inputPayload: {
      schemaVersion: 2,
      neutral: true,
      shadowBundleVersion: 'bundle',
      acceleration: {
        okCount: 0,
        okDurationS: 0,
        okDeltaKmhAbsSum: 0,
        degradedCount: 0,
        limitedCount: 0,
        excludedArtefactCount: 0,
        excludedOtherQualityCount: 0,
      },
      deceleration: {
        okCount: 0,
        okDurationS: 0,
        okDeltaKmhAbsSum: 0,
        degradedCount: 0,
        limitedCount: 0,
        excludedArtefactCount: 0,
        excludedOtherQualityCount: 0,
      },
      eventQualityCoverage: 'NONE',
      temporalCoverage: 'UNVERIFIED',
      limitations: [],
      newerFailedRunId: null,
      newerFailedRunStatus: null,
    },
    ...overrides,
  };
}

describe('TireDs4ShadowRepository', () => {
  it('inserts when no row exists', async () => {
    const prisma = {
      tireDs4MotionShadowInputV1: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'row-1' }),
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    const repo = new TireDs4ShadowRepository(prisma as never);
    const result = await repo.insertShadowInputImmutable(basePersistInput());
    expect(result).toBe('inserted');
    expect(prisma.tireDs4MotionShadowInputV1.create).toHaveBeenCalled();
  });

  it('returns unchanged when fingerprint matches', async () => {
    const prisma = {
      tireDs4MotionShadowInputV1: {
        findUnique: jest.fn().mockResolvedValue({ id: 'row-1', contentFingerprint: 'fp-1' }),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    const repo = new TireDs4ShadowRepository(prisma as never);
    const result = await repo.insertShadowInputImmutable(basePersistInput());
    expect(result).toBe('unchanged');
    expect(prisma.tireDs4MotionShadowInputV1.create).not.toHaveBeenCalled();
  });

  it('returns evidence_immutable_conflict when fingerprint differs', async () => {
    const prisma = {
      tireDs4MotionShadowInputV1: {
        findUnique: jest.fn().mockResolvedValue({ id: 'row-1', contentFingerprint: 'fp-old' }),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    const repo = new TireDs4ShadowRepository(prisma as never);
    const result = await repo.insertShadowInputImmutable(basePersistInput());
    expect(result).toBe('evidence_immutable_conflict');
    expect(prisma.tireDs4MotionShadowInputV1.create).not.toHaveBeenCalled();
  });

  it('detects terminal marker rows', async () => {
    const prisma = {
      tireDs4MotionShadowInputV1: {
        findFirst: jest.fn().mockResolvedValue({ id: 't-1' }),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    const repo = new TireDs4ShadowRepository(prisma as never);
    const has = await repo.hasTerminalMarker('ledger-1', 'tire-ds4-shadow-input-v1.0.1');
    expect(has).toBe(true);
    expect(prisma.tireDs4MotionShadowInputV1.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          diV0MotionCoreShadowRunId: { in: expect.arrayContaining([TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED]) },
        }),
      }),
    );
  });

  it('delegates catch-up candidate discovery to SQL', async () => {
    const prisma = {
      tireDs4MotionShadowInputV1: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          tire_trip_usage_ledger_id: 'ledger-9',
          organization_id: 'org-1',
          vehicle_id: 'veh-1',
          trip_id: 'trip-9',
          catchup_reason: 'newer_ds4_run',
        },
      ]),
    };
    const repo = new TireDs4ShadowRepository(prisma as never);
    const rows = await repo.findCatchupCandidates('tire-ds4-shadow-input-v1.0.1', 10, ['veh-1']);
    expect(rows).toEqual([
      {
        tireTripUsageLedgerId: 'ledger-9',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-9',
        reason: 'newer_ds4_run',
      },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('returns no catch-up candidates when vehicle allowlist is empty', async () => {
    const prisma = {
      tireDs4MotionShadowInputV1: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
      $queryRaw: jest.fn(),
    };
    const repo = new TireDs4ShadowRepository(prisma as never);
    const rows = await repo.findCatchupCandidates('tire-ds4-shadow-input-v1.0.1', 10, []);
    expect(rows).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
