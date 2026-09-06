import { TripDetectionState } from '@prisma/client';
import { TripTrackingRecoveryScheduler } from './trip-tracking-recovery.scheduler';
import { TRIP_TRACKING_TRIGGERS } from '../../modules/vehicle-intelligence/trips/trip-detection.types';
import { POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY } from '../../modules/vehicle-intelligence/trips/trip-tracking-retry.policy';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: () => true,
}));

describe('TripTrackingRecoveryScheduler — R3 POSSIBLE_START retry policy', () => {
  function createQueue() {
    const getJob = jest.fn().mockResolvedValue(undefined);
    const add = jest.fn().mockResolvedValue(undefined);
    return { getJob, add };
  }

  it('applies bounded fast retry to recovery-scheduler POSSIBLE_START wake jobs', async () => {
    const trackingQueue = createQueue();
    const lifecycleRecovery = {
      classifyDetectionState: jest.fn().mockResolvedValue({
        classification: 'HEALTHY_POSSIBLE_START',
        action: 'NONE',
      }),
    };
    const staleRow = {
      vehicleId: 'veh-ps',
      organizationId: 'org',
      state: TripDetectionState.POSSIBLE_START,
      possibleStartAt: new Date(),
      vehicle: { latestState: { dimoTokenId: 1 } },
    };
    const scheduler = new TripTrackingRecoveryScheduler(
      trackingQueue as any,
      {
        vehicleTripDetectionState: {
          findMany: jest.fn().mockResolvedValue([staleRow]),
        },
      } as any,
      { shouldRun: () => true } as any,
      undefined,
      lifecycleRecovery as any,
    );

    await scheduler.recoverStaleTripStates();

    expect(trackingQueue.add).toHaveBeenCalledWith(
      'trip-recovery',
      expect.objectContaining({ trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START }),
      expect.objectContaining({
        jobId: 'trip-recovery-veh-ps',
        attempts: POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY.attempts,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
      }),
    );
  });

  it('does not apply POSSIBLE_START retry policy to ACTIVE_TICK recovery jobs', async () => {
    const trackingQueue = createQueue();
    const lifecycleRecovery = {
      classifyDetectionState: jest.fn().mockResolvedValue({
        classification: 'HEALTHY',
        action: 'NONE',
      }),
    };
    const staleRow = {
      vehicleId: 'veh-at',
      organizationId: 'org',
      state: TripDetectionState.ACTIVE_TRIP,
      activeTripId: 'trip-1',
      possibleStartAt: new Date(Date.now() - 5 * 3600_000),
      vehicle: { latestState: { dimoTokenId: 2 } },
    };
    const scheduler = new TripTrackingRecoveryScheduler(
      trackingQueue as any,
      {
        vehicleTripDetectionState: {
          findMany: jest.fn().mockResolvedValue([staleRow]),
        },
      } as any,
      { shouldRun: () => true } as any,
      undefined,
      lifecycleRecovery as any,
    );

    await scheduler.recoverStaleTripStates();

    const jobOptions = trackingQueue.add.mock.calls[0][2];
    expect(trackingQueue.add).toHaveBeenCalledWith(
      'trip-recovery',
      expect.objectContaining({ trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK }),
      expect.any(Object),
    );
    expect(jobOptions.attempts).toBeUndefined();
    expect(jobOptions.backoff).toBeUndefined();
  });
});
