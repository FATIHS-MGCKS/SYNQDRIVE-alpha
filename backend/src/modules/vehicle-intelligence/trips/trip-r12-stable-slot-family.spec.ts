import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
import {
  buildTripTrackingSuccessorJobId,
  enqueueEndCycleTripTrackingJob,
  type TripTrackingQueueJobState,
  type TripTrackingQueueLike,
} from './trip-tracking-queue.util';
import {
  inspectStableSlotFamily,
  planStableSlotFamilyEnqueue,
  stableSlotFamilyHasFutureAuthority,
  type StableSlotFamilyAction,
  type StableSlotMemberState,
} from './trip-tracking-stable-slot-family';

const VEHICLE = 'veh-r12-family';
const TRIP_ID = 'trip-family-001';
const JOB_ID = `trip-ev-${VEHICLE}-${TRIP_ID}`;
const SUCC_ID = buildTripTrackingSuccessorJobId(JOB_ID);
const CYCLE_TOKEN = '2026-09-10T20:04:37.793Z';

function jobData(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: 'org',
    dimoTokenId: 661,
    trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
    requestedAt: new Date().toISOString(),
    endCycleToken: CYCLE_TOKEN,
  };
}

function createQueueHarness(
  initial: Record<string, TripTrackingQueueJobState> = {},
): TripTrackingQueueLike & {
  add: jest.Mock;
  getJob: jest.Mock;
  states: Map<string, TripTrackingQueueJobState>;
  removeAttempts: string[];
} {
  const states = new Map<string, TripTrackingQueueJobState>(
    Object.entries(initial),
  );
  const removeAttempts: string[] = [];

  const getJob = jest.fn(async (jobId: string) => {
    const state = states.get(jobId);
    if (!state) return undefined;
    return {
      getState: async () => state,
      remove: async () => {
        removeAttempts.push(jobId);
        if (state === 'active' || state === 'waiting-children') {
          throw new Error(
            `Job ${jobId} could not be removed because it is locked by another worker`,
          );
        }
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

  return { getJob, add, states, removeAttempts };
}

type FamilyMatrixRow = {
  id: string;
  primary: StableSlotMemberState;
  successor: StableSlotMemberState;
  expectedPlan: StableSlotFamilyAction;
  expectedOutcome: 'primary' | 'successor' | 'skipped';
  mayRemovePrimary: boolean;
  mayRemoveSuccessor: boolean;
  mayAddPrimary: boolean;
  mayAddSuccessor: boolean;
};

const FAMILY_MATRIX: FamilyMatrixRow[] = [
  {
    id: '1 primary ABSENT + successor ACTIVE',
    primary: 'absent',
    successor: 'active',
    expectedPlan: 'skip_active_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '2 primary ABSENT + successor WAITING',
    primary: 'absent',
    successor: 'waiting',
    expectedPlan: 'skip_queued_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '3 primary COMPLETED + successor ACTIVE',
    primary: 'completed',
    successor: 'active',
    expectedPlan: 'skip_active_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '4 primary FAILED + successor ACTIVE',
    primary: 'failed',
    successor: 'active',
    expectedPlan: 'skip_active_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '5 primary WAITING + successor ACTIVE',
    primary: 'waiting',
    successor: 'active',
    expectedPlan: 'skip_active_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '6 primary DELAYED + successor ACTIVE',
    primary: 'delayed',
    successor: 'active',
    expectedPlan: 'skip_active_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '7 primary WAITING + successor WAITING',
    primary: 'waiting',
    successor: 'waiting',
    expectedPlan: 'skip_queued_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '8 primary ACTIVE + successor ACTIVE',
    primary: 'active',
    successor: 'active',
    expectedPlan: 'skip_active_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '9 primary ACTIVE + successor WAITING',
    primary: 'active',
    successor: 'waiting',
    expectedPlan: 'skip_queued_successor',
    expectedOutcome: 'skipped',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: false,
  },
  {
    id: '10 primary ACTIVE + successor ABSENT',
    primary: 'active',
    successor: 'absent',
    expectedPlan: 'handoff_to_successor',
    expectedOutcome: 'successor',
    mayRemovePrimary: false,
    mayRemoveSuccessor: false,
    mayAddPrimary: false,
    mayAddSuccessor: true,
  },
];

describe('R12 stable-slot family arbitration (RED-B)', () => {
  describe('pure planner matrix', () => {
    it.each(FAMILY_MATRIX)('$id → $expectedPlan', (row) => {
      const plan = planStableSlotFamilyEnqueue({
        primaryJobId: JOB_ID,
        successorJobId: SUCC_ID,
        primaryState: row.primary,
        successorState: row.successor,
      });
      expect(plan).toBe(row.expectedPlan);
      if (
        row.expectedOutcome === 'skipped' &&
        stableSlotFamilyHasFutureAuthority({
          primaryJobId: JOB_ID,
          successorJobId: SUCC_ID,
          primaryState: row.primary,
          successorState: row.successor,
        })
      ) {
        expect(row.expectedPlan).not.toBe('enqueue_primary');
      }
    });
  });

  describe('enqueueEndCycleTripTrackingJob enforces AT_MOST_ONE future authority', () => {
    it.each(FAMILY_MATRIX)('$id', async (row) => {
      const initial: Record<string, TripTrackingQueueJobState> = {};
      if (row.primary !== 'absent') initial[JOB_ID] = row.primary;
      if (row.successor !== 'absent') initial[SUCC_ID] = row.successor;

      const queue = createQueueHarness(initial);
      const addCallsBefore = queue.add.mock.calls.length;

      const outcome = await enqueueEndCycleTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId: JOB_ID,
        data: jobData(),
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
      });

      expect(outcome).toBe(row.expectedOutcome);

      if (row.mayRemovePrimary) {
        expect(queue.removeAttempts).toContain(JOB_ID);
      } else {
        expect(queue.removeAttempts).not.toContain(JOB_ID);
      }
      if (row.mayRemoveSuccessor) {
        expect(queue.removeAttempts).toContain(SUCC_ID);
      } else {
        expect(queue.removeAttempts).not.toContain(SUCC_ID);
      }

      const addDelta = queue.add.mock.calls.length - addCallsBefore;
      if (row.mayAddPrimary) {
        expect(addDelta).toBe(1);
        expect(queue.add.mock.calls.at(-1)?.[2].jobId).toBe(JOB_ID);
      } else if (row.mayAddSuccessor) {
        expect(addDelta).toBe(1);
        expect(queue.add.mock.calls.at(-1)?.[2].jobId).toBe(SUCC_ID);
      } else {
        expect(addDelta).toBe(0);
      }
    });

    it('never attempts remove() on active family members', async () => {
      const queue = createQueueHarness({
        [JOB_ID]: 'active',
        [SUCC_ID]: 'waiting-children',
      });

      await enqueueEndCycleTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId: JOB_ID,
        data: jobData(),
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
      });

      expect(queue.removeAttempts).toHaveLength(0);
    });
  });

  describe('inspectStableSlotFamily', () => {
    it('reads primary and deterministic successor states', async () => {
      const queue = createQueueHarness({
        [JOB_ID]: 'completed',
        [SUCC_ID]: 'active',
      });
      const family = await inspectStableSlotFamily(queue, JOB_ID);
      expect(family).toEqual({
        primaryJobId: JOB_ID,
        successorJobId: SUCC_ID,
        primaryState: 'completed',
        successorState: 'active',
      });
    });
  });
});
