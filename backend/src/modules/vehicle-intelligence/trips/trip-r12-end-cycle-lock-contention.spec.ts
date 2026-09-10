import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
import {
  buildTripTrackingSuccessorJobId,
  cancelPendingTripTrackingJobs,
  enqueueEndCycleTripTrackingJob,
  enqueueStableTripTrackingJob,
  type TripTrackingQueueJobState,
  type TripTrackingQueueLike,
} from './trip-tracking-queue.util';
import {
  reconcilePossibleEndClockColumns,
  resolvePossibleEndBoundaryAnchor,
  resolvePossibleEndFsmDwellAnchor,
} from './trip-fsm-clock-contract';
import {
  evaluateEndCycleJobAdmission,
  resolveEndCycleToken,
} from './trip-end-cycle-reset';
import { TripDetectionState } from '@prisma/client';

const VEHICLE = 'veh-r12';
const TRIP_ID = '2bdc6e71-3822-4c9e-bda3-b46c681e6844';
const STOP_BOUNDARY = new Date('2026-09-10T20:01:15.000Z');
const PE_ENTERED = new Date('2026-09-10T20:04:37.793Z');
const CYCLE_TOKEN = PE_ENTERED.toISOString();

function jobData(
  trigger: TripTrackingJobData['trigger'],
  extra?: Partial<TripTrackingJobData>,
): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: 'org',
    dimoTokenId: 661,
    trigger,
    requestedAt: new Date().toISOString(),
    ...extra,
  };
}

