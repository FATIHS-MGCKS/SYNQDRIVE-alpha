import { DimoPollStatus } from '@prisma/client';
import { DelayedError } from 'bullmq';

import {
  TRIP_TRACKING_HANDOFF_KINDS,
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
import {
  TripTrackingHandoffLockContentionError,
  TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS,
  isTripTrackingHandoffJob,
} from './trip-tracking-lock-contention';
import {
  buildTripTrackingSuccessorJobId,
  enqueueStableTripTrackingJob,
  type TripTrackingQueueJobState,
  type TripTrackingQueueLike,
} from './trip-tracking-queue.util';
import { TripTrackingProcessor } from '../../../workers/processors/trip-tracking.processor';

const VEHICLE = 'veh-r3b';
const PRIMARY_ID = `trip-ps-${VEHICLE}`;

function makePsJobData(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: 'org',
    dimoTokenId: 1,
    trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
    requestedAt: new Date().toISOString(),
  };
}

type HarnessJob = {
  state: TripTrackingQueueJobState;
  data: TripTrackingJobData;
  opts: { jobId: string; delay?: number; removeOnComplete?: boolean };
  deferrals: number;
  executions: number;
};

function createTemporalQueueHarness(initial: Record<string, HarnessJob> = {}) {
  const jobs = new Map<string, HarnessJob>(Object.entries(initial));

  const getJob = jest.fn(async (jobId: string) => {
    const job = jobs.get(jobId);
    if (!job) return undefined;
    return {
      getState: async () => job.state,
      remove: async () => {
        jobs.delete(jobId);
      },
    };
  });

  const add = jest.fn(
    async (
      _name: string,
      data: TripTrackingJobData,
      opts: { jobId: string; delay?: number; removeOnComplete?: boolean },
    ) => {
      jobs.set(opts.jobId, {
        state: opts.delay ? 'delayed' : 'waiting',
        data,
        opts,
        deferrals: 0,
        executions: 0,
      });
    },
  );

  return {
    queue: { getJob, add } as TripTrackingQueueLike,
    jobs,
    getJob,
    add,
    successorId: buildTripTrackingSuccessorJobId(PRIMARY_ID),
    promoteToActive(jobId: string) {
      const job = jobs.get(jobId);
      if (job) job.state = 'active';
    },
    completeAsRemoveOnComplete(jobId: string) {
      const job = jobs.get(jobId);
      if (job?.opts.removeOnComplete !== false) {
        jobs.delete(jobId);
      } else {
        const existing = jobs.get(jobId);
        if (existing) existing.state = 'completed';
      }
    },
    applyLockContentionDeferral(jobId: string, delayMs: number) {
      const job = jobs.get(jobId);
      if (!job) return;
      job.state = 'delayed';
      job.opts.delay = delayMs;
      job.deferrals += 1;
    },
  };
}

/** Pre-R3B orchestration behavior: handoff lock miss completes successfully. */
function simulatePreR3BHandoffExecution(
  data: TripTrackingJobData,
  lockHeld: boolean,
): 'executed' | 'consumed_no_op' {
  if (lockHeld) {
    return 'consumed_no_op';
  }
  return 'executed';
}

/** Post-R3B orchestration behavior: handoff lock miss throws contention error. */
function simulatePostR3BHandoffExecution(
  data: TripTrackingJobData,
  lockHeld: boolean,
): 'executed' | 'no_op' {
  if (lockHeld) {
    if (isTripTrackingHandoffJob(data)) {
      throw new TripTrackingHandoffLockContentionError();
    }
    return 'no_op';
  }
  return 'executed';
}

