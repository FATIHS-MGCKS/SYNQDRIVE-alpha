import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import {
  ATOMIC_PENDING_WAKE_MERGE_SCRIPT,
  ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT,
} from './snapshot-wake-redis.scripts';
import { createSnapshotWakeRedisTestHarness } from './snapshot-wake-redis.test-harness';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
} from './snapshot-wake.util';
import { SUCCESSOR_HANDOFF_RECOVERY_KEY_PATTERN } from './snapshot-wake-recovery.util';

const VEHICLE_ID = 'veh-handoff-recovery';
const TOKEN_ID = 42;

function makeWake() {
  return buildSnapshotWakeContext({
    reason: 'IGNITION_ON',
    signalName: 'isIgnitionOn',
    providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
    receivedAt: new Date('2026-09-07T14:00:21.000Z'),
    probeGeneration: 0,
  });
}

type HandoffJobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed';

function createHarness(options?: {
  canonicalState?: string;
  failHandoffAdd?: boolean;
  failPendingPersist?: boolean;
  initialHandoffState?: HandoffJobState | 'none';
}) {
  const redis = createSnapshotWakeRedisTestHarness();
  if (options?.failPendingPersist) {
    const originalEval = redis.eval.getMockImplementation();
    redis.eval.mockImplementation(
      async (script: string, numKeys: number, key: string, ...args: string[]) => {
        if (script === ATOMIC_PENDING_WAKE_MERGE_SCRIPT) {
          return JSON.stringify({ ok: false, error: 'persist_failed' });
        }
        return originalEval!(script, numKeys, key, ...args);
      },
    );
  }

  const queueAdd = jest.fn().mockResolvedValue(undefined);
  let canonicalState = options?.canonicalState ?? 'completed';
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

  let handoffAddFail = options?.failHandoffAdd ?? false;
  let handoffJobState: HandoffJobState | 'none' =
    options?.initialHandoffState ?? 'none';
  const handoffAdd = jest.fn().mockImplementation(async () => {
    if (handoffAddFail) {
      throw new Error('bull down');
    }
    handoffJobState = 'waiting';
    return undefined;
  });
  const handoffGetJob = jest.fn(async (jobId: string) => {
    if (jobId !== snapshotWakeHandoffJobId(VEHICLE_ID)) return null;
    if (handoffJobState === 'none') return null;
    return {
      getState: async () => handoffJobState,
      remove: async () => {
        handoffJobState = 'none';
      },
      changeDelay: async () => undefined,
    };
  });

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
    { add: handoffAdd, getJob: handoffGetJob } as never,
    redis as never,
    prisma as never,
    tripMetrics as never,
  );

  return {
    coordinator,
    redis,
    queueAdd,
    handoffAdd,
    handoffGetJob,
    tripMetrics,
    prisma,
    setHandoffAddFail: (fail: boolean) => {
      handoffAddFail = fail;
    },
    setHandoffJobState: (state: HandoffJobState | 'none') => {
      handoffJobState = state;
    },
    setCanonicalState: (state: string) => {
      canonicalState = state;
    },
  };
}

describe('SnapshotWakeCoordinatorService — successor handoff recovery (R9H)', () => {
  it('re-arms orphaned successor after persist OK + initial handoffQueue.add failure', async () => {
    const h = createHarness({ failHandoffAdd: true, canonicalState: 'active' });

    const scheduleOutcome = await h.coordinator.scheduleDurableSuccessor({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(),
    });

    expect(scheduleOutcome).toBe('QUEUE_FAILED');
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.handoffAdd).toHaveBeenCalledTimes(1);
    expect(await h.coordinator.successorHandoffJobNeedsRearm(VEHICLE_ID)).toBe(true);

    h.setHandoffAddFail(false);
    h.handoffAdd.mockClear();

    const recovery = await h.coordinator.recoverOrphanedSuccessorHandoffs('0');
    expect(recovery.rearmed).toBe(1);
    expect(h.handoffAdd).toHaveBeenCalledTimes(1);
    expect(await h.coordinator.successorHandoffJobNeedsRearm(VEHICLE_ID)).toBe(false);

    h.queueAdd.mockClear();
    h.setCanonicalState('none');

    await h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID);

    expect(h.queueAdd).toHaveBeenCalledTimes(1);
    expect(h.queueAdd.mock.calls[0][2]?.jobId).toBe(snapshotJobId(VEHICLE_ID));
  });

  it('does not duplicate re-arm when handoff job is already waiting', async () => {
    const h = createHarness({ initialHandoffState: 'waiting' });
    await h.redis.eval(
      ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT,
      1,
      successorWakeRedisKey(VEHICLE_ID),
      JSON.stringify({
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: makeWake(),
        notBeforeMs: Date.now() - 1,
      }),
      String(Date.now()),
      '3600',
    );

    const recovery = await h.coordinator.recoverOrphanedSuccessorHandoffs('0');
    expect(recovery.rearmed).toBe(0);
    expect(h.handoffAdd).not.toHaveBeenCalled();
  });

  it('SCAN sweep discovers successor keys by pattern', async () => {
    const h = createHarness({ failHandoffAdd: true });
    await h.coordinator.scheduleDurableSuccessor({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(),
    });

    const prefix = SUCCESSOR_HANDOFF_RECOVERY_KEY_PATTERN.replace('*', '');
    const matchingKeys = [...h.redis.store.keys()].filter((k) => k.startsWith(prefix));
    expect(matchingKeys).toContain(successorWakeRedisKey(VEHICLE_ID));

    h.setHandoffAddFail(false);
    h.handoffAdd.mockClear();

    const recovery = await h.coordinator.recoverOrphanedSuccessorHandoffs('0');
    expect(recovery.scanned).toBeGreaterThanOrEqual(1);
    expect(recovery.rearmed).toBe(1);
  });
});

describe('SnapshotWakeCoordinatorService — pending persist classification (R9H)', () => {
  it('requestSnapshot pending persist failure returns PERSIST_FAILED and metric', async () => {
    const h = createHarness({ failPendingPersist: true, canonicalState: 'none' });

    const outcome = await h.coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(),
    });

    expect(outcome).toBe('PERSIST_FAILED');
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
    expect(h.tripMetrics.snapshotWakeTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'PERSIST_FAILED' }),
    );
  });
});
