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
  HANDOFF_PREDECESSOR_SETTLED_TERMINAL_STATES,
  HANDOFF_PREDECESSOR_UNSETTLED_STATES,
  TripTrackingHandoffPredecessorNotSettledError,
  assertHandoffPredecessorSettled,
  isHandoffPredecessorSettledTerminalState,
  isHandoffPredecessorUnsettledState,
} from './trip-tracking-handoff-settlement';
import {
  buildTripTrackingSuccessorJobId,
  enqueueStableTripTrackingJob,
  type TripTrackingQueueJobState,
  type TripTrackingQueueLike,
} from './trip-tracking-queue.util';
import { TripTrackingProcessor } from '../../../workers/processors/trip-tracking.processor';

const VEHICLE = 'veh-r3c';
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
  orchestrationRuns: number;
  vehicleLockHeld: boolean;
};

function createTemporalQueueHarness(initial: Record<string, HarnessJob> = {}) {
  const jobs = new Map<string, HarnessJob>(Object.entries(initial));
  let vehicleLockHeld = initial[PRIMARY_ID]?.vehicleLockHeld ?? false;

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
        orchestrationRuns: 0,
        vehicleLockHeld: false,
      });
    },
  );

  const queue = { getJob, add } as TripTrackingQueueLike;

  async function runSuccessorAttempt(successorId: string): Promise<
    'settlement_deferred' | 'lock_deferred' | 'executed' | 'skipped_enqueue'
  > {
    const job = jobs.get(successorId);
    if (!job) {
      throw new Error(`missing successor ${successorId}`);
    }

    try {
      await assertHandoffPredecessorSettled(job.data, queue);
    } catch (err) {
      if (err instanceof TripTrackingHandoffPredecessorNotSettledError) {
        job.state = 'delayed';
        job.deferrals += 1;
        return 'settlement_deferred';
      }
      throw err;
    }

    if (vehicleLockHeld && isTripTrackingHandoffJob(job.data)) {
      job.state = 'delayed';
      job.deferrals += 1;
      return 'lock_deferred';
    }

    job.orchestrationRuns += 1;

    const enqueueOutcome = await enqueueStableTripTrackingJob({
      queue,
      jobName: 'trip-tracking',
      jobId: PRIMARY_ID,
      data: makePsJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      delayMs: 30_000,
    });

    if (enqueueOutcome === 'skipped') {
      return 'skipped_enqueue';
    }

    return 'executed';
  }

  return {
    queue,
    jobs,
    getJob,
    add,
    successorId: buildTripTrackingSuccessorJobId(PRIMARY_ID),
    vehicleLockHeld: {
      get: () => vehicleLockHeld,
      set: (held: boolean) => {
        vehicleLockHeld = held;
      },
    },
    promoteToActive(jobId: string) {
      const job = jobs.get(jobId);
      if (job) job.state = 'active';
    },
    completeAsRemoveOnComplete(jobId: string) {
      const job = jobs.get(jobId);
      if (job?.opts.removeOnComplete !== false) {
        jobs.delete(jobId);
      } else if (job) {
        job.state = 'completed';
      }
    },
    setPredecessorState(jobId: string, state: TripTrackingQueueJobState) {
      const job = jobs.get(jobId);
      if (job) job.state = state;
    },
    runSuccessorAttempt,
  };
}

/** Pre-R3C: settlement gate absent — successor runs while predecessor BullMQ ACTIVE. */
async function simulatePreR3CSuccessorRun(
  harness: ReturnType<typeof createTemporalQueueHarness>,
): Promise<'executed' | 'skipped_enqueue'> {
  const job = harness.jobs.get(harness.successorId)!;
  if (harness.vehicleLockHeld.get() && isTripTrackingHandoffJob(job.data)) {
    job.state = 'delayed';
    job.deferrals += 1;
    return 'skipped_enqueue';
  }

  job.orchestrationRuns += 1;
  const outcome = await enqueueStableTripTrackingJob({
    queue: harness.queue,
    jobName: 'trip-tracking',
    jobId: PRIMARY_ID,
    data: makePsJobData(),
    trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
    delayMs: 30_000,
  });
  return outcome === 'skipped' ? 'skipped_enqueue' : 'executed';
}

