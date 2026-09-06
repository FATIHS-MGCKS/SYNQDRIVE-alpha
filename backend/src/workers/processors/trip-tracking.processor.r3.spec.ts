import { DimoPollJobType, DimoPollStatus, TripDetectionState } from '@prisma/client';
import { TripTrackingProcessor } from './trip-tracking.processor';
import { TRIP_TRACKING_TRIGGERS } from '../../modules/vehicle-intelligence/trips/trip-detection.types';

describe('TripTrackingProcessor — R3 start liveness visibility', () => {
  it('records DimoPollLog FAILURE when POSSIBLE_START throws', async () => {
    const dimoPollLog = { create: jest.fn().mockResolvedValue({}) };
    const orchestration = {
      processPossibleStart: jest.fn().mockRejectedValue(new Error('provider down')),
    };
    const processor = new TripTrackingProcessor(
      { dimoPollLog } as any,
      orchestration as any,
    );

    await expect(
      processor.process({
        data: {
          vehicleId: 'veh-1',
          organizationId: 'org',
          dimoTokenId: 1,
          trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
          requestedAt: new Date().toISOString(),
        },
      } as any),
    ).rejects.toThrow('provider down');

    expect(dimoPollLog.create).toHaveBeenCalledTimes(1);
    expect(dimoPollLog.create.mock.calls[0][0].data.status).toBe(
      DimoPollStatus.FAILURE,
    );
    expect(dimoPollLog.create.mock.calls[0][0].data.jobType).toBe(
      DimoPollJobType.TRIP_TRACKING,
    );
    expect(dimoPollLog.create.mock.calls[0][0].data.errorMessage).toBe(
      'provider down',
    );
  });

  it('records SUCCESS when POSSIBLE_START completes without throw', async () => {
    const dimoPollLog = { create: jest.fn().mockResolvedValue({}) };
    const orchestration = {
      processPossibleStart: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new TripTrackingProcessor(
      { dimoPollLog } as any,
      orchestration as any,
    );

    await processor.process({
      data: {
        vehicleId: 'veh-2',
        organizationId: 'org',
        dimoTokenId: 2,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: new Date().toISOString(),
      },
    } as any);

    expect(dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DimoPollStatus.SUCCESS,
          jobType: DimoPollJobType.TRIP_TRACKING,
        }),
      }),
    );
  });
});
