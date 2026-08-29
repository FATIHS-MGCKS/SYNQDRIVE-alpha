import { Test } from '@nestjs/testing';

import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '../../modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import { TripReconciliationScheduler } from './trip-reconciliation.scheduler';

describe('TripReconciliationScheduler cohort independence', () => {
  let scheduler: TripReconciliationScheduler;
  let vlsFindMany: jest.Mock;
  let reconcileWindow: jest.Mock;

  beforeEach(async () => {
    vlsFindMany = jest.fn().mockResolvedValue([]);
    reconcileWindow = jest.fn().mockResolvedValue({
      repairsProposed: 0,
      repairsApplied: 0,
      repairsRejected: 0,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripReconciliationScheduler,
        {
          provide: PrismaService,
          useValue: {
            vehicleLatestState: { findMany: vlsFindMany },
          },
        },
        {
          provide: TripReconciliationService,
          useValue: { reconcileWindow },
        },
      ],
    }).compile();

    scheduler = moduleRef.get(TripReconciliationScheduler);
  });

  it('fast repair uses activity-based cohort (not providerFetchedAt alone)', async () => {
    await scheduler.fastRepair();

    expect(vlsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
        orderBy: { lastSeenAt: 'desc' },
      }),
    );
    const where = vlsFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('providerFetchedAt');
    expect(JSON.stringify(where)).toContain('lastSeenAt');
    expect(JSON.stringify(where)).toContain('lastActivityAt');
    expect(where).not.toHaveProperty('connectionStatus');
    expect(where).not.toHaveProperty('dimoVehicle');
  });

  it('warm repair selects vehicles by dimoTokenId only — not connectionStatus', async () => {
    vlsFindMany.mockResolvedValue([
      { vehicleId: 'veh-disconnected-but-token' },
      { vehicleId: 'veh-connected' },
    ]);

    await scheduler.warmRepair();

    expect(vlsFindMany).toHaveBeenCalledWith({
      where: { dimoTokenId: { not: null } },
      select: { vehicleId: true },
    });
    expect(reconcileWindow).toHaveBeenCalledTimes(2);
    expect(reconcileWindow).toHaveBeenCalledWith(
      'veh-disconnected-but-token',
      expect.any(Date),
      expect.any(Date),
      'warm',
      { useDimoSegmentFallback: true },
    );
  });

  it('cold repair uses the same token-only cohort as warm', async () => {
    vlsFindMany.mockResolvedValue([{ vehicleId: 'veh-1' }]);

    await scheduler.coldRepair();

    expect(vlsFindMany).toHaveBeenCalledWith({
      where: { dimoTokenId: { not: null } },
      select: { vehicleId: true },
    });
    expect(reconcileWindow).toHaveBeenCalledWith(
      'veh-1',
      expect.any(Date),
      expect.any(Date),
      'cold',
      { useDimoSegmentFallback: true },
    );
  });
});
