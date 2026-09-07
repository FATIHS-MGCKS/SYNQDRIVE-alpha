import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { SnapshotWakeHandoffDeferError } from './snapshot-wake-handoff-defer.error';
import { createSnapshotWakeRedisTestHarness } from './snapshot-wake-redis.test-harness';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
} from './snapshot-wake.util';

const VEHICLE_ID = 'veh-r9d';
const TOKEN_ID = 42;

function makeWake(
  probeGeneration: 0 | 1 = 0,
  providerObservedAt: string | null = '2026-09-07T14:00:20.000Z',
) {
  return buildSnapshotWakeContext({
    reason: 'IGNITION_ON',
    signalName: 'isIgnitionOn',
    providerObservedAt: providerObservedAt
      ? new Date(providerObservedAt)
      : null,
    receivedAt: new Date('2026-09-07T14:00:21.000Z'),
    probeGeneration,
  });
}

function createHarness(fsmState: TripDetectionState = TripDetectionState.RESTING) {
  const redis = createSnapshotWakeRedisTestHarness();
  const queueAdd = jest.fn().mockResolvedValue(undefined);
  let canonicalState = 'active';
  let handoffState: string | null = null;
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
  const handoffAdd = jest.fn().mockImplementation(async () => {
    handoffState = 'waiting';
  });
  const handoffChangeDelay = jest.fn().mockResolvedValue(undefined);
  const handoffGetJob = jest.fn(async (jobId: string) => {
    if (jobId !== snapshotWakeHandoffJobId(VEHICLE_ID) || !handoffState) {
      return null;
    }
    return {
      getState: async () => handoffState,
      changeDelay: handoffChangeDelay,
      remove: async () => {
        handoffState = null;
      },
    };
  });

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        status: VehicleStatus.AVAILABLE,
        dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: TOKEN_ID },
      }),
    },
    vehicleTripDetectionState: {
      findUnique: jest.fn().mockResolvedValue({ state: fsmState }),
    },
  };

  const coordinator = new SnapshotWakeCoordinatorService(
    { add: queueAdd, getJob: queueGetJob } as never,
    { add: handoffAdd, getJob: handoffGetJob } as never,
    redis as never,
    prisma as never,
    undefined,
  );

  return {
    coordinator,
    redis,
    queueAdd,
    queueGetJob,
    handoffAdd,
    handoffChangeDelay,
    handoffGetJob,
    prisma,
    setCanonicalState: (state: string) => {
      canonicalState = state;
      if (state === 'none') {
        canonicalState = 'none';
      }
    },
  };
}

