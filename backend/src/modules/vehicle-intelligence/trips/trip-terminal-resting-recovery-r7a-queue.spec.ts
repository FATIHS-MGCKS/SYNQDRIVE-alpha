import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
import {
  buildTripTrackingSuccessorJobId,
  enqueueStableTripTrackingJob,
  type TripTrackingQueueJobState,
  type TripTrackingQueueLike,
} from './trip-tracking-queue.util';

const VEHICLE = 'veh-r7a';
const TRIP1 = 'trip-r7a-1';
const PRIMARY_JOB_ID = `trip-fin-${VEHICLE}-${TRIP1}`;

function makeFinalizeJobData(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: 'org-r7a',
    dimoTokenId: 89,
    trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
    requestedAt: new Date('2026-09-06T15:00:00.000Z').toISOString(),
  };
}

function createQueueHarness(
  initial: Record<string, TripTrackingQueueJobState> = {},
): TripTrackingQueueLike & {
  add: jest.Mock;
  getJob: jest.Mock;
  states: Map<string, TripTrackingQueueJobState>;
} {
  const states = new Map<string, TripTrackingQueueJobState>(
    Object.entries(initial),
  );

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

  const add = jest.fn(
    async (
      _name: string,
      _data: TripTrackingJobData,
      opts: { jobId: string; delay?: number },
    ) => {
      states.set(opts.jobId, opts.delay ? 'delayed' : 'waiting');
    },
  );

  return { getJob, add, states };
}

describe('R7A — stable FINALIZE successor while primary ACTIVE', () => {
  it('R7A.16 recovery wake uses successor slot with stable_successor handoff', async () => {
    const queue = createQueueHarness({ [PRIMARY_JOB_ID]: 'active' });

    const outcome = await enqueueStableTripTrackingJob({
      queue,
      jobName: 'trip-tracking',
      jobId: PRIMARY_JOB_ID,
      data: makeFinalizeJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
      delayMs: 0,
    });

    expect(outcome).toBe('successor');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][2].jobId).toBe(
      buildTripTrackingSuccessorJobId(PRIMARY_JOB_ID),
    );
    expect(queue.add.mock.calls[0][1].handoffKind).toBe('stable_successor');
    expect(queue.add.mock.calls[0][1].handoffPrimaryJobId).toBe(PRIMARY_JOB_ID);
    expect(queue.states.get(PRIMARY_JOB_ID)).toBe('active');
  });

  it('repeated recovery wake dedupes to one successor job', async () => {
    const queue = createQueueHarness({ [PRIMARY_JOB_ID]: 'active' });
    const params = {
      queue,
      jobName: 'trip-tracking',
      jobId: PRIMARY_JOB_ID,
      data: makeFinalizeJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
      delayMs: 0,
    };

    expect(await enqueueStableTripTrackingJob(params)).toBe('successor');
    expect(await enqueueStableTripTrackingJob(params)).toBe('skipped');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