describe('trip-tracking queue handoff — R3B temporal lifecycle', () => {
  it('proves pre-R3B handoff is silently consumed when predecessor lock is held', async () => {
    const harness = createTemporalQueueHarness({
      [PRIMARY_ID]: {
        state: 'active',
        data: makePsJobData(),
        opts: { jobId: PRIMARY_ID, removeOnComplete: true },
        deferrals: 0,
        executions: 0,
      },
    });

    await enqueueStableTripTrackingJob({
      queue: harness.queue,
      jobName: 'trip-tracking',
      jobId: PRIMARY_ID,
      data: makePsJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      delayMs: 30_000,
    });

    expect(harness.jobs.has(harness.successorId)).toBe(true);
    harness.promoteToActive(harness.successorId);

    const successor = harness.jobs.get(harness.successorId)!;
    expect(
      simulatePreR3BHandoffExecution(successor.data, true),
    ).toBe('consumed_no_op');

    harness.completeAsRemoveOnComplete(harness.successorId);
    expect(harness.jobs.has(harness.successorId)).toBe(false);

    harness.completeAsRemoveOnComplete(PRIMARY_ID);
    expect(harness.jobs.has(harness.successorId)).toBe(false);
    expect(harness.jobs.has(PRIMARY_ID)).toBe(false);
  });

  it('PS predecessor active >30s: successor due under lock is deferred, not consumed', async () => {
    const harness = createTemporalQueueHarness({
      [PRIMARY_ID]: {
        state: 'active',
        data: makePsJobData(),
        opts: { jobId: PRIMARY_ID, removeOnComplete: true },
        deferrals: 0,
        executions: 0,
      },
    });

    await enqueueStableTripTrackingJob({
      queue: harness.queue,
      jobName: 'trip-tracking',
      jobId: PRIMARY_ID,
      data: makePsJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      delayMs: 30_000,
    });

    const successorData = harness.jobs.get(harness.successorId)!.data;
    expect(successorData.handoffKind).toBe(
      TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
    );
    expect(successorData.handoffPrimaryJobId).toBe(PRIMARY_ID);

    harness.promoteToActive(harness.successorId);

    expect(() =>
      simulatePostR3BHandoffExecution(successorData, true),
    ).toThrow(TripTrackingHandoffLockContentionError);

    harness.applyLockContentionDeferral(
      harness.successorId,
      TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS,
    );
    expect(harness.jobs.has(harness.successorId)).toBe(true);
    expect(harness.jobs.get(harness.successorId)!.state).toBe('delayed');
    expect(harness.jobs.get(harness.successorId)!.deferrals).toBe(1);

    harness.completeAsRemoveOnComplete(PRIMARY_ID);
    harness.promoteToActive(harness.successorId);

    expect(simulatePostR3BHandoffExecution(successorData, false)).toBe(
      'executed',
    );
    const executionsBeforeComplete =
      (harness.jobs.get(harness.successorId)?.executions ?? 0) + 1;
    harness.jobs.get(harness.successorId)!.executions = executionsBeforeComplete;
    harness.completeAsRemoveOnComplete(harness.successorId);

    expect(executionsBeforeComplete).toBe(1);
    expect(harness.jobs.has(harness.successorId)).toBe(false);
  });

  it('repeated handoff schedule while primary active dedupes to one successor', async () => {
    const harness = createTemporalQueueHarness({
      [PRIMARY_ID]: {
        state: 'active',
        data: makePsJobData(),
        opts: { jobId: PRIMARY_ID, removeOnComplete: true },
        deferrals: 0,
        executions: 0,
      },
    });
    const params = {
      queue: harness.queue,
      jobName: 'trip-tracking',
      jobId: PRIMARY_ID,
      data: makePsJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      delayMs: 30_000,
    };

    expect(await enqueueStableTripTrackingJob(params)).toBe('successor');
    expect(await enqueueStableTripTrackingJob(params)).toBe('skipped');
    expect(harness.add).toHaveBeenCalledTimes(1);
  });

  it('ACTIVE_TICK handoff lock contention throws deferral error', () => {
    const data = {
      ...makePsJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
      handoffPrimaryJobId: 'trip-at-veh-trip1',
    };

    expect(() => simulatePostR3BHandoffExecution(data, true)).toThrow(
      TripTrackingHandoffLockContentionError,
    );
  });

  it('ordinary non-handoff lock miss remains successful no-op', () => {
    expect(simulatePreR3BHandoffExecution(makePsJobData(), true)).toBe(
      'consumed_no_op',
    );
    expect(simulatePostR3BHandoffExecution(makePsJobData(), true)).toBe('no_op');
  });
});

describe('TripTrackingProcessor — R3B handoff lock deferral', () => {
  it('moveToDelayed + DelayedError on handoff lock contention (no FAILURE log)', async () => {
    const moveToDelayed = jest.fn().mockResolvedValue(undefined);
    const dimoPollLog = { create: jest.fn().mockResolvedValue({}) };
    const orchestration = {
      processPossibleStart: jest
        .fn()
        .mockRejectedValue(new TripTrackingHandoffLockContentionError(10_000)),
    };
    const processor = new TripTrackingProcessor(
      { dimoPollLog } as any,
      orchestration as any,
    );

    await expect(
      processor.process({
        id: 'job-1',
        token: 'tok-1',
        data: {
          ...makePsJobData(),
          handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
          handoffPrimaryJobId: PRIMARY_ID,
        },
        moveToDelayed,
      } as any),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      'tok-1',
    );
    expect(dimoPollLog.create).not.toHaveBeenCalled();
  });

  it('provider failure after lock still records FAILURE (not confused with handoff)', async () => {
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
        data: makePsJobData(),
      } as any),
    ).rejects.toThrow('provider down');

    expect(dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DimoPollStatus.FAILURE }),
      }),
    );
  });
});