describe('SnapshotWakeCoordinatorService — R9D wake delivery seal', () => {
  describe('Blocker A — ACTIVE post-finalize coalesce tail race', () => {
    it('guarantees durable successor when wake coalesces against ACTIVE snapshot after empty finalize', async () => {
      const h = createHarness();
      const wake = makeWake(0);

      await h.coordinator.afterSnapshotJob({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        jobData: {
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'SCHEDULED',
        },
        claimedPendingWake: null,
        effectiveWakeContext: undefined,
        snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
        staleMonotonicSkipped: false,
        tripStartEvalError: false,
        possibleStartCreated: false,
        providerFetchFailed: false,
        fsmState: TripDetectionState.RESTING,
      });

      expect(h.handoffAdd).not.toHaveBeenCalled();
      expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);

      const outcome = await h.coordinator.requestSnapshot({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: wake,
      });

      expect(outcome).toBe('COALESCED');
      expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
      expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
      expect(h.handoffAdd).toHaveBeenCalled();
      expect(h.queueAdd).not.toHaveBeenCalled();

      h.setCanonicalState('completed');
      await h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID);
      expect(h.queueAdd).toHaveBeenCalledTimes(1);
      expect(await h.coordinator.loadSuccessorHandoff(VEHICLE_ID)).toBeNull();
    });

    it('does not create redundant successor for COALESCED_QUEUED waiting canonical job', async () => {
      const h = createHarness();
      h.setCanonicalState('waiting');

      const outcome = await h.coordinator.requestSnapshot({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: makeWake(0),
      });

      expect(outcome).toBe('COALESCED');
      expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
      expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(false);
      expect(h.handoffAdd).not.toHaveBeenCalled();
    });
  });

  describe('Blocker B — continuation authority', () => {
    it('RESTING + eligible allows successor', async () => {
      const h = createHarness(TripDetectionState.RESTING);
      h.setCanonicalState('completed');

      await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));
      await h.coordinator.reconcileOutstandingPendingWake(VEHICLE_ID);

      expect(h.handoffAdd).toHaveBeenCalled();
    });

    it('POSSIBLE_START does not schedule provider wake successor', async () => {
      const h = createHarness(TripDetectionState.POSSIBLE_START);
      h.setCanonicalState('completed');
      await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));

      await h.coordinator.reconcileOutstandingPendingWake(VEHICLE_ID);

      expect(h.handoffAdd).not.toHaveBeenCalled();
      expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
    });

    it('DISCONNECTED vehicle does not schedule provider wake successor', async () => {
      const h = createHarness(TripDetectionState.RESTING);
      h.prisma.vehicle.findUnique.mockResolvedValue({
        status: VehicleStatus.AVAILABLE,
        dimoVehicle: { connectionStatus: 'DISCONNECTED', tokenId: TOKEN_ID },
      });
      h.setCanonicalState('completed');
      await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));

      await h.coordinator.reconcileOutstandingPendingWake(VEHICLE_ID);

      expect(h.handoffAdd).not.toHaveBeenCalled();
      expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
    });

    it('state read failure preserves durable pending without provider fetch', async () => {
      const h = createHarness(TripDetectionState.RESTING);
      h.prisma.vehicleTripDetectionState.findUnique.mockRejectedValue(
        new Error('db down'),
      );
      h.setCanonicalState('completed');
      await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));

      await h.coordinator.reconcileOutstandingPendingWake(VEHICLE_ID);

      expect(h.handoffAdd).toHaveBeenCalledTimes(1);
      expect(h.queueAdd).not.toHaveBeenCalled();
      expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
      expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    });

    it('older pending CAS cannot delete newer concurrent wake', async () => {
      const h = createHarness(TripDetectionState.POSSIBLE_START);
      await h.coordinator.persistPendingWakeAtomic(
        VEHICLE_ID,
        TOKEN_ID,
        makeWake(0, '2026-09-07T14:00:20.000Z'),
      );
      const old = await h.coordinator.loadPendingWake(VEHICLE_ID);
      await h.coordinator.persistPendingWakeAtomic(
        VEHICLE_ID,
        TOKEN_ID,
        makeWake(0, '2026-09-07T14:00:50.000Z'),
      );

      const acked = await h.coordinator.acknowledgePendingWake(
        VEHICLE_ID,
        old!.version,
      );
      expect(acked).toBe(false);
      expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
      expect(
        (await h.coordinator.loadPendingWake(VEHICLE_ID))?.wakeContext
          .providerObservedAt,
      ).toBe('2026-09-07T14:00:50.000Z');
    });
  });

  describe('Blocker C — Redis READ_ERROR semantics', () => {
    it('handoff defers when successor Redis GET throws', async () => {
      const h = createHarness();
      await h.coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'WAKE_PROBE',
        wakeContext: makeWake(1),
        notBeforeMs: Date.now() - 1,
      });

      h.redis.get.mockRejectedValueOnce(new Error('redis timeout'));

      await expect(h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toMatchObject({
        reason: 'redis_read_error',
      });
      expect(h.queueAdd).not.toHaveBeenCalled();
    });

    it('handoff succeeds after transient Redis read failure on retry', async () => {
      const h = createHarness();
      h.setCanonicalState('completed');
      await h.coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'WAKE_PROBE',
        wakeContext: makeWake(1),
        notBeforeMs: Date.now() - 1,
      });

      h.redis.get.mockRejectedValueOnce(new Error('redis timeout'));
      await expect(h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toBeInstanceOf(
        SnapshotWakeHandoffDeferError,
      );

      await h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID);
      expect(h.queueAdd).toHaveBeenCalledTimes(1);
    });

    it('stale successor ACK reload READ_ERROR re-arms instead of false success', async () => {
      const h = createHarness();
      h.setCanonicalState('completed');
      await h.coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: makeWake(0),
        notBeforeMs: Date.now() - 1,
      });
      const first = await h.coordinator.loadSuccessorHandoff(VEHICLE_ID);

      h.queueAdd.mockImplementation(async () => {
        await h.coordinator.persistSuccessorHandoffAtomic({
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'PROVIDER_WAKE',
          wakeContext: makeWake(0, '2026-09-07T14:01:00.000Z'),
          notBeforeMs: Date.now() - 1,
        });
      });

      let successorReads = 0;
      const baseGet = h.redis.get.getMockImplementation();
      h.redis.get.mockImplementation(async (key: string) => {
        if (key === successorWakeRedisKey(VEHICLE_ID)) {
          successorReads += 1;
          if (successorReads >= 2) {
            throw new Error('reload read failed');
          }
        }
        return baseGet!(key);
      });

      await expect(h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toMatchObject({
        reason: 'redis_read_error',
      });
      expect(first?.version).toBeGreaterThan(0);
    });
  });

  describe('duplicate wake cardinality', () => {
    it('collapses duplicate ACTIVE coalesce writes into one bounded successor/handoff', async () => {
      const h = createHarness();
      const wake = makeWake(0, '2026-09-07T14:00:20.000Z');

      for (let i = 0; i < 3; i += 1) {
        await h.coordinator.requestSnapshot({
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'PROVIDER_WAKE',
          wakeContext: wake,
        });
      }

      expect(h.handoffAdd).toHaveBeenCalledTimes(1);
      expect(h.queueAdd).not.toHaveBeenCalled();
      const successor = await h.coordinator.loadSuccessorHandoff(VEHICLE_ID);
      expect(successor?.wakeContext.probeGeneration).toBe(0);
    });
  });
});
