import {
  computePhysicalRefuelRecoveryQuota,
  findPhysicalRefuelRecoveryWork,
} from './physical-refuel-recovery.repository';
import { PhysicalRefuelFinalityState } from '@prisma/client';

describe('G2.1b recovery hardening', () => {
  it('R3/R4 allocates fair quotas across recovery reasons', () => {
    const quota = computePhysicalRefuelRecoveryQuota(25);
    expect(quota.settlementDue).toBeGreaterThan(0);
    expect(quota.orphanRefuel).toBeGreaterThan(0);
    expect(quota.lostEnqueue).toBeGreaterThan(0);
    expect(
      quota.settlementDue + quota.orphanRefuel + quota.lostEnqueue + quota.coordinateRetry,
    ).toBe(25);
  });

  it('R3 orphan recovery is not starved by coordinate holds', async () => {
    const prisma = {
      vehicleEnergyEventRefuelReconciliation: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      vehicleEnergyEvent: {
        findMany: jest.fn().mockResolvedValue([{ id: 'orphan-1', vehicleId: 'veh-1' }]),
      },
    };

    const work = await findPhysicalRefuelRecoveryWork(prisma as never, {
      batchSize: 25,
      asOf: new Date('2026-09-04T18:00:00.000Z'),
      v2OwnershipCutoverAt: new Date('2026-09-04T12:00:00.000Z'),
      orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(work.some((item) => item.reason === 'orphan_refuel')).toBe(true);
  });

  it('lost_enqueue only selects rows with eligible coordinates', async () => {
    const prisma = {
      vehicleEnergyEventRefuelReconciliation: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              vehicleId: 'veh-1',
              energyEventId: 'final-1',
              coordinateLatitude: 51.3,
              coordinateLongitude: 9.5,
              coordinateSource: 'physical_refuel_forecourt_dwell_v2',
            },
          ])
          .mockResolvedValueOnce([]),
      },
      vehicleEnergyEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const work = await findPhysicalRefuelRecoveryWork(prisma as never, {
      batchSize: 25,
      asOf: new Date('2026-09-04T18:00:00.000Z'),
      v2OwnershipCutoverAt: new Date('2026-09-04T12:00:00.000Z'),
      orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(work).toEqual([
      {
        vehicleId: 'veh-1',
        triggerEventId: 'final-1',
        reason: 'lost_enqueue',
      },
    ]);
  });

  it('coordinate_retry selects due rows separately from lost_enqueue', async () => {
    const prisma = {
      vehicleEnergyEventRefuelReconciliation: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              vehicleId: 'veh-2',
              energyEventId: 'hold-1',
            },
          ]),
      },
      vehicleEnergyEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const work = await findPhysicalRefuelRecoveryWork(prisma as never, {
      batchSize: 25,
      asOf: new Date('2026-09-04T18:00:00.000Z'),
      v2OwnershipCutoverAt: new Date('2026-09-04T12:00:00.000Z'),
      orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(work).toEqual([
      {
        vehicleId: 'veh-2',
        triggerEventId: 'hold-1',
        reason: 'coordinate_retry',
      },
    ]);
    expect(prisma.vehicleEnergyEventRefuelReconciliation.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          finalityState: {
            in: [
              PhysicalRefuelFinalityState.FINAL_CANONICAL,
              PhysicalRefuelFinalityState.FINAL_DISTINCT,
            ],
          },
        }),
      }),
    );
  });
});
