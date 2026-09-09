/**
 * SYNTHETIC scaling probe — measures scheduling/backoff operations only.
 * Not a production load proof. Provider calls are not executed.
 */
import { computeEmptyCoreBackoffMs } from './trip-empty-core-backoff';
import {
  enqueuePreemptiveTripTrackingJob,
  enqueueStableTripTrackingJob,
  type TripTrackingQueueLike,
} from './trip-tracking-queue.util';
import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';

type InMemoryQueue = TripTrackingQueueLike & {
  added: Array<{ jobId: string; delay: number }>;
};

function createInMemoryQueue(): InMemoryQueue {
  const store = new Map<string, { state: string; delay: number; data: unknown }>();
  const added: InMemoryQueue['added'] = [];
  return {
    added,
    getJob: async (jobId: string) => {
      const row = store.get(jobId);
      if (!row) return undefined;
      return {
        getState: async () => row.state,
        remove: async () => {
          store.delete(jobId);
        },
      };
    },
    add: async (_name, data, opts) => {
      added.push({ jobId: opts.jobId, delay: opts.delay ?? 0 });
      store.set(opts.jobId, {
        state: (opts.delay ?? 0) > 0 ? 'delayed' : 'waiting',
        delay: opts.delay ?? 0,
        data,
      });
    },
  };
}

function simulateFleetBackoff(params: {
  vehicleCount: number;
  deferralStreak: number;
  outage: boolean;
}): {
  vehicleCount: number;
  measuredEnqueueOps: number;
  maxDelayMs: number;
  minDelayMs: number;
  estimatedWallMsIfSequential: number;
  modelNote: string;
} {
  const queue = createInMemoryQueue();
  let measuredEnqueueOps = 0;
  let maxDelayMs = 0;
  let minDelayMs = Number.POSITIVE_INFINITY;

  for (let i = 0; i < params.vehicleCount; i += 1) {
    const streak = params.outage ? params.deferralStreak : 0;
    const delayMs = computeEmptyCoreBackoffMs({
      baseIntervalMs: 30_000,
      consecutiveDeferrals: streak,
      backoffBaseMs: 30_000,
      backoffMaxMs: 600_000,
      jitterRatio: 0.15,
    });
    measuredEnqueueOps += 1;
    maxDelayMs = Math.max(maxDelayMs, delayMs);
    minDelayMs = Math.min(minDelayMs, delayMs);
    void enqueueStableTripTrackingJob({
      queue,
      jobName: 'trip-tracking',
      jobId: `trip-at-veh-${i}-trip-${i}`,
      data: {
        vehicleId: `veh-${i}`,
        organizationId: 'org-scale',
        dimoTokenId: 1000 + i,
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        requestedAt: new Date().toISOString(),
      },
      trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      delayMs,
    });
  }

  return {
    vehicleCount: params.vehicleCount,
    measuredEnqueueOps,
    maxDelayMs,
    minDelayMs: Number.isFinite(minDelayMs) ? minDelayMs : 0,
    estimatedWallMsIfSequential: maxDelayMs,
    modelNote:
      'Measured enqueue/backoff only; excludes DIMO/provider/DB/Redis IO. Jitter fixed seedless.',
  };
}

describe('TDL-DEC-R11 synthetic scaling probe (NOT production load proof)', () => {
  const cohorts = [5, 1_000, 10_000] as const;

  for (const size of cohorts) {
    it(`normal operation — ${size} vehicles`, () => {
      const result = simulateFleetBackoff({
        vehicleCount: size,
        deferralStreak: 0,
        outage: false,
      });
      expect(result.measuredEnqueueOps).toBe(size);
      expect(result.maxDelayMs).toBeLessThanOrEqual(30_000 * 1.15);
      expect(result.minDelayMs).toBeGreaterThanOrEqual(30_000 * 0.85);
    });

    it(`broad data-gap outage — ${size} vehicles`, () => {
      const result = simulateFleetBackoff({
        vehicleCount: size,
        deferralStreak: 4,
        outage: true,
      });
      expect(result.measuredEnqueueOps).toBe(size);
      expect(result.maxDelayMs).toBeLessThanOrEqual(600_000);
      expect(result.minDelayMs).toBeGreaterThanOrEqual(30_000 * 0.85);
    });
  }

  it('wake preempt replaces delayed backoff without duplicate primary slots', async () => {
    const queue = createInMemoryQueue();
    const jobId = 'trip-at-veh-wake-trip-wake';
    await enqueueStableTripTrackingJob({
      queue,
      jobName: 'trip-tracking',
      jobId,
      data: {
        vehicleId: 'veh-wake',
        organizationId: 'org-scale',
        dimoTokenId: 42,
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        requestedAt: new Date().toISOString(),
      },
      trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      delayMs: 240_000,
    });
    const outcome = await enqueuePreemptiveTripTrackingJob({
      queue,
      jobName: 'trip-tracking',
      jobId,
      data: {
        vehicleId: 'veh-wake',
        organizationId: 'org-scale',
        dimoTokenId: 42,
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        requestedAt: new Date().toISOString(),
      },
      trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      delayMs: 0,
    });
    expect(outcome).toBe('preempted');
    expect(queue.added.filter((row) => row.jobId === jobId)).toHaveLength(2);
    expect(queue.added.at(-1)?.delay).toBe(0);
  });
});
