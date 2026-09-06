import { TripStatus } from '@prisma/client';

import { TripDecisionEngine } from './trip-decision.engine';

describe('TripDecisionEngine terminal mutations (R7A)', () => {
  it('finalizeTrip: post-write logger failure does not reject committed trip', async () => {
    const endTime = new Date('2026-09-06T13:58:00.000Z');
    const updatedTrip = {
      id: 'trip-1',
      tripStatus: TripStatus.COMPLETED,
      endTime,
    };

    const prisma = {
      vehicleTrip: {
        update: jest.fn().mockResolvedValue(updatedTrip),
      },
    };

    const engine = new TripDecisionEngine(prisma as never);
    jest.spyOn((engine as any).logger, 'log').mockImplementation(() => {
      throw new Error('logger boom');
    });

    await expect(
      engine.finalizeTrip('trip-1', {
        endTime,
        endDetectionMode: 'COMPOSITE_INACTIVITY',
      }),
    ).resolves.toEqual(updatedTrip);
  });

  it('discardTrip: post-write logger failure does not reject committed discard', async () => {
    const prisma = {
      vehicleTrip: {
        update: jest.fn().mockResolvedValue({ id: 'trip-1' }),
      },
    };

    const engine = new TripDecisionEngine(prisma as never);
    jest.spyOn((engine as any).logger, 'log').mockImplementation(() => {
      throw new Error('logger boom');
    });

    await expect(engine.discardTrip('trip-1', 'quality_check_failed')).resolves.toBeUndefined();
  });

  it('finalizeTrip: vehicleTrip.update rejection still propagates', async () => {
    const prisma = {
      vehicleTrip: {
        update: jest.fn().mockRejectedValue(new Error('db write failed')),
      },
    };

    const engine = new TripDecisionEngine(prisma as never);

    await expect(
      engine.finalizeTrip('trip-1', {
        endTime: new Date(),
        endDetectionMode: 'COMPOSITE_INACTIVITY',
      }),
    ).rejects.toThrow('db write failed');
  });

  it('discardTrip: vehicleTrip.update rejection still propagates', async () => {
    const prisma = {
      vehicleTrip: {
        update: jest.fn().mockRejectedValue(new Error('db write failed')),
      },
    };

    const engine = new TripDecisionEngine(prisma as never);

    await expect(engine.discardTrip('trip-1', 'quality_check_failed')).rejects.toThrow(
      'db write failed',
    );
  });
});
