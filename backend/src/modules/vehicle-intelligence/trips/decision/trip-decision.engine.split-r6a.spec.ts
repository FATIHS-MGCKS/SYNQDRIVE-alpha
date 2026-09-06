import { TripStatus } from '@prisma/client';

import { TripDecisionEngine } from './trip-decision.engine';

describe('TripDecisionEngine.splitTripAtGap (R6A)', () => {
  it('post-transaction logger failure does not reject committed split result', async () => {
    const firstEndAt = new Date('2026-09-06T12:00:00.000Z');
    const secondStartAt = new Date('2026-09-06T12:03:10.000Z');

    const txClient = {
      vehicleTrip: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'trip-2' }),
      },
      vehicleTripWaypoint: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip-1',
          vehicleId: 'veh-1',
          startTime: new Date('2026-09-06T11:00:00.000Z'),
          distanceKm: 4,
          tripStatus: TripStatus.ONGOING,
        }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      $transaction: jest.fn(async (fn: (client: typeof txClient) => Promise<unknown>) =>
        fn(txClient),
      ),
    };

    const engine = new TripDecisionEngine(prisma as never);
    jest.spyOn((engine as any).logger, 'log').mockImplementation(() => {
      throw new Error('logger boom');
    });

    await expect(
      engine.splitTripAtGap({
        tripId: 'trip-1',
        firstEndAt,
        secondStartAt,
        gapMs: 190_000,
        reason: 'live_mid_trip_gap_split',
        triggeredBy: 'LIVE_FSM',
        splitDriftM: 12,
      }),
    ).resolves.toEqual({
      firstTripId: 'trip-1',
      secondTripId: 'trip-2',
      movedWaypoints: 2,
    });
  });
});
