import {
  enqueueStableSnapshotJob,
  type SnapshotQueueLike,
  type SnapshotQueueJobState,
} from './snapshot-wake-queue.util';

function createQueueHarness(
  initial: Record<string, SnapshotQueueJobState> = {},
): SnapshotQueueLike & {
  add: jest.Mock;
  getJob: jest.Mock;
  states: Map<string, SnapshotQueueJobState>;
  activeFetchCount: Map<string, number>;
} {
  const states = new Map<string, SnapshotQueueJobState>(Object.entries(initial));
  const activeFetchCount = new Map<string, number>();

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
      data: { vehicleId: string },
      opts: { jobId: string; delay?: number },
    ) => {
      if (states.get(opts.jobId) === 'active') {
        activeFetchCount.set(
          data.vehicleId,
          (activeFetchCount.get(data.vehicleId) ?? 0) + 1,
        );
        throw new Error('Job already exists duplicate');
      }
      states.set(opts.jobId, opts.delay ? 'delayed' : 'waiting');
    },
  );

  return { getJob, add, states, activeFetchCount };
}

describe('R9 — snapshot queue same-vehicle serialization', () => {
  const jobId = 'snapshot-veh-1';
  const data = { vehicleId: 'veh-1', dimoTokenId: 42 };

  it('does not enqueue parallel jobs while primary is ACTIVE', async () => {
    const queue = createQueueHarness({ [jobId]: 'active' });

    const wakeOutcome = await enqueueStableSnapshotJob({
      queue,
      jobName: 'snapshot',
      jobId,
      data: { ...data, origin: 'PROVIDER_WAKE' },
    });

    expect(wakeOutcome).toBe('COALESCED');
    expect(queue.add).not.toHaveBeenCalled();
    expect(queue.activeFetchCount.get('veh-1') ?? 0).toBe(0);
  });

  it('coalesces repeated wake requests while primary ACTIVE', async () => {
    const queue = createQueueHarness({ [jobId]: 'active' });

    for (let i = 0; i < 4; i += 1) {
      expect(
        await enqueueStableSnapshotJob({
          queue,
          jobName: 'snapshot',
          jobId,
          data: { ...data, origin: 'PROVIDER_WAKE' },
        }),
      ).toBe('COALESCED');
    }

    expect(queue.add).not.toHaveBeenCalled();
    expect(queue.states.size).toBe(1);
  });

  it('enqueues when no inflight job exists', async () => {
    const queue = createQueueHarness();

    expect(
      await enqueueStableSnapshotJob({
        queue,
        jobName: 'snapshot',
        jobId,
        data: { ...data, origin: 'PROVIDER_WAKE' },
      }),
    ).toBe('ENQUEUED');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('recycles terminal failed job before enqueue', async () => {
    const queue = createQueueHarness({ [jobId]: 'failed' });

    expect(
      await enqueueStableSnapshotJob({
        queue,
        jobName: 'snapshot',
        jobId,
        data: { ...data, origin: 'SCHEDULED' },
      }),
    ).toBe('RECOVERED_TERMINAL');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
