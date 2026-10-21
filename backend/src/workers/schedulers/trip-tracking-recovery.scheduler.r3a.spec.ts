import { TripDetectionState } from '@prisma/client';
import { TripTrackingRecoveryScheduler } from './trip-tracking-recovery.scheduler';
import { TRIP_TRACKING_TRIGGERS } from '../../modules/vehicle-intelligence/trips/trip-detection.types';
import { buildTripRecoveryJobId } from '../../modules/vehicle-intelligence/trips/trip-tracking-queue.util';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: () => true,
}));

type JobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed';

function createRecoveryQueueHarness(initial: Record<string, JobState> = {}) {
  const states = new Map<string, JobState>(Object.entries(initial));
  const add = jest.fn(async (_name: string, _data: unknown, opts: { jobId: string }) => {
    states.set(opts.jobId, 'waiting');
  });
  const getJob = jest.fn(async (jobId: string) => {
    const state = states.get(jobId);
    if (!state) return undefined;
    return {
      getState: async () => state,
      remove: async () => {
        states.delete(jobId);
      },
    };
  });
  return { add, getJob, states };
}

function buildScheduler(queue: ReturnType<typeof createRecoveryQueueHarness>) {
  const lifecycleRecovery = {
    classifyDetectionState: jest.fn().mockResolvedValue({
      classification: 'HEALTHY_POSSIBLE_START',
      action: 'NONE',
    }),
  };
  const staleRow = {
    vehicleId: 'veh-r',
    organizationId: 'org',
    state: TripDetectionState.POSSIBLE_START,
    possibleStartAt: new Date(),
    vehicle: { latestState: { dimoTokenId: 1 } },
  };
  return new TripTrackingRecoveryScheduler(
    queue as any,
    {
      vehicleTripDetectionState: {
        findMany: jest.fn().mockResolvedValue([staleRow]),
      },
    } as any,
    { shouldRun: () => true } as any,
    undefined,
    lifecycleRecovery as any,
  );
}

describe('TripTrackingRecoveryScheduler — R3A recovery re-wake', () => {
  it('creates fresh wake after prior recovery job exhausted to FAILED', async () => {
    const jobId = buildTripRecoveryJobId('veh-r');
    const queue = createRecoveryQueueHarness({ [jobId]: 'failed' });
    const scheduler = buildScheduler(queue);

    await scheduler.recoverStaleTripStates();

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][2].jobId).toBe(jobId);
    expect(queue.states.get(jobId)).toBe('waiting');
  });

  it('second scheduler pass after FAILED recycles again if job failed again', async () => {
    const jobId = buildTripRecoveryJobId('veh-r');
    const queue = createRecoveryQueueHarness({ [jobId]: 'failed' });
    const scheduler = buildScheduler(queue);

    await scheduler.recoverStaleTripStates();
    queue.states.set(jobId, 'failed');

    await scheduler.recoverStaleTripStates();

    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate when recovery job is WAITING', async () => {
    const jobId = buildTripRecoveryJobId('veh-r');
    const queue = createRecoveryQueueHarness({ [jobId]: 'waiting' });
    const scheduler = buildScheduler(queue);

    await scheduler.recoverStaleTripStates();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('recovery POSSIBLE_START wake still uses fast retry policy', async () => {
    const jobId = buildTripRecoveryJobId('veh-r');
    const queue = createRecoveryQueueHarness({ [jobId]: 'failed' });
    const scheduler = buildScheduler(queue);

    await scheduler.recoverStaleTripStates();

    expect(queue.add.mock.calls[0][1]).toEqual(
      expect.objectContaining({ trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START }),
    );
    expect(queue.add.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        attempts: 4,
        backoff: { type: 'exponential', delay: 5_000 },
      }),
    );
  });
});
