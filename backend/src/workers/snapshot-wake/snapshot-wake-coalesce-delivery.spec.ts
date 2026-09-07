import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT } from './snapshot-wake-redis.scripts';
import { createSnapshotWakeRedisTestHarness } from './snapshot-wake-redis.test-harness';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  successorWakeRedisKey,
} from './snapshot-wake.util';

const VEHICLE_ID = 'veh-coalesce-delivery';
const TOKEN_ID = 42;

function makeWake(probeGeneration: 0 | 1 = 0) {
  return buildSnapshotWakeContext({
    reason: 'IGNITION_ON',
    signalName: 'isIgnitionOn',
    providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
    receivedAt: new Date('2026-09-07T14:00:21.000Z'),
    probeGeneration,
  });
}

function createHarness(options?: {
  canonicalState?: string;
  duplicateOnAdd?: boolean;
  failSuccessorPersist?: boolean;
  failHandoffAdd?: boolean;
}) {
  const redis = createSnapshotWakeRedisTestHarness();
  if (options?.failSuccessorPersist) {
    const originalEval = redis.eval.getMockImplementation();
    redis.eval.mockImplementation(
      async (script: string, numKeys: number, key: string, ...args: string[]) => {
        if (script === ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT) {
          return JSON.stringify({ ok: false, error: 'persist_failed' });
        }
        return originalEval!(script, numKeys, key, ...args);
      },
    );
  }

  const queueAdd = jest.fn().mockImplementation(async () => {
    if (options?.duplicateOnAdd) {
      const err = new Error('Job already exists');
      err.message = 'duplicate job id';
      throw err;
    }
    return undefined;
  });
  let canonicalState = options?.canonicalState ?? 'active';
  const queueGetJob = jest.fn(async (jobId: string) => {
    if (jobId !== snapshotJobId(VEHICLE_ID)) return null;
    if (canonicalState === 'none') return null;
    return {
      getState: async () => canonicalState,
      remove: async () => {
        canonicalState = 'none';
      },
    };
  });
  const handoffAdd = options?.failHandoffAdd
    ? jest.fn().mockRejectedValue(new Error('bull down'))
    : jest.fn().mockResolvedValue(undefined);

  const tripMetrics = {
    snapshotWakeTotal: { inc: jest.fn() },
  };

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        status: VehicleStatus.AVAILABLE,
        dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: TOKEN_ID },
      }),
    },
    vehicleTripDetectionState: {
      findUnique: jest.fn().mockResolvedValue({ state: TripDetectionState.RESTING }),
    },
  };

  const coordinator = new SnapshotWakeCoordinatorService(
    { add: queueAdd, getJob: queueGetJob } as never,
    { add: handoffAdd, getJob: jest.fn().mockResolvedValue(null) } as never,
    redis as never,
    prisma as never,
    tripMetrics as never,
  );

  return { coordinator, redis, queueAdd, handoffAdd, tripMetrics, prisma };
}

describe('SnapshotWakeCoordinatorService — coalesce delivery contract', () => {
  it('a) COALESCED_ACTIVE + successor persist failure returns PERSIST_FAILED and metric', async () => {
    const h = createHarness({
      canonicalState: 'active',
      failSuccessorPersist: true,
    });
    const wake = makeWake(0);

    const outcome = await h.coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: wake,
    });

    expect(outcome).toBe('PERSIST_FAILED');
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(false);
    expect(h.handoffAdd).not.toHaveBeenCalled();
    expect(h.tripMetrics.snapshotWakeTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'PERSIST_FAILED' }),
    );
  });

  it('b) COALESCED_ACTIVE + handoff queue add failure returns QUEUE_FAILED and metric', async () => {
    const h = createHarness({
      canonicalState: 'active',
      failHandoffAdd: true,
    });

    const outcome = await h.coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    expect(outcome).toBe('QUEUE_FAILED');
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.tripMetrics.snapshotWakeTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'QUEUE_FAILED' }),
    );
  });

  it('c) COALESCED_UNKNOWN + successor persist failure returns PERSIST_FAILED and metric', async () => {
    const h = createHarness({
      canonicalState: 'none',
      duplicateOnAdd: true,
      failSuccessorPersist: true,
    });

    const outcome = await h.coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    expect(outcome).toBe('PERSIST_FAILED');
    expect(h.tripMetrics.snapshotWakeTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'PERSIST_FAILED' }),
    );
  });

  it('d) COALESCED_UNKNOWN + handoff queue add failure returns QUEUE_FAILED and metric', async () => {
    const h = createHarness({
      canonicalState: 'none',
      duplicateOnAdd: true,
      failHandoffAdd: true,
    });

    const outcome = await h.coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    expect(outcome).toBe('QUEUE_FAILED');
    expect(h.tripMetrics.snapshotWakeTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'QUEUE_FAILED' }),
    );
  });

  it('scheduleDurableSuccessor returns PERSIST_FAILED when successor persist fails', async () => {
    const h = createHarness({ failSuccessorPersist: true, canonicalState: 'completed' });

    const outcome = await h.coordinator.scheduleDurableSuccessor({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    expect(outcome).toBe('PERSIST_FAILED');
  });
});
