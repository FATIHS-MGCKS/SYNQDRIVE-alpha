import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
import {
  buildTripRecoveryJobId,
  buildTripTrackingSuccessorJobId,
  enqueueRecoveryTripTrackingJob,
  enqueueStableTripTrackingJob,
  simulateLegacyActiveSelfReschedule,
  type TripTrackingQueueJobState,
  type TripTrackingQueueLike,
} from './trip-tracking-queue.util';
import { POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY } from './trip-tracking-retry.policy';

function makeJobData(vehicleId = 'veh-1'): TripTrackingJobData {
  return {
    vehicleId,
    organizationId: 'org',
    dimoTokenId: 1,
    trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
    requestedAt: new Date().toISOString(),
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

describe('trip-tracking queue handoff — R3A', () => {
  describe('R3A.1 legacy self-reschedule race', () => {
    it('one event-loop deferral does not create successor while primary stays ACTIVE', async () => {
      const queue = createQueueHarness({ 'trip-ps-veh-1': 'active' });

      await simulateLegacyActiveSelfReschedule({
        queue,
        jobName: 'trip-tracking',
        jobId: 'trip-ps-veh-1',
        data: makeJobData(),
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        delayMs: 30_000,
      });

      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('R3A.2 durable ACTIVE self-reschedule successor', () => {
    it('A — schedules durable successor while primary ACTIVE', async () => {
      const queue = createQueueHarness({ 'trip-ps-veh-1': 'active' });

      const outcome = await enqueueStableTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId: 'trip-ps-veh-1',
        data: makeJobData(),
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        delayMs: 30_000,
      });

      expect(outcome).toBe('successor');
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][2].jobId).toBe(
        buildTripTrackingSuccessorJobId('trip-ps-veh-1'),
      );
      expect(queue.add.mock.calls[0][2].delay).toBe(30_000);
    expect(queue.add.mock.calls[0][1].handoffKind).toBe('stable_successor');
    expect(queue.add.mock.calls[0][1].handoffPrimaryJobId).toBe('trip-ps-veh-1');
      expect(queue.states.get('trip-ps-veh-1')).toBe('active');
      expect(queue.states.has(buildTripTrackingSuccessorJobId('trip-ps-veh-1'))).toBe(
        true,
      );
    });

    it('B — repeated successor requests dedupe to one successor', async () => {
      const queue = createQueueHarness({ 'trip-ps-veh-1': 'active' });
      const params = {
        queue,
        jobName: 'trip-tracking',
        jobId: 'trip-ps-veh-1',
        data: makeJobData(),
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        delayMs: 30_000,
      };

      expect(await enqueueStableTripTrackingJob(params)).toBe('successor');
      expect(await enqueueStableTripTrackingJob(params)).toBe('skipped');
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('C — POSSIBLE_START successor keeps 4-attempt/5s retry config', async () => {
      const queue = createQueueHarness({ 'trip-ps-veh-1': 'active' });

      await enqueueStableTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId: 'trip-ps-veh-1',
        data: makeJobData(),
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        delayMs: 30_000,
      });

      const opts = queue.add.mock.calls[0][2];
      expect(opts.attempts).toBe(
        POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY.attempts,
      );
      expect(opts.backoff).toEqual({
        type: 'exponential',
        delay: 5_000,
      });
    });

    it('D — primary WAITING successor request is skipped without duplicate', async () => {
      const queue = createQueueHarness({ 'trip-ps-veh-1': 'waiting' });

      expect(
        await enqueueStableTripTrackingJob({
          queue,
          jobName: 'trip-tracking',
          jobId: 'trip-ps-veh-1',
          data: makeJobData(),
          trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
          delayMs: 30_000,
        }),
      ).toBe('skipped');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('E — ACTIVE_TICK self-reschedule uses successor without PS retry on AT', async () => {
      const queue = createQueueHarness({
        'trip-at-veh-1-trip-9': 'active',
      });

      await enqueueStableTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId: 'trip-at-veh-1-trip-9',
        data: {
          ...makeJobData(),
          trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        },
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        delayMs: 30_000,
      });

      const opts = queue.add.mock.calls[0][2];
      expect(opts.jobId).toBe(
        buildTripTrackingSuccessorJobId('trip-at-veh-1-trip-9'),
      );
      expect(opts.attempts).toBeUndefined();
      expect(opts.backoff).toBeUndefined();
    });

    it('F — POSSIBLE_END_CHECK successor unchanged retry semantics', async () => {
      const queue = createQueueHarness({
        'trip-pec-veh-1-trip-9': 'active',
      });

      await enqueueStableTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId: 'trip-pec-veh-1-trip-9',
        data: {
          ...makeJobData(),
          trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
        },
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
        delayMs: 30_000,
      });

      const opts = queue.add.mock.calls[0][2];
      expect(opts.attempts).toBeUndefined();
    });

    it('recycles FAILED primary before reuse', async () => {
      const queue = createQueueHarness({ 'trip-ps-veh-1': 'failed' });
      const removeSpy = jest.fn(async () => {
        queue.states.delete('trip-ps-veh-1');
      });
      queue.getJob.mockResolvedValue({
        getState: async () => 'failed' as const,
        remove: removeSpy,
      });

      await enqueueStableTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId: 'trip-ps-veh-1',
        data: makeJobData(),
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      });

      expect(removeSpy).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'trip-tracking',
        expect.any(Object),
        expect.objectContaining({ jobId: 'trip-ps-veh-1' }),
      );
    });
  });

  describe('R3A.4 recovery failed-job recycling', () => {
    const recoveryParams = (vehicleId: string) => ({
      queue: createQueueHarness(),
      vehicleId,
      jobName: 'trip-recovery',
      data: makeJobData(vehicleId),
      trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
    });

    it('1–2 — FAILED recovery job is removed and fresh wake enqueued', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'failed',
      });
      const params = { ...recoveryParams('veh-r'), queue };

      expect(await enqueueRecoveryTripTrackingJob(params)).toBe('enqueued');
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.states.has(buildTripRecoveryJobId('veh-r'))).toBe(true);
    });

    it('3 — WAITING recovery job skips duplicate', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'waiting',
      });

      expect(
        await enqueueRecoveryTripTrackingJob({ ...recoveryParams('veh-r'), queue }),
      ).toBe('skipped');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('4 — DELAYED recovery job skips duplicate', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'delayed',
      });

      expect(
        await enqueueRecoveryTripTrackingJob({ ...recoveryParams('veh-r'), queue }),
      ).toBe('skipped');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('5 — ACTIVE recovery job skips duplicate', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'active',
      });

      expect(
        await enqueueRecoveryTripTrackingJob({ ...recoveryParams('veh-r'), queue }),
      ).toBe('skipped');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('6 — COMPLETED recovery job is recycled for new wake', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'completed',
      });

      expect(
        await enqueueRecoveryTripTrackingJob({ ...recoveryParams('veh-r'), queue }),
      ).toBe('enqueued');
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('7 — repeated scheduler passes do not pile duplicates when WAITING', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'waiting',
      });
      const params = { ...recoveryParams('veh-r'), queue };

      expect(await enqueueRecoveryTripTrackingJob(params)).toBe('skipped');
      expect(await enqueueRecoveryTripTrackingJob(params)).toBe('skipped');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('8 — recovery POSSIBLE_START keeps fast retry policy', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'failed',
      });

      await enqueueRecoveryTripTrackingJob({
        ...recoveryParams('veh-r'),
        queue,
      });

      expect(queue.add.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          attempts: 4,
          backoff: { type: 'exponential', delay: 5_000 },
        }),
      );
    });

    it('9 — recovery ACTIVE_TICK has no PS retry policy', async () => {
      const queue = createQueueHarness({
        [buildTripRecoveryJobId('veh-r')]: 'failed',
      });

      await enqueueRecoveryTripTrackingJob({
        queue,
        vehicleId: 'veh-r',
        jobName: 'trip-recovery',
        data: {
          ...makeJobData('veh-r'),
          trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        },
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      });

      const opts = queue.add.mock.calls[0][2];
      expect(opts.attempts).toBeUndefined();
      expect(opts.backoff).toBeUndefined();
    });
  });
});