function createQueueHarness(
  initial: Record<string, TripTrackingQueueJobState> = {},
  options?: {
    throwOnActiveRemove?: boolean;
  },
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
        if (
          options?.throwOnActiveRemove &&
          (state === 'active' || state === 'waiting-children')
        ) {
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

describe('R12 end-cycle lock contention + POSSIBLE_END clock durability', () => {
  describe('RED-1 — active BullMQ job must never be removed', () => {
    it('cancelPendingTripTrackingJobs preserves active primary and successor without remove()', async () => {
      const jobId = `trip-ev-${VEHICLE}-${TRIP_ID}`;
      const succId = buildTripTrackingSuccessorJobId(jobId);
      const queue = createQueueHarness(
        { [jobId]: 'active', [succId]: 'waiting-children' },
        { throwOnActiveRemove: true },
      );

      const result = await cancelPendingTripTrackingJobs({
        queue,
        jobIds: [jobId],
      });

      expect(result.removed).toBe(0);
      expect(result.activePreserved).toBe(2);
      expect(queue.removeAttempts).not.toContain(jobId);
      expect(queue.states.has(jobId)).toBe(true);
    });

    it('enqueueEndCycleTripTrackingJob does not throw when primary END_VALIDATION is active', async () => {
      const jobId = `trip-ev-${VEHICLE}-${TRIP_ID}`;
      const queue = createQueueHarness(
        { [jobId]: 'active' },
        { throwOnActiveRemove: true },
      );

      await expect(
        enqueueEndCycleTripTrackingJob({
          queue,
          jobName: 'trip-tracking',
          jobId,
          data: jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION, {
            endCycleToken: CYCLE_TOKEN,
          }),
          trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
        }),
      ).resolves.toBe('successor');

      expect(queue.removeAttempts).not.toContain(jobId);
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][2].jobId).toBe(
        buildTripTrackingSuccessorJobId(jobId),
      );
    });
  });

  describe('RED-2 — end-cycle enqueue while primary stable slot ACTIVE', () => {
    it('schedules deterministic successor instead of removing active primary', async () => {
      const jobId = `trip-ev-${VEHICLE}-${TRIP_ID}`;
      const queue = createQueueHarness({ [jobId]: 'active' });

      const first = await enqueueEndCycleTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId,
        data: jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION, {
          endCycleToken: CYCLE_TOKEN,
        }),
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
        delayMs: 0,
      });
      const second = await enqueueEndCycleTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId,
        data: jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION, {
          endCycleToken: CYCLE_TOKEN,
        }),
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
        delayMs: 0,
      });

      expect(first).toBe('successor');
      expect(second).toBe('skipped');
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.states.get(jobId)).toBe('active');
    });

    it('recycles waiting primary before stable enqueue', async () => {
      const jobId = `trip-ev-${VEHICLE}-${TRIP_ID}`;
      const queue = createQueueHarness({ [jobId]: 'waiting' });

      const outcome = await enqueueEndCycleTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId,
        data: jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION, {
          endCycleToken: CYCLE_TOKEN,
        }),
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
      });

      expect(outcome).toBe('primary');
      expect(queue.removeAttempts).toContain(jobId);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('RED-3 — POSSIBLE_END clock durability across scheduling failure', () => {
    const evidence = {
      stopBoundaryAt: STOP_BOUNDARY.toISOString(),
      stopBoundaryTrust: true,
      stopBoundarySource: 'provider_stationary_vls',
      possibleEndEnteredAt: PE_ENTERED.toISOString(),
      endValidationScheduledAt: '2026-09-10T20:16:37.000Z',
    };

    it('reconcilePossibleEndClockColumns restores null DB columns from evidence', () => {
      const patch = reconcilePossibleEndClockColumns({
        state: TripDetectionState.POSSIBLE_END,
        possibleEndAt: null,
        possibleEndEnteredAt: null,
        lastEvidenceSummary: evidence,
        workerNow: new Date('2026-09-10T20:20:00.000Z'),
      });

      expect(patch).toEqual({
        possibleEndAt: STOP_BOUNDARY,
        possibleEndEnteredAt: PE_ENTERED,
      });
    });

    it('anchor resolution uses trusted stop boundary when possibleEndAt column is null', () => {
      const workerNow = new Date('2026-09-10T20:20:00.000Z');
      const det = {
        possibleEndAt: null,
        possibleEndEnteredAt: null,
        updatedAt: workerNow,
        lastEvidenceSummary: evidence,
      };

      const boundary = resolvePossibleEndBoundaryAnchor(det, workerNow);
      const dwell = resolvePossibleEndFsmDwellAnchor(det, workerNow);

      expect(boundary).toEqual(STOP_BOUNDARY);
      expect(dwell).toEqual(PE_ENTERED);
      expect(workerNow.getTime() - boundary.getTime()).toBeGreaterThan(0);
      expect(workerNow.getTime() - dwell.getTime()).toBeGreaterThan(0);
    });

    it('resolveEndCycleToken falls back to evidence possibleEndEnteredAt only', () => {
      expect(
        resolveEndCycleToken({
          possibleEndEnteredAt: null,
          lastEvidenceSummary: evidence,
        }),
      ).toBe(CYCLE_TOKEN);
      expect(
        resolveEndCycleToken({
          possibleEndEnteredAt: null,
          lastEvidenceSummary: {
            endValidationScheduledAt: '2026-09-10T20:16:37.000Z',
          },
        }),
      ).toBeNull();
    });
  });

  describe('RED-4 — hard timeout cannot slide forever on updatedAt refresh', () => {
    const TRIP_END_TIMEOUT_MS = 30 * 60_000;
    const enteredAt = new Date('2026-09-10T20:04:37.793Z');

    it('modern R12 row with evidence anchor ignores refreshed updatedAt for dwell', () => {
      const tick1 = new Date('2026-09-10T20:10:00.000Z');
      const tick2 = new Date('2026-09-10T20:35:00.000Z');
      const evidence = {
        stopBoundaryAt: STOP_BOUNDARY.toISOString(),
        stopBoundaryTrust: true,
        possibleEndEnteredAt: enteredAt.toISOString(),
      };

      const detTick1 = {
        possibleEndAt: STOP_BOUNDARY,
        possibleEndEnteredAt: null,
        updatedAt: tick1,
        lastEvidenceSummary: evidence,
      };
      const detTick2 = {
        ...detTick1,
        updatedAt: tick2,
      };

      const dwell1 =
        tick1.getTime() -
        resolvePossibleEndFsmDwellAnchor(detTick1, tick1).getTime();
      const dwell2 =
        tick2.getTime() -
        resolvePossibleEndFsmDwellAnchor(detTick2, tick2).getTime();

      expect(dwell1).toBeGreaterThan(0);
      expect(dwell2).toBeGreaterThan(dwell1);
      expect(dwell2).toBeGreaterThanOrEqual(TRIP_END_TIMEOUT_MS);
    });
  });

  describe('RED-5 — resume + stale FINALIZE safety (AUD-007)', () => {
    it('stale FINALIZE token rejected after resume to ACTIVE_TRIP', () => {
      expect(
        evaluateEndCycleJobAdmission({
          det: {
            state: TripDetectionState.ACTIVE_TRIP,
            possibleEndEnteredAt: PE_ENTERED,
          },
          job: {
            endCycleToken: CYCLE_TOKEN,
            requestedAt: '2026-09-10T20:20:00.000Z',
          },
        }),
      ).toBe('stale_active_trip');
    });

    it('stale FINALIZE with mismatched token cannot commit', () => {
      expect(
        evaluateEndCycleJobAdmission({
          det: {
            state: TripDetectionState.POSSIBLE_END,
            possibleEndEnteredAt: PE_ENTERED,
          },
          job: {
            endCycleToken: '2026-09-10T19:00:00.000Z',
            requestedAt: '2026-09-10T20:20:00.000Z',
          },
        }),
      ).toBe('stale_token_mismatch');
    });
  });

  describe('RED-6 — no competing terminal writers / idempotency', () => {
    it('duplicate END_VALIDATION schedule while successor queued is suppressed', async () => {
      const jobId = `trip-ev-${VEHICLE}-${TRIP_ID}`;
      const succId = buildTripTrackingSuccessorJobId(jobId);
      const queue = createQueueHarness({
        [jobId]: 'active',
        [succId]: 'waiting',
      });

      const outcome = await enqueueStableTripTrackingJob({
        queue,
        jobName: 'trip-tracking',
        jobId,
        data: jobData(TRIP_TRACKING_TRIGGERS.END_VALIDATION, {
          endCycleToken: CYCLE_TOKEN,
        }),
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
      });

      expect(outcome).toBe('skipped');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('cancelPending preserves active end-cycle jobs under lock-contention semantics', async () => {
      const jobId = `trip-ev-${VEHICLE}-${TRIP_ID}`;
      const queue = createQueueHarness(
        { [jobId]: 'active' },
        { throwOnActiveRemove: true },
      );

      const result = await cancelPendingTripTrackingJobs({
        queue,
        jobIds: [jobId],
      });

      expect(result.activePreserved).toBe(1);
      expect(result.removed).toBe(0);
      expect(queue.removeAttempts).toHaveLength(0);
    });
  });
});