describe('trip-tracking queue handoff — R3C predecessor settlement', () => {
  it('proves pre-R3C race: successor schedules while predecessor BullMQ ACTIVE → SKIPPED', async () => {
    const harness = createTemporalQueueHarness({
      [PRIMARY_ID]: {
        state: 'active',
        data: makePsJobData(),
        opts: { jobId: PRIMARY_ID, removeOnComplete: true },
        deferrals: 0,
        orchestrationRuns: 0,
        vehicleLockHeld: true,
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

    harness.promoteToActive(harness.successorId);
    harness.vehicleLockHeld.set(false);

    expect(await simulatePreR3CSuccessorRun(harness)).toBe('skipped_enqueue');
    expect(harness.jobs.get(harness.successorId)!.orchestrationRuns).toBe(1);
    expect(harness.jobs.has(PRIMARY_ID)).toBe(true);
    expect(
      harness.jobs.get(PRIMARY_ID)!.state,
    ).toBe('active');

    harness.completeAsRemoveOnComplete(harness.successorId);
    harness.completeAsRemoveOnComplete(PRIMARY_ID);

    const delayedPrimary = [...harness.jobs.values()].filter(
      (j) => j.opts.jobId === PRIMARY_ID && j.state === 'delayed',
    );
    expect(delayedPrimary).toHaveLength(0);
  });

  it('R3C end-to-end: DB lock free + predecessor ACTIVE → defer → settle → next primary', async () => {
    const harness = createTemporalQueueHarness({
      [PRIMARY_ID]: {
        state: 'active',
        data: makePsJobData(),
        opts: { jobId: PRIMARY_ID, removeOnComplete: true },
        deferrals: 0,
        orchestrationRuns: 0,
        vehicleLockHeld: true,
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

    harness.promoteToActive(harness.successorId);

    expect(await harness.runSuccessorAttempt(harness.successorId)).toBe(
      'settlement_deferred',
    );

    harness.vehicleLockHeld.set(false);
    expect(await harness.runSuccessorAttempt(harness.successorId)).toBe(
      'settlement_deferred',
    );
    expect(
      harness.jobs.get(harness.successorId)!.orchestrationRuns,
    ).toBe(0);

    harness.completeAsRemoveOnComplete(PRIMARY_ID);
    expect(await harness.runSuccessorAttempt(harness.successorId)).toBe(
      'executed',
    );

    const nextPrimary = [...harness.jobs.entries()].find(
      ([id, j]) => id === PRIMARY_ID && j.state === 'delayed',
    );
    expect(nextPrimary).toBeDefined();
    expect(nextPrimary![1].opts.delay).toBe(30_000);

    harness.completeAsRemoveOnComplete(harness.successorId);
    expect(harness.jobs.has(harness.successorId)).toBe(false);
    expect(harness.jobs.has(PRIMARY_ID)).toBe(true);
    expect(harness.jobs.get(PRIMARY_ID)!.state).toBe('delayed');
  });

  describe('predecessor settlement matrix', () => {
    const successorData = {
      ...makePsJobData(),
      handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
      handoffPrimaryJobId: PRIMARY_ID,
    };

    it.each(HANDOFF_PREDECESSOR_UNSETTLED_STATES)(
      'defers when predecessor is %s',
      async (state) => {
        const queue = {
          getJob: jest.fn(async () => ({
            getState: async () => state,
            remove: jest.fn(),
          })),
        } as unknown as TripTrackingQueueLike;

        await expect(
          assertHandoffPredecessorSettled(successorData, queue),
        ).rejects.toBeInstanceOf(TripTrackingHandoffPredecessorNotSettledError);
        expect(isHandoffPredecessorUnsettledState(state)).toBe(true);
      },
    );

    it.each([...HANDOFF_PREDECESSOR_SETTLED_TERMINAL_STATES, 'absent'] as const)(
      'proceeds when predecessor is %s',
      async (state) => {
        const queue = {
          getJob:
            state === 'absent'
              ? jest.fn(async () => undefined)
              : jest.fn(async () => ({
                  getState: async () => state,
                  remove: jest.fn(),
                })),
        } as unknown as TripTrackingQueueLike;

        await expect(
          assertHandoffPredecessorSettled(successorData, queue),
        ).resolves.toBeUndefined();

        if (state !== 'absent') {
          expect(isHandoffPredecessorSettledTerminalState(state)).toBe(true);
        }
      },
    );
  });

  it('ACTIVE_TICK handoff defers on predecessor ACTIVE', async () => {
    const data = {
      ...makePsJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
      handoffPrimaryJobId: 'trip-at-veh-trip1',
    };
    const queue = {
      getJob: jest.fn(async () => ({
        getState: async () => 'active',
        remove: jest.fn(),
      })),
    } as unknown as TripTrackingQueueLike;

    await expect(assertHandoffPredecessorSettled(data, queue)).rejects.toBeInstanceOf(
      TripTrackingHandoffPredecessorNotSettledError,
    );
  });

  it('POSSIBLE_END_CHECK handoff defers on predecessor WAITING', async () => {
    const data = {
      ...makePsJobData(),
      trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
      handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
      handoffPrimaryJobId: 'trip-pec-veh-trip1',
    };
    const queue = {
      getJob: jest.fn(async () => ({
        getState: async () => 'waiting',
        remove: jest.fn(),
      })),
    } as unknown as TripTrackingQueueLike;

    await expect(assertHandoffPredecessorSettled(data, queue)).rejects.toBeInstanceOf(
      TripTrackingHandoffPredecessorNotSettledError,
    );
  });
});

describe('TripTrackingProcessor — R3C predecessor settlement deferral', () => {
  it('moveToDelayed + DelayedError on predecessor not settled (no FAILURE log)', async () => {
    const moveToDelayed = jest.fn().mockResolvedValue(undefined);
    const dimoPollLog = { create: jest.fn().mockResolvedValue({}) };
    const orchestration = {
      processPossibleStart: jest.fn(),
    };
    const trackingQueue = {
      getJob: jest.fn(async () => ({
        getState: async () => 'active',
        remove: jest.fn(),
      })),
    } as any;
    const processor = new TripTrackingProcessor(
      { dimoPollLog } as any,
      orchestration as any,
      trackingQueue,
    );

    await expect(
      processor.process({
        id: 'job-s',
        token: 'tok-s',
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
      'tok-s',
    );
    expect(orchestration.processPossibleStart).not.toHaveBeenCalled();
    expect(dimoPollLog.create).not.toHaveBeenCalled();
  });

  it('lock contention deferral remains separate from settlement deferral', async () => {
    const moveToDelayed = jest.fn().mockResolvedValue(undefined);
    const dimoPollLog = { create: jest.fn().mockResolvedValue({}) };
    const orchestration = {
      processPossibleStart: jest
        .fn()
        .mockRejectedValue(new TripTrackingHandoffLockContentionError(10_000)),
    };
    const trackingQueue = {
      getJob: jest.fn(async () => undefined),
    } as any;
    const processor = new TripTrackingProcessor(
      { dimoPollLog } as any,
      orchestration as any,
      trackingQueue,
    );

    await expect(
      processor.process({
        id: 'job-s',
        token: 'tok-s',
        data: {
          ...makePsJobData(),
          handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
          handoffPrimaryJobId: PRIMARY_ID,
        },
        moveToDelayed,
      } as any),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(orchestration.processPossibleStart).toHaveBeenCalledTimes(1);
    expect(dimoPollLog.create).not.toHaveBeenCalled();
  });

  it('provider failure after settlement still records FAILURE', async () => {
    const dimoPollLog = { create: jest.fn().mockResolvedValue({}) };
    const orchestration = {
      processPossibleStart: jest.fn().mockRejectedValue(new Error('provider down')),
    };
    const trackingQueue = {
      getJob: jest.fn(async () => undefined),
    } as any;
    const processor = new TripTrackingProcessor(
      { dimoPollLog } as any,
      orchestration as any,
      trackingQueue,
    );

    await expect(
      processor.process({
        data: {
          ...makePsJobData(),
          handoffKind: TRIP_TRACKING_HANDOFF_KINDS.STABLE_SUCCESSOR,
          handoffPrimaryJobId: PRIMARY_ID,
        },
      } as any),
    ).rejects.toThrow('provider down');

    expect(dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DimoPollStatus.FAILURE }),
      }),
    );
  });
});
