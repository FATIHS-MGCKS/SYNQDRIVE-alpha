import {
  computePhysicalRefuelRecoveryQuota,
  findPhysicalRefuelRecoveryWork,
} from './physical-refuel-recovery.repository';
import { PhysicalRefuelFinalityState } from '@prisma/client';
import { RETRYABLE_COORDINATE_STATUS_LIST } from './physical-refuel-coordinate-retry.policy';

function mockRecoveryPrisma(overrides?: {
  settlement?: unknown[];
  orphans?: unknown[];
  stale?: unknown[];
  lostEnqueue?: unknown[];
  coordinateInitial?: unknown[];
  coordinateRetry?: unknown[];
}) {
  return {
    vehicleEnergyEventRefuelReconciliation: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(overrides?.settlement ?? [])
        .mockResolvedValueOnce(overrides?.stale ?? [])
        .mockResolvedValueOnce(overrides?.lostEnqueue ?? [])
        .mockResolvedValueOnce(overrides?.coordinateInitial ?? [])
        .mockResolvedValueOnce(overrides?.coordinateRetry ?? []),
    },
    vehicleEnergyEvent: {
      findMany: jest.fn().mockResolvedValue(overrides?.orphans ?? []),
    },
  };
}

describe('G2.1b recovery hardening', () => {
  const recoveryParams = {
    batchSize: 25,
    asOf: new Date('2026-09-04T18:00:00.000Z'),
    v2OwnershipCutoverAt: new Date('2026-09-04T12:00:00.000Z'),
    orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
  };

  it('R3/R4 allocates fair quotas across recovery reasons', () => {
    const quota = computePhysicalRefuelRecoveryQuota(25);
    expect(quota.settlementDue).toBeGreaterThan(0);
    expect(quota.orphanRefuel).toBeGreaterThan(0);
    expect(quota.staleEnrichment).toBeGreaterThan(0);
    expect(quota.lostEnqueue).toBeGreaterThan(0);
    expect(quota.coordinateInitial).toBeGreaterThan(0);
    expect(
      quota.settlementDue +
        quota.orphanRefuel +
        quota.staleEnrichment +
        quota.lostEnqueue +
        quota.coordinateInitial +
        quota.coordinateRetry,
    ).toBe(25);
  });

  it('R3 orphan recovery is not starved by coordinate holds', async () => {
    const prisma = mockRecoveryPrisma({
      orphans: [{ id: 'orphan-1', vehicleId: 'veh-1' }],
    });

    const work = await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);

    expect(work.some((item) => item.reason === 'orphan_refuel')).toBe(true);
  });

  it('lost_enqueue only selects rows with eligible coordinates', async () => {
    const prisma = mockRecoveryPrisma({
      lostEnqueue: [
        {
          vehicleId: 'veh-1',
          energyEventId: 'final-1',
          coordinateLatitude: 51.3,
          coordinateLongitude: 9.5,
          coordinateSource: 'physical_refuel_forecourt_dwell_v2',
        },
      ],
    });

    const work = await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);

    expect(work).toEqual([
      {
        vehicleId: 'veh-1',
        triggerEventId: 'final-1',
        reason: 'lost_enqueue',
      },
    ]);
  });

  it('coordinate_retry selects due rows separately from lost_enqueue', async () => {
    const prisma = mockRecoveryPrisma({
      coordinateRetry: [
        {
          vehicleId: 'veh-2',
          energyEventId: 'hold-1',
        },
      ],
    });

    const work = await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);

    expect(work).toEqual([
      {
        vehicleId: 'veh-2',
        triggerEventId: 'hold-1',
        reason: 'coordinate_retry',
      },
    ]);
    expect(prisma.vehicleEnergyEventRefuelReconciliation.findMany).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        where: expect.objectContaining({
          finalityState: {
            in: [
              PhysicalRefuelFinalityState.FINAL_CANONICAL,
              PhysicalRefuelFinalityState.FINAL_DISTINCT,
            ],
          },
          coordinateSelectionStatus: { in: [...RETRYABLE_COORDINATE_STATUS_LIST] },
          nextCoordinateRetryAt: { lte: recoveryParams.asOf },
        }),
      }),
    );
  });
});
